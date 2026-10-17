import crypto from "crypto";

export function verifyCommerceRequest(request, rawBody) {
  const secret = process.env.EXTERNAL_API_SHARED_SECRET;
  const key = process.env.EXTERNAL_API_API_KEY;
  const timestamp = request.headers.get("X-Request-Timestamp") || "";
  const signature = request.headers.get("X-Request-Signature") || "";
  if (!secret || !key) throw Object.assign(new Error("Integración no configurada"), { status: 503 });
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex");
  if (request.headers.get("X-Api-Key") !== key ||
      request.headers.get("X-Request-Hash") !== "HMAC-SHA256" ||
      !Number.isFinite(Number(timestamp)) || Math.abs(Date.now() - Number(timestamp)) > 300000 ||
      signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw Object.assign(new Error("Firma de integración inválida"), { status: 401 });
  }
}
