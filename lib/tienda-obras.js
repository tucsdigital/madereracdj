import legacyProjects from "@/lib/legacy-projects.json";
import { getAdminDb } from "@/lib/firebase-admin";

export const OBRAS_COLLECTION = "obrasTienda";
export const OBRAS_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function sortProjectsByManualOrder(projects, slugs = []) {
  const rank = new Map((Array.isArray(slugs) ? slugs : []).map((slug, index) => [String(slug), index]));
  return [...projects].sort((a, b) => {
    const aRank = rank.has(String(a.slug || a.id)) ? rank.get(String(a.slug || a.id)) : Number.MAX_SAFE_INTEGER;
    const bRank = rank.has(String(b.slug || b.id)) ? rank.get(String(b.slug || b.id)) : Number.MAX_SAFE_INTEGER;
    return aRank - bRank || String(a.slug || a.id).localeCompare(String(b.slug || b.id), "es");
  });
}

export function normalizeProject(raw, slug = raw?.slug) {
  const project = raw && typeof raw === "object" ? structuredClone(raw) : {};
  const safeSlug = String(slug || project.slug || "").trim().toLowerCase();
  const title = String(project.title || "").trim();
  const status = ["active", "inactive", "coming-soon"].includes(project.status) ? project.status : "inactive";
  const seo = project.seo && typeof project.seo === "object" ? project.seo : {};
  const banner = project.banner && typeof project.banner === "object" ? project.banner : {};
  const info = project.info && typeof project.info === "object" ? project.info : {};
  const workTypeCard = project.workTypeCard && typeof project.workTypeCard === "object" ? project.workTypeCard : null;
  const oldWorkTypeCardImage = String(workTypeCard?.image || "").trim();
  const oldWorkTypeCardImageIsLandscape = workTypeCard?.imageRatio === "3:2";
  const gallery = project.gallery && typeof project.gallery === "object" ? project.gallery : {};
  const contact = project.contact && typeof project.contact === "object" ? project.contact : {};
  const pageContent = project.pageContent && typeof project.pageContent === "object" ? project.pageContent : {};
  return {
    ...project,
    slug: safeSlug,
    title,
    homeCardImage: String(project.homeCardImage || seo.ogImage || banner.slides?.[0]?.backgroundImage || "").trim(),
    category: String(project.category || title).trim(),
    ...(workTypeCard ? {
      workTypeCard: {
        description: String(workTypeCard.description || "").trim().slice(0, 240),
        features: Array.isArray(workTypeCard.features)
          ? workTypeCard.features.map((feature) => String(feature || "").trim().slice(0, 120)).filter(Boolean).slice(0, 4)
          : [],
        icon: ["anchor", "flame", "tree", "fence", "layout", "hammer"].includes(workTypeCard.icon) ? workTypeCard.icon : "hammer",
        imagePortrait: typeof workTypeCard.imagePortrait === "string"
          ? workTypeCard.imagePortrait.trim()
          : oldWorkTypeCardImageIsLandscape
            ? String(project.homeCardImage || seo.ogImage || banner.slides?.[0]?.backgroundImage || "").trim()
            : typeof workTypeCard.image === "string"
              ? oldWorkTypeCardImage
              : String(project.homeCardImage || seo.ogImage || banner.slides?.[0]?.backgroundImage || "").trim(),
        imageLandscape: typeof workTypeCard.imageLandscape === "string"
          ? workTypeCard.imageLandscape.trim()
          : oldWorkTypeCardImageIsLandscape ? oldWorkTypeCardImage : "",
      },
    } : {}),
    status,
    seo: {
      title: String(seo.title || title).trim(),
      description: String(seo.description || "").trim(),
      keywords: Array.isArray(seo.keywords) ? seo.keywords.map((item) => String(item).trim()).filter(Boolean) : [],
      ogImage: String(seo.ogImage || "").trim(),
      canonical: String(seo.canonical || `/obras/${safeSlug}`).trim(),
    },
    banner: { ...banner, id: banner.id || `banner-${safeSlug}`, slides: Array.isArray(banner.slides) ? banner.slides : [] },
    info: { ...info, id: info.id || `info-${safeSlug}`, title: String(info.title || title), description: String(info.description || ""), features: Array.isArray(info.features) ? info.features : [], images: Array.isArray(info.images) ? info.images : [], stats: Array.isArray(info.stats) ? info.stats : [] },
    services: Array.isArray(project.services) ? project.services.map((service) => ({
      ...service,
      features: Array.isArray(service?.features) ? service.features : [],
      carousel: Array.isArray(service?.carousel) ? service.carousel : [],
    })) : [],
    gallery: { ...gallery, id: gallery.id || `gallery-${safeSlug}`, title: String(gallery.title || `Galería de ${title}`), description: String(gallery.description || ""), categories: Array.isArray(gallery.categories) ? gallery.categories : [], items: Array.isArray(gallery.items) ? gallery.items : [] },
    testimonials: Array.isArray(project.testimonials) ? project.testimonials : [],
    faqs: Array.isArray(project.faqs) ? project.faqs : [],
    contact: { ...contact, id: contact.id || `contact-${safeSlug}`, title: String(contact.title || "Consultanos"), description: String(contact.description || ""), phone: String(contact.phone || ""), email: String(contact.email || ""), whatsapp: String(contact.whatsapp || ""), address: String(contact.address || ""), workingHours: Array.isArray(contact.workingHours) ? contact.workingHours : [], socialLinks: Array.isArray(contact.socialLinks) ? contact.socialLinks : [] },
    pageContent: {
      ...pageContent,
      ...(pageContent.options && typeof pageContent.options === "object" ? { options: { ...pageContent.options, items: Array.isArray(pageContent.options.items) ? pageContent.options.items : [] } } : {}),
      ...(pageContent.accessories && typeof pageContent.accessories === "object" ? { accessories: { ...pageContent.accessories, items: Array.isArray(pageContent.accessories.items) ? pageContent.accessories.items : [] } } : {}),
    },
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function projectIssues(project, imageHosts = [], { forPublish = false } = {}) {
  const issues = [];
  if (!OBRAS_SLUG_PATTERN.test(project.slug)) issues.push("El slug debe usar minúsculas, números y guiones, sin espacios.");
  if (!project.title) issues.push("La obra necesita un título.");
  if (!project.category) issues.push("La obra necesita una categoría.");
  if (!project.seo.title || !project.seo.description) issues.push("Completá el título y la descripción SEO.");
  if (!Array.isArray(project.banner?.slides) || !project.banner.slides.length) issues.push("Agregá al menos una diapositiva de portada.");
  if (!Array.isArray(project.gallery?.items)) issues.push("La galería tiene un formato inválido.");
  if (!Array.isArray(project.faqs)) issues.push("Las preguntas frecuentes tienen un formato inválido.");
  if (forPublish) {
    if (!(project.banner?.slides?.[0]?.backgroundImage || project.seo.ogImage)) issues.push("La portada necesita una imagen antes de publicar.");
    if ((project.pageContent?.options?.items || []).some((item) => !item.image)) issues.push("Cada material publicado necesita una imagen.");
    if ((project.pageContent?.accessories?.items || []).some((item) => !item.image)) issues.push("Cada adicional publicado necesita una imagen.");
    if ((project.gallery?.items || []).some((item) => !item.image)) issues.push("Cada foto de galería necesita una imagen.");
    if (project.pageContent?.services?.enabled && project.services.some((service) => {
      const images = service.carousel?.length ? service.carousel.map((item) => item.image) : [service.image];
      return images.some((image) => !image);
    })) issues.push("Cada servicio publicado necesita una imagen.");
  }

  const validPublicLink = (value) => {
    if (!value) return true;
    const link = String(value).trim();
    if (link.startsWith("#")) return true;
    if (link.startsWith("/") && !link.startsWith("//")) return true;
    try { return new URL(link).protocol === "https:"; } catch { return false; }
  };
  const checkLink = (value, label) => {
    if (value && !validPublicLink(value)) issues.push(`${label} debe ser un enlace seguro (HTTPS, ruta local o ancla).`);
  };
  (project.banner?.slides || []).forEach((slide, index) => {
    checkLink(slide.ctaUrl, `El botón de portada #${index + 1}`);
    checkLink(slide.secondaryCtaUrl, `El segundo botón de portada #${index + 1}`);
  });
  checkLink(project.pageContent?.hero?.primaryHref, "El botón principal");
  checkLink(project.pageContent?.hero?.secondaryHref, "El botón secundario");
  checkLink(project.pageContent?.options?.consultationHref, "El enlace de consulta de materiales");
  (project.contact?.socialLinks || []).forEach((link, index) => checkLink(link.url, `El enlace social #${index + 1}`));

  const allowedHosts = new Set(imageHosts.map((host) => String(host).toLowerCase()));
  const visit = (value, key = "") => {
    if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
    if (!value || typeof value !== "object") {
      if (typeof value !== "string" || !/(image|avatar|ogImage|backgroundImage|mobileImage)/i.test(key) || !value) return;
      if (value.startsWith("/images/")) return;
      if (!/^https:\/\//i.test(value)) {
        issues.push(`La imagen “${key}” debe ser una ruta local válida o una imagen cargada en R2.`);
        return;
      }
      try {
        const url = new URL(value);
        if (!allowedHosts.has(url.host.toLowerCase()) || !url.pathname.includes("/tienda/")) issues.push(`La imagen “${key}” debe estar alojada en el R2 de la tienda.`);
      } catch {
        issues.push(`La URL de imagen “${key}” no es válida.`);
      }
      return;
    }
    Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(project);
  return [...new Set(issues)];
}

export function projectImageUrls(project) {
  const urls = new Set();
  const visit = (value, key = "") => {
    if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
    if (!value || typeof value !== "object") {
      if (typeof value === "string" && /(image|avatar|ogImage|backgroundImage|mobileImage)/i.test(key) && value) urls.add(value);
      return;
    }
    Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(project);
  return [...urls];
}

export async function importLegacyProjectsIfEmpty() {
  const db = getAdminDb();
  const markerRef = db.collection("settings").doc("tiendaObrasMigration");
  const collection = db.collection(OBRAS_COLLECTION);

  // La API pública consulta esta función en cada GET. Si la migración ya quedó
  // marcada, evitamos abrir una transacción y leer toda la colección otra vez.
  const marker = await markerRef.get();
  if (marker.exists) return false;

  return db.runTransaction(async (transaction) => {
    const [marker, existing] = await Promise.all([transaction.get(markerRef), transaction.get(collection)]);
    if (marker.exists) return false;
    const now = new Date().toISOString();
    if (existing.empty) {
      legacyProjects.forEach((raw) => {
        const project = normalizeProject(raw, raw.slug);
        transaction.set(collection.doc(project.slug), {
          slug: project.slug,
          draft: project,
          published: project,
          version: 1,
          publishedVersion: 1,
          updatedAt: now,
          publishedAt: now,
          migratedFrom: "tienda/src/data/projects.json",
        });
      });
    }
    transaction.set(markerRef, { importedAt: now, count: existing.empty ? legacyProjects.length : existing.size, source: "legacy-projects" });
    return existing.empty;
  });
}
