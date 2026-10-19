const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../lib/tienda-obras-draft.js"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(require, mod, mod.exports);
const { isProjectDraftDirty } = mod.exports;

test("el estado del guardado diferencia borradores nuevos, editados y ya guardados", () => {
  assert.equal(isProjectDraftDirty(null, null, 0), false);
  assert.equal(isProjectDraftDirty('{"title":"Obra"}', null, 0), true);
  assert.equal(isProjectDraftDirty('{"title":"Obra"}', '{"title":"Obra"}', 1), false);
  assert.equal(isProjectDraftDirty('{"title":"Obra nueva"}', '{"title":"Obra"}', 1), true);
  assert.equal(isProjectDraftDirty('{"title":"Migrada"}', '{"title":"Original"}', 1), true);
});
