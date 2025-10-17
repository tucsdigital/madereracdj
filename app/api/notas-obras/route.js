import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

// POST - Crear nueva nota
export async function POST(request) {
  try {
    const body = await request.json();
    const { nombreObra, productos, fecha, userId, userEmail } = body;

    if (!nombreObra || !fecha || !userId) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }

    const notaData = {
      nombreObra,
      productos: productos || "",
      fecha,
      userId,
      userEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, "notasObras"), notaData);

    return NextResponse.json(
      {
        success: true,
        message: "Nota creada exitosamente",
        id: docRef.id,
        nota: {
          id: docRef.id,
          ...notaData,
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
    const { notaId, nombreObra, productos, fecha, userId } = body;

    if (!notaId || !nombreObra || !fecha || !userId) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }

    const notaRef = doc(db, "notasObras", notaId);
    const updateData = {
      nombreObra,
      productos: productos || "",
      fecha,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(notaRef, updateData);

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
    const { notaId, userId } = body;

    if (!notaId || !userId) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }

    await deleteDoc(doc(db, "notasObras", notaId));

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

