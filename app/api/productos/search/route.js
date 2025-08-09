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
} from "firebase/firestore";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const lim = Math.min(parseInt(searchParams.get("limit") || "50", 10), 500);
    if (!q) return NextResponse.json({ items: [] });

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

    for (const a of anchors) {
      if (items.length >= lim) break;
      await tryNombreRange(a);
    }

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
    if (items.length < lim) await tryByFirstChar(firstLower);
    if (items.length < lim) await tryByFirstChar(firstUpper);
    if (items.length < lim && q.length >= 2)
      await tryByFirstChar(q.substring(0, 2));
    if (items.length < lim && q.length >= 3)
      await tryByFirstChar(q.substring(0, 3));

    // Devolver únicos por id
    let uniq = Object.values(
      items.reduce((acc, it) => {
        acc[it.id] = it;
        return acc;
      }, {})
    );

    // Filtrado final en memoria usando normalización robusta
    uniq = uniq.filter((it) => {
      const nombre = `${it.nombre || ""}`;
      const nombreNorm = normalize(nombre);
      return nombreNorm.includes(qNorm);
    });

    return NextResponse.json({ items: uniq.slice(0, lim) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
