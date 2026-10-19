const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const legacyProjects = require("../lib/legacy-projects.json");
const source = fs.readFileSync(path.resolve(__dirname, "../lib/tienda-obras.js"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
let adminDb = null;
const mockRequire = (name) => {
  if (name === "@/lib/legacy-projects.json") return { __esModule: true, default: legacyProjects };
  if (name === "@/lib/firebase-admin") return { getAdminDb: () => {
    if (!adminDb) throw new Error("Firebase no se usa en estas pruebas");
    return adminDb;
  } };
  return require(name);
};
new Function("require", "module", "exports", compiled)(mockRequire, mod, mod.exports);
const { normalizeProject, projectIssues, projectImageUrls, sortProjectsByManualOrder, importLegacyProjectsIfEmpty } = mod.exports;

test("normaliza y conserva el contenido de las obras heredadas", () => {
  for (const raw of legacyProjects) {
    const project = normalizeProject(raw, raw.slug);
    assert.equal(project.slug, raw.slug);
    assert.ok(Array.isArray(project.banner.slides));
    assert.ok(Array.isArray(project.gallery.items));
    assert.ok(Array.isArray(project.info.features));
    assert.deepEqual(projectIssues(project, []), []);
    assert.deepEqual(projectIssues(project, [], { forPublish: true }), []);
  }
});

test("normaliza los datos de la tarjeta de tipos de obra y limita sus características", () => {
  const project = normalizeProject({
    slug: "muelles",
    title: "Muelles",
    workTypeCard: {
      description: "  Descripción de tarjeta  ",
      features: ["Una", "Dos", "Tres", "Cuatro", "Quinta"],
      icon: "anchor",
      image: " /media/muelle.webp ",
      imageRatio: "3:2",
    },
    homeCardImage: "/media/muelle-vertical.webp",
  }, "muelles");
  assert.deepEqual(project.workTypeCard, {
    description: "Descripción de tarjeta",
    features: ["Una", "Dos", "Tres", "Cuatro"],
    icon: "anchor",
    imagePortrait: "/media/muelle-vertical.webp",
    imageLandscape: "/media/muelle.webp",
  });
  assert.equal(normalizeProject({ slug: "deck", title: "Deck" }, "deck").workTypeCard, undefined);
  assert.equal(normalizeProject({ slug: "deck", title: "Deck", workTypeCard: { icon: "script" } }, "deck").workTypeCard.icon, "hammer");
  const legacyPortrait = normalizeProject({ slug: "deck", title: "Deck", workTypeCard: { image: "/deck-vertical.webp" } }, "deck");
  assert.equal(legacyPortrait.workTypeCard.imagePortrait, "/deck-vertical.webp");
  assert.equal(legacyPortrait.workTypeCard.imageLandscape, "");
  const twoFormats = normalizeProject({ slug: "deck", title: "Deck", workTypeCard: { imagePortrait: "/deck-4x5.webp", imageLandscape: "/deck-3x2.webp" } }, "deck");
  assert.deepEqual([twoFormats.workTypeCard.imagePortrait, twoFormats.workTypeCard.imageLandscape], ["/deck-4x5.webp", "/deck-3x2.webp"]);
});

test("valida imágenes nuevas con R2 y rechaza hosts o rutas no pertenecientes a la tienda", () => {
  const base = normalizeProject({
    slug: "obra-nueva",
    title: "Obra nueva",
    status: "active",
    seo: { title: "Obra nueva", description: "Descripción" },
    banner: { slides: [{ backgroundImage: "https://media.example.com/tienda/obras/1-a.webp" }] },
    gallery: { items: [] },
    faqs: [],
  }, "obra-nueva");
  assert.deepEqual(projectIssues(base, ["media.example.com"]), []);
  assert.ok(projectIssues({ ...base, banner: { slides: [{ backgroundImage: "https://evil.example/file.webp" }] } }, ["media.example.com"]).some((issue) => /R2/.test(issue)));
  assert.ok(projectIssues({ ...base, banner: { slides: [{ backgroundImage: "https://media.example.com/comprobantes/a.webp" }] } }, ["media.example.com"]).some((issue) => /R2/.test(issue)));
});

test("publicar requiere imágenes para portada, materiales, adicionales y galería", () => {
  const project = normalizeProject({
    slug: "obra-nueva",
    title: "Obra nueva",
    status: "active",
    seo: { title: "Obra nueva", description: "Descripción" },
    banner: { slides: [{ backgroundImage: "" }] },
    pageContent: { options: { items: [{ title: "Pino", image: "" }] }, accessories: { items: [{ title: "Baranda", image: "" }] } },
    gallery: { items: [{ title: "Trabajo", image: "" }] },
    faqs: [],
  }, "obra-nueva");
  const issues = projectIssues(project, [], { forPublish: true });
  assert.ok(issues.some((issue) => /portada/.test(issue)));
  assert.ok(issues.some((issue) => /material/.test(issue)));
  assert.ok(issues.some((issue) => /adicional/.test(issue)));
  assert.ok(issues.some((issue) => /galería/.test(issue)));
});

test("recolecta todas las imágenes de una obra para protegerlas de la limpieza", () => {
  assert.deepEqual(projectImageUrls({ workTypeCard: { imagePortrait: "4x5", imageLandscape: "3x2" }, banner: { slides: [{ backgroundImage: "portada", mobileBackgroundImage: "portada-movil" }] }, pageContent: { accessories: { items: [{ image: "adicional", mobileImage: "adicional-movil" }] } }, gallery: { items: [{ image: "galeria", beforeImage: "antes" }] }, testimonials: [{ avatar: "avatar" }] }).sort(), ["3x2", "4x5", "adicional", "adicional-movil", "antes", "avatar", "galeria", "portada", "portada-movil"]);
});

test("normaliza la portada vertical de la tarjeta y respeta el orden manual de obras", () => {
  const projects = [
    { slug: "deck", title: "Deck" },
    { slug: "muelles", title: "Muelles" },
    { slug: "pergolas", title: "Pérgolas" },
  ];
  assert.deepEqual(sortProjectsByManualOrder(projects, ["pergolas", "deck"]).map(({ slug }) => slug), ["pergolas", "deck", "muelles"]);
  const project = normalizeProject({ slug: "deck", title: "Deck", seo: { ogImage: "/images/deck.webp" }, banner: { slides: [] } });
  assert.equal(project.homeCardImage, "/images/deck.webp");
});

test("la migración ya completada no abre una transacción ni relee las obras", async () => {
  let markerReads = 0;
  let projectReads = 0;
  let transactions = 0;
  const markerRef = { get: async () => { markerReads += 1; return { exists: true }; } };
  const projectRef = { get: async () => { projectReads += 1; return { empty: false, size: 1 }; } };

  adminDb = {
    collection: (name) => name === "settings"
      ? { doc: () => markerRef }
      : projectRef,
    runTransaction: async () => { transactions += 1; },
  };

  try {
    assert.equal(await importLegacyProjectsIfEmpty(), false);
    assert.equal(markerReads, 1);
    assert.equal(projectReads, 0);
    assert.equal(transactions, 0);
  } finally {
    adminDb = null;
  }
});
