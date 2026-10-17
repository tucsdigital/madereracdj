import { NextResponse } from "next/server";
import { verifyCommerceRequest } from "@/lib/ecommerce-auth";
import { quoteOrder } from "@/lib/ecommerce-quote";

export async function POST(request) {
  try {
    const body = await request.text();
    verifyCommerceRequest(request, body);
    return NextResponse.json(await quoteOrder(JSON.parse(body)));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
