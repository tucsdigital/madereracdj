import { getAdminDb } from "@/lib/firebase-admin";

export async function findLiquidacionAsistenciaByPublicTokenHash(tokenHash) {
  const hash = String(tokenHash || "").trim();
  if (!hash) return null;

  const db = getAdminDb();
  const byHashes = await db
    .collection("liquidacionesAsistencia")
    .where("public.tokenHashes", "array-contains", hash)
    .limit(1)
    .get();

  const matchByHashes = byHashes.docs[0];
  if (matchByHashes) return matchByHashes;

  const byHash = await db
    .collection("liquidacionesAsistencia")
    .where("public.tokenHash", "==", hash)
    .limit(1)
    .get();

  return byHash.docs[0] || null;
}

export function buildPublicLiquidacionView(data, id) {
  return {
    id: id || "",
    employeeId: data?.employeeId || "",
    employeeNombre: data?.employeeNombre || "",
    employeeSector: data?.employeeSector || "",
    monthKey: data?.monthKey || "",
    labelMes: data?.labelMes || "",
    generatedAt: data?.generatedAt || null,
    closedAt: data?.closedAt || null,
    version: Number(data?.version || 1),
    totSemana: Number(data?.totSemana || 0),
    totAdv: Number(data?.totAdv || 0),
    totPagar: Number(data?.totPagar || 0),
    premioAsistencia: {
      premio: Number(data?.premioAsistencia?.premio || 0),
      porcentaje: Number(data?.premioAsistencia?.porcentaje || 0),
      presentes: Number(data?.premioAsistencia?.presentes || 0),
      medias: Number(data?.premioAsistencia?.medias || 0),
      ausentes: Number(data?.premioAsistencia?.ausentes || 0),
      diasEsperados: Number(data?.premioAsistencia?.diasEsperados || 0),
      estadoLabel: String(data?.premioAsistencia?.estadoLabel || "-"),
      motivos: Array.isArray(data?.premioAsistencia?.motivos) ? data.premioAsistencia.motivos : [],
    },
    public: {
      lastOpenedAt: data?.public?.lastOpenedAt || null,
      openCount: Number(data?.public?.openCount || 0),
      lastLinkGeneratedAt: data?.public?.lastLinkGeneratedAt || null,
    },
  };
}
