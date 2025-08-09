import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAt,
  endAt,
  where,
} from "firebase/firestore";

// Cache simple en memoria (por proceso) con TTL
const queryCache = new Map(); // key -> { at: number, items: any[] }
const CACHE_TTL_MS = 20_000; // 20s

function getCached(key) {
  const hit = queryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    queryCache.delete(key);
    return null;
  }
  return hit.items;
}

function setCached(key, items) {
  // Evitar crecer sin límite
  if (queryCache.size > 100) {
    // eliminar la entrada más antigua
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [k, v] of queryCache) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey) queryCache.delete(oldestKey);
  }
  queryCache.set(key, { at: Date.now(), items });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const lim = Math.min(parseInt(searchParams.get("limit") || "50", 10), 500);
    if (!q) return NextResponse.json({ items: [] });

    const cacheKey = JSON.stringify({ q, lim });
    const cached = getCached(cacheKey);
    if (cached) return NextResponse.json({ items: cached.slice(0, lim) });

    const items = [];
    const pushDocs = (snap) => {
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    };

    const normalize = (s) =>
      (s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "")
        .replace(/[x×]/g, "x")
        .replace(/[,]/g, ".");
    const qNorm = normalize(q);
    const titleCase = (s) =>
      (s || "").replace(
        /\w\S*/g,
        (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
      );
    const qLower = q.toLowerCase();
    const qUpper = q.toUpperCase();
    const qCapFirst = q.charAt(0).toUpperCase() + q.slice(1);
    const qTitle = titleCase(q);
    const first = q[0] || "";
    const firstLower = first.toLowerCase();
    const firstUpper = first.toUpperCase();

    // Búsqueda por nombre (sin campos adicionales)

    // Fallback: ordenar por nombre (puede ser sensible a mayúsculas)
    const tryNombreRange = async (needle) => {
      try {
        const qq = query(
          collection(db, "productos"),
          orderBy("nombre"),
          startAt(needle),
          endAt(needle + "\uf8ff"),
          limit(Math.max(50, Math.floor(lim / 2)))
        );
        const snap = await getDocs(qq);
        pushDocs(snap);
      } catch (_) {}
    };

    // Construir anclas de prefijo (para familias tipo "... X 6 X ")
    const lower = q.toLowerCase();
    const idxX = Math.max(
      lower.lastIndexOf(" x "),
      lower.lastIndexOf(" x"),
      lower.lastIndexOf("x "),
      lower.lastIndexOf("x")
    );
    const anchors = new Set();
    anchors.add(q);
    anchors.add(qCapFirst);
    anchors.add(qTitle);
    anchors.add(qUpper);
    anchors.add(qLower);
    // variantes de X/x
    anchors.add(q.replace(/ X /g, " x "));
    anchors.add(q.replace(/ x /g, " X "));
    anchors.add(q.replace(/×/g, "x"));
    if (idxX > 0) {
      const base = q.substring(0, idxX + 1).trim();
      const capFirst = base.charAt(0).toUpperCase() + base.slice(1);
      const title = titleCase(base);
      const bases = new Set([base, capFirst, title]);
      for (const b of bases) {
        anchors.add(b);
        anchors.add((b + " ").replace(/ X /g, " x "));
        anchors.add((b + " ").replace(/ x /g, " X "));
        anchors.add((b + " ").replace(/×/g, "x"));
      }
    }

    // Expandir variantes con espacios alrededor de x/× (para consultas tipo 1x4x4)
    const spaced = new Set();
    for (const a of anchors) {
      const a1 = a.replace(/\s*[x×]\s*/gi, " x ");
      const a2 = a1.replace(/\s*x\s*/gi, " X ");
      spaced.add(a1);
      spaced.add(a2);
    }
    spaced.forEach((s) => anchors.add(s));

    const runNameQueries = async () => {
      const anchorArr = Array.from(anchors).slice(0, 6); // limitar variantes para performance
      const tasks = anchorArr.map((a) =>
        tryNombreRange(a).catch(() => {})
      );
      await Promise.all(tasks);
    };

    // Fallback adicional: por primera letra/prefijos cortos en mayúscula/minúscula, luego filtrar en memoria
    const tryByFirstChar = async (ch) => {
      if (!ch) return;
      try {
        const base = ch;
        const qq = query(
          collection(db, "productos"),
          orderBy("nombre"),
          startAt(base),
          endAt(base + "\uf8ff"),
          limit(Math.max(100, Math.floor(lim / 2)))
        );
        const snap = await getDocs(qq);
        pushDocs(snap);
      } catch (_) {}
    };
    const runPrefixQueries = async () => {
      const tasks = [];
      tasks.push(tryByFirstChar(firstLower));
      tasks.push(tryByFirstChar(firstUpper));
      if (q.length >= 2) tasks.push(tryByFirstChar(q.substring(0, 2)));
      if (q.length >= 3) tasks.push(tryByFirstChar(q.substring(0, 3)));
      await Promise.all(tasks.map((t) => t.catch(() => {})));
    };

    // Si la consulta parece una búsqueda por dimensiones (p. ej. 1x6x4.90),
    // complementar con un barrido focalizado sobre categoría Maderas
    const isDimensionQuery = (() => {
      // quitar todo lo que no sea dígitos, punto o x y comprobar patrón básico
      const onlyDims = qNorm.replace(/[^0-9.x]/g, "");
      if (!onlyDims.includes("x")) return false;
      // Debe tener 2 o 3 números separados por x
      const parts = onlyDims.split("x").filter(Boolean);
      return parts.length === 2 || parts.length === 3;
    })();

    const parseFloatSafe = (v) => {
      const n = parseFloat(String(v).toString().replace(/,/g, "."));
      return Number.isFinite(n) ? n : null;
    };

    // Primero ejecutar en paralelo lo que corresponda para reducir latencia total
    if (isDimensionQuery) {
      // Para consultas dimensionales, omitir el barrido pesado por nombre y
      // probar primero consultas exactas por igualdad en Firestore (mucho más rápidas)
      const onlyDims = qNorm.replace(/[^0-9.x]/g, "");
      const parts = onlyDims
        .split("x")
        .filter(Boolean)
        .map((p) => parseFloat(p));
      const round2 = (n) => Math.round(n * 100) / 100;
      const [d1, d2, d3] = [parts[0], parts[1], parts[2]].map((v) =>
        Number.isFinite(v) ? round2(v) : null
      );

      const dimQueries = [];
      // 3 dimensiones: alto x ancho x largo (y una permutación básica)
      if (parts.length === 3) {
        dimQueries.push(
          getDocs(
            query(
              collection(db, "productos"),
              where("categoria", "==", "Maderas"),
              where("alto", "==", d1),
              where("ancho", "==", d2),
              where("largo", "==", d3),
              limit(lim)
            )
          )
        );
        // Permutación: ancho/alto invertidos
        dimQueries.push(
          getDocs(
            query(
              collection(db, "productos"),
              where("categoria", "==", "Maderas"),
              where("alto", "==", d2),
              where("ancho", "==", d1),
              where("largo", "==", d3),
              limit(lim)
            )
          )
        );
      }
      // 2 dimensiones: probar pares (alto, ancho), (alto, largo), (ancho, largo)
      if (parts.length === 2) {
        dimQueries.push(
          getDocs(
            query(
              collection(db, "productos"),
              where("categoria", "==", "Maderas"),
              where("alto", "==", d1),
              where("ancho", "==", d2),
              limit(lim)
            )
          )
        );
        dimQueries.push(
          getDocs(
            query(
              collection(db, "productos"),
              where("categoria", "==", "Maderas"),
              where("alto", "==", d1),
              where("largo", "==", d2),
              limit(lim)
            )
          )
        );
        dimQueries.push(
          getDocs(
            query(
              collection(db, "productos"),
              where("categoria", "==", "Maderas"),
              where("ancho", "==", d1),
              where("largo", "==", d2),
              limit(lim)
            )
          )
        );
      }

      try {
        const snaps = await Promise.all(dimQueries.map((p) => p.catch(() => null)));
        snaps
          .filter(Boolean)
          .forEach((snap) => snap.forEach((d) => items.push({ id: d.id, ...d.data() })));
      } catch (_) {}

      // Si aún no llegamos al límite, como fallback rápido: hacer un barrido ligero por nombre
      if (items.length < lim) {
        await runNameQueries();
      }
    } else {
      // No dimensional: correr búsquedas por nombre y prefijos en paralelo
      await Promise.all([runNameQueries(), runPrefixQueries()]);
    }

    // Devolver únicos por id
    let uniq = Object.values(
      items.reduce((acc, it) => {
        acc[it.id] = it;
        return acc;
      }, {})
    );

    // Filtrado final en memoria usando normalización robusta y coincidencia por dimensiones
    const approxEq = (a, b, tol = 0.01) =>
      Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

    const matchesByDimensions = (it) => {
      // extraer posibles dimensiones del item
      const alto = parseFloatSafe(it.alto);
      const ancho = parseFloatSafe(it.ancho);
      const largo = parseFloatSafe(it.largo);

      // parsear dimensiones buscadas
      const parts = qNorm
        .replace(/[^0-9.x]/g, "")
        .split("x")
        .filter((p) => p.length > 0)
        .map((p) => parseFloatSafe(p));

      if (parts.length < 2 || parts.length > 3) return false;
      const [d1, d2, d3] = parts;

      // Si el item no tiene suficientes dimensiones numéricas, intentar por nombre
      const nombre = `${it.nombre || ""}`;
      const nombreNorm = normalize(nombre);
      const byName = nombreNorm.includes(qNorm);

      // Coincidencia flexible:
      // - Si hay 3 valores buscados, comparar (alto, ancho, largo) con tolerancia cualquiera de los que estén presentes
      // - Si hay 2 valores, comparar (alto, largo) o (ancho, largo) o (alto, ancho)
      const dims = [alto, ancho, largo].filter((v) => Number.isFinite(v));
      if (dims.length === 0) return byName; // sin datos de dimensiones, caer a nombre

      const has3 = Number.isFinite(alto) && Number.isFinite(ancho) && Number.isFinite(largo);
      if (parts.length === 3 && has3) {
        // probar todas las permutaciones razonables, pero en madera solemos usar alto x ancho x largo
        const matchOrdered = approxEq(alto, d1) && approxEq(ancho, d2) && approxEq(largo, d3);
        return matchOrdered || byName;
      }

      if (parts.length === 2) {
        const m1 = Number.isFinite(alto) && Number.isFinite(ancho) && approxEq(alto, d1) && approxEq(ancho, d2);
        const m2 = Number.isFinite(alto) && Number.isFinite(largo) && approxEq(alto, d1) && approxEq(largo, d2);
        const m3 = Number.isFinite(ancho) && Number.isFinite(largo) && approxEq(ancho, d1) && approxEq(largo, d2);
        return m1 || m2 || m3 || byName;
      }

      // parts.length === 3 pero el item no tiene las 3 dims; usar nombre
      return byName;
    };

    uniq = uniq.filter((it) => {
      const nombre = `${it.nombre || ""}`;
      const nombreNorm = normalize(nombre);
      const byName = nombreNorm.includes(qNorm);
      return byName || (isDimensionQuery && matchesByDimensions(it));
    });

    const result = uniq.slice(0, lim);
    setCached(cacheKey, result);
    return NextResponse.json({ items: result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
