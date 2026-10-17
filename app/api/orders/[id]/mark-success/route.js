import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "El pago se confirma exclusivamente por notificación verificada del proveedor" }, { status: 410 });
}
