import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyCommerceRequest } from "@/lib/ecommerce-auth";

export async function POST(request, { params }) {
  try {
    const raw = await request.text();
    verifyCommerceRequest(request, raw);
    const { type } = JSON.parse(raw);
    if (!["pending", "confirmation"].includes(type) || !/^[a-zA-Z0-9_-]{16,100}$/.test(params.id)) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    await getAdminDb().collection("orders").doc(params.id).update({ [`emails.${type}`]: new Date().toISOString() });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
