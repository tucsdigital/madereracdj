const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { Readable } = require("node:stream");

const sent = [];
const signed = [];
let headResponse = null;
let getObjectResponse = null;
const aws = {
  S3Client: class {
    constructor(config) { this.config = config; }
    async send(command) {
      sent.push(command);
      if (command.type === "head-object") return headResponse;
      if (command.type === "get-object") return getObjectResponse;
      return undefined;
    }
  },
  PutObjectCommand: class { constructor(input) { this.input = input; this.type = "put"; } },
  DeleteObjectCommand: class { constructor(input) { this.input = input; this.type = "delete"; } },
  HeadBucketCommand: class { constructor(input) { this.input = input; } },
  HeadObjectCommand: class { constructor(input) { this.input = input; this.type = "head-object"; } },
  GetObjectCommand: class { constructor(input) { this.input = input; this.type = "get-object"; } },
};
const src = fs.readFileSync(path.resolve(__dirname, "../lib/r2-storage.js"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", out)((name) => {
  if (name === "@aws-sdk/client-s3") return aws;
  if (name === "@aws-sdk/s3-request-presigner") return {
    getSignedUrl: async (client, command, options) => {
      signed.push({ client, command, options });
      return "https://r2.ejemplo.com/signed-upload";
    },
  };
  return require(name);
}, mod, mod.exports);
const { getR2ConfigStatus, uploadFileToR2, deleteFileFromR2, createPresignedUploadUrl, downloadMediaUploadFromR2 } = mod.exports;

const VARS = ["R2_BUCKET", "R2_PUBLIC_BASE", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT"];
const clear = () => VARS.forEach((name) => delete process.env[name]);
const full = () => Object.assign(process.env, {
  R2_BUCKET: "bucket-prueba", R2_PUBLIC_BASE: "https://media.ejemplo.com/", R2_ACCESS_KEY_ID: "id-prueba",
  R2_SECRET_ACCESS_KEY: "secreto-prueba", R2_ENDPOINT: "https://cuenta.r2.cloudflarestorage.com",
});

test("sin variables de entorno informa cuáles faltan y no expone secretos", () => {
  clear();
  const status = getR2ConfigStatus();
  assert.equal(status.ok, false);
  assert.deepEqual([...status.missing].sort(), [...VARS].sort());
  process.env.R2_ACCESS_KEY_ID = "id-prueba";
  const partial = getR2ConfigStatus();
  assert.ok(!partial.missing.includes("R2_ACCESS_KEY_ID"));
  assert.ok(!JSON.stringify(partial).includes("id-prueba"), "el estado nunca devuelve las credenciales");
});

test("subir sin configuración falla con el nombre de la variable que falta", async () => {
  clear();
  await assert.rejects(uploadFileToR2({ key: "tienda/x.webp", file: { arrayBuffer: async () => new ArrayBuffer(4) } }), /missing_env_R2_BUCKET/);
});

test("con variables completas sube al bucket y arma la URL pública sin barras duplicadas", async () => {
  full();
  const result = await uploadFileToR2({
    key: "tienda/banners/1-a b.webp", file: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
    contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable",
  });
  assert.equal(result.url, "https://media.ejemplo.com/tienda/banners/1-a%20b.webp");
  const command = sent.at(-1);
  assert.equal(command.input.Bucket, "bucket-prueba");
  assert.equal(command.input.ContentType, "image/webp");
  assert.equal(getR2ConfigStatus().ok, true);
});

test("firma un PUT temporal y descarga objetos con un límite estricto de bytes", async () => {
  full();
  const url = await createPresignedUploadUrl({
    key: "tienda/_incoming/u1/banners/1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    contentType: "image/jpeg",
    expiresIn: 900,
  });
  assert.equal(url, "https://r2.ejemplo.com/signed-upload");
  assert.equal(signed.at(-1).command.input.ContentType, "image/jpeg");
  assert.equal(signed.at(-1).options.expiresIn, 900);

  headResponse = { ContentLength: 3, ContentType: "image/jpeg" };
  getObjectResponse = { Body: Readable.from([Buffer.from([1]), Buffer.from([2, 3])]), ContentType: "image/jpeg" };
  const object = await downloadMediaUploadFromR2({ key: "tienda/_incoming/u1/banners/upload.jpg", maxBytes: 3 });
  assert.deepEqual([...object.body], [1, 2, 3]);
  assert.equal(object.size, 3);

  headResponse = { ContentLength: 4 };
  await assert.rejects(downloadMediaUploadFromR2({ key: "tienda/_incoming/u1/banners/upload.jpg", maxBytes: 3 }), (error) => error.status === 413);
  assert.equal(sent.at(-1).type, "head-object", "no descarga si el HEAD ya supera el límite");
});

test("un cambio de variables se aplica sin reiniciar y borrar exige una clave", async () => {
  full();
  await uploadFileToR2({ key: "tienda/a.webp", file: { arrayBuffer: async () => new ArrayBuffer(1) } });
  process.env.R2_BUCKET = "otro-bucket";
  await deleteFileFromR2("tienda/a.webp");
  assert.equal(sent.at(-1).input.Bucket, "otro-bucket");
  await assert.rejects(deleteFileFromR2(""), /invalid_delete_key/);
});
