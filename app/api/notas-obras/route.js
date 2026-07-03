import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

const parseSlashDateParts = (value) => {
  if (!value || typeof value !== "string") return null;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const y = Number(m[3]);
  if (!y || !a || !b) return null;
  if (a > 12 && b <= 12) return { y, m: b, d: a };
  if (b > 12 && a <= 12) return { y, m: a, d: b };
  return { y, m: b, d: a };
};

const toUtcNoonDate = (value) => {
  if (!value || typeof value !== "string") return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const d = Number(iso[3]);
    if (!y || !mo || !d) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const slash = parseSlashDateParts(value);
  if (slash) {
    const dt = new Date(Date.UTC(slash.y, slash.m - 1, slash.d, 12, 0, 0));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const dt = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 12, 0, 0));
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const dateToKey = (dt) => {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const buildDateKeysInclusive = (desde, hasta) => {
  const start = toUtcNoonDate(desde);
  const end = toUtcNoonDate(hasta);
  if (!start || !end) return [];
  if (start.getTime() > end.getTime()) return [];
  const keys = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    keys.push(dateToKey(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return keys;
};

const makeGroupId = () =>
  `grp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// POST - Crear nueva nota
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      userId,
      userEmail,
      empleadoId,
      empleadoNombre,
      barrioLote,
      numObra,
      telefono,
      detalle,
      fecha,
      fechaDesde,
      fechaHasta,
    } = body;

    const desde = fechaDesde || fecha || "";
    const hasta = fechaHasta || fecha || "";
    const dateKeys = buildDateKeysInclusive(desde, hasta);

    if (!userId || dateKeys.length === 0) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }

    const groupId = makeGroupId();
    const baseData = {
      groupId,
      empleadoId: String(empleadoId || ""),
      empleadoNombre: String(empleadoNombre || ""),
      barrioLote: String(barrioLote || ""),
      numObra: String(numObra || ""),
      telefono: String(telefono || ""),
      detalle: String(detalle || ""),
      fechaDesde: String(desde || ""),
      fechaHasta: String(hasta || ""),
      userId,
      userEmail: userEmail || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const batch = writeBatch(db);
    const colRef = collection(db, "notasObras");
    const createdIds = [];
    for (const k of dateKeys) {
      const ref = doc(colRef);
      createdIds.push(ref.id);
      batch.set(ref, { ...baseData, fecha: k });
    }
    await batch.commit();

    return NextResponse.json(
      {
        success: true,
        message: "Nota creada exitosamente",
        groupId,
        ids: createdIds,
        nota: {
          ...baseData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error al crear nota:", error);
    return NextResponse.json(
      { error: "Error al crear la nota", details: error.message },
      { status: 500 }
    );
  }
}

// PUT - Actualizar nota existente
export async function PUT(request) {
  try {
    const body = await request.json();
    const {
      notaId,
      groupId,
      userId,
      empleadoId,
      empleadoNombre,
      barrioLote,
      numObra,
      telefono,
      detalle,
      fecha,
      fechaDesde,
      fechaHasta,
    } = body;

    const desde = fechaDesde || fecha || "";
    const hasta = fechaHasta || fecha || "";
    const dateKeys = buildDateKeysInclusive(desde, hasta);

    if (!notaId || !userId || dateKeys.length === 0) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }

    const updateData = {
      empleadoId: String(empleadoId || ""),
      empleadoNombre: String(empleadoNombre || ""),
      barrioLote: String(barrioLote || ""),
      numObra: String(numObra || ""),
      telefono: String(telefono || ""),
      detalle: String(detalle || ""),
      fechaDesde: String(desde || ""),
      fechaHasta: String(hasta || ""),
      updatedAt: serverTimestamp(),
    };

    if (groupId) {
      const q = query(collection(db, "notasObras"), where("groupId", "==", String(groupId)));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      const colRef = collection(db, "notasObras");
      for (const k of dateKeys) {
        const ref = doc(colRef);
        batch.set(ref, { ...updateData, groupId: String(groupId), fecha: k, userId, createdAt: serverTimestamp() });
      }
      await batch.commit();
    } else {
      const notaRef = doc(db, "notasObras", notaId);
      await updateDoc(notaRef, {
        ...updateData,
        fecha: String(dateKeys[0] || fecha || ""),
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Nota actualizada exitosamente",
        nota: {
          id: notaId,
          ...updateData,
          updatedAt: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al actualizar nota:", error);
    return NextResponse.json(
      { error: "Error al actualizar la nota", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar nota
export async function DELETE(request) {
  try {
    const body = await request.json();
    const { notaId, userId, groupId } = body;

    if (!notaId || !userId) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }

    if (groupId) {
      const q = query(collection(db, "notasObras"), where("groupId", "==", String(groupId)));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } else {
      await deleteDoc(doc(db, "notasObras", notaId));
    }

    return NextResponse.json(
      {
        success: true,
        message: "Nota eliminada exitosamente",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al eliminar nota:", error);
    return NextResponse.json(
      { error: "Error al eliminar la nota", details: error.message },
      { status: 500 }
    );
  }
}
