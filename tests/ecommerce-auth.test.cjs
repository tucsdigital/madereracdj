const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../lib/ecommerce-auth.js"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(require, mod, mod.exports);

process.env.EXTERNAL_API_API_KEY = "test-api-key";
process.env.EXTERNAL_API_SHARED_SECRET = "test-shared-secret";

function signedRequest(body) {
  const timestamp = String(Date.now());
  const signature = crypto.createHmac("sha256", process.env.EXTERNAL_API_SHARED_SECRET)
    .update(`${timestamp}:`)
    .update(body)
    .digest("hex");
  const headers = new Headers({
    "X-Api-Key": process.env.EXTERNAL_API_API_KEY,
    "X-Request-Timestamp": timestamp,
    "X-Request-Hash": "HMAC-SHA256",
    "X-Request-Signature": signature,
  });
  return { headers };
}

test("verifica la firma binaria del multipart sin convertir el archivo a texto", () => {
  const multipart = Buffer.concat([
    Buffer.from("--form-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"pago.png\"\r\n\r\n"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xc3, 0x28]),
    Buffer.from("\r\n--form-boundary--\r\n"),
  ]);

  assert.doesNotThrow(() => mod.exports.verifyCommerceRequest(signedRequest(multipart), multipart));
  assert.throws(() => mod.exports.verifyCommerceRequest(signedRequest(multipart), Buffer.from("alterado")), { status: 401 });
});

test("mantiene la verificación HMAC de cuerpos JSON", () => {
  const body = JSON.stringify({ orderId: "order-123", status: "pending" });
  assert.doesNotThrow(() => mod.exports.verifyCommerceRequest(signedRequest(body), body));
  assert.throws(() => mod.exports.verifyCommerceRequest(signedRequest(`${body} `), body), { status: 401 });
});
