import { getAdminDb } from "@/lib/firebase-admin";

function calcularTotalLiquidacionSnapshot(totSemana, totExtras, totAdv, premio) {
  return Math.max(
    Number(totSemana || 0) + Number(totExtras || 0) + Number(premio || 0) - Number(totAdv || 0),
    0,
  );
}

const DAY_KEYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];

function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  if (value && typeof value === "object" && "seconds" in value) {
    return new Date(value.seconds * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fmtDateOnly(dateInput) {
  const date = toDateSafe(dateInput);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(dateInput) {
  const date = toDateSafe(dateInput) || new Date();
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const result = new Date(date);
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatMonthLabelFromKey(monthKey) {
  const key = String(monthKey || "").trim();
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return "";
  return new Date(year, month - 1, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

function getPremioAsistenciaConfig(empleado) {
  return {
    activo: Boolean(empleado?.premioAsistenciaActivo),
    monto: Number(empleado?.premioAsistenciaMonto || 0),
    minPorcentaje: Number(empleado?.premioAsistenciaMinPorcentaje ?? 100),
    maxAusencias: Number(empleado?.premioAsistenciaMaxAusencias ?? 0),
    maxMedias: Number(empleado?.premioAsistenciaMaxMedias ?? 0),
    pesoMedia: Number(empleado?.premioAsistenciaPesoMedia ?? 0.5),
  };
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function calcMontoJornada({ estado, valorDia = 0, isWeekend = false }) {
  if (isWeekend) return 0;
  if (estado === "ausente") return 0;
  if (estado === "media") return roundMoney(Number(valorDia || 0) * 0.5);
  if (estado === "presente" || estado === "extra") return roundMoney(Number(valorDia || 0));
  return 0;
}

function calcMontoAdicional({ empleado, tipo, cantidad = 0, montoManual = 0 }) {
  const valorDia = Number(empleado?.valorDia || 0);
  const horasJornada = Math.max(Number(empleado?.horasJornada || 8), 1);
  if (tipo === "horas") {
    const horas = Math.max(Number(cantidad || 0), 0);
    return roundMoney((valorDia / horasJornada) * horas * 1.5);
  }
  if (tipo === "jornada") {
    return roundMoney(Number(empleado?.valorExtra || empleado?.valorDia || 0));
  }
  if (tipo === "manual") {
    return roundMoney(Number(montoManual || 0));
  }
  return 0;
}

function getAdditionalLabel(tipo) {
  if (tipo === "horas") return "Horas extra";
  if (tipo === "jornada") return "Jornada adicional";
  if (tipo === "manual") return "Adicional manual";
  return "Adicional";
}

function getDayPaymentBreakdown({ dayData, empleado, dateInput }) {
  const rawEstado = String(dayData?.estado || "ausente");
  const estado = rawEstado === "extra" ? "presente" : rawEstado;
  const date = toDateSafe(dateInput);
  const isWeekend = date ? date.getDay() === 0 || date.getDay() === 6 : false;
  let montoJornada =
    dayData?.montoJornada != null
      ? Number(dayData.montoJornada || 0)
      : calcMontoJornada({
          estado: rawEstado,
          valorDia: Number(empleado?.valorDia || 0),
          isWeekend,
        });
  let extraMonto = Number(dayData?.extraMonto || 0);
  let extraTipo = String(dayData?.extraTipo || "");
  const extraCantidad = Math.max(Number(dayData?.extraCantidad || 0), 0);
  const extraNota = String(dayData?.extraNota || "");

  if (rawEstado === "extra" && extraMonto <= 0) {
    const totalGuardado = Number(dayData?.monto || 0);
    const inferido = Math.max(totalGuardado - montoJornada, 0);
    extraMonto =
      inferido > 0
        ? roundMoney(inferido)
        : calcMontoAdicional({ empleado, tipo: "jornada" });
    extraTipo = extraTipo || "jornada";
  }

  if (!extraTipo && extraMonto > 0) {
    extraTipo = extraCantidad > 0 ? "horas" : "manual";
  }

  return {
    estado,
    montoJornada: roundMoney(montoJornada),
    extraMonto: roundMoney(extraMonto),
    extraTipo,
    extraCantidad,
    extraNota,
  };
}

function buildExtrasDetalleMensualServer({ employeeId, asistencias, monthKey, empleado }) {
  const [year, monthInput] = String(monthKey || "").split("-").map(Number);
  if (!year || !monthInput) return [];
  const month = monthInput - 1;
  const finMes = new Date(year, month + 1, 0);
  const weekMap = buildWeekMap(asistencias, employeeId);
  const items = [];

  for (let day = 1; day <= finMes.getDate(); day += 1) {
    const current = new Date(year, month, day);
    const dow = current.getDay();
    const dayIndex = dow === 0 ? 6 : dow - 1;
    const weekStartKey = fmtDateOnly(startOfWeek(current));
    const row = weekMap[weekStartKey];
    const key = DAY_KEYS[dayIndex];
    const breakdown = getDayPaymentBreakdown({
      dayData: row?.days?.[key],
      empleado,
      dateInput: current,
    });
    if (Number(breakdown.extraMonto || 0) <= 0) continue;
    const detalleHoras =
      breakdown.extraTipo === "horas" && breakdown.extraCantidad > 0
        ? `${breakdown.extraCantidad.toLocaleString("es-AR")} h`
        : "";
    const detalle = [detalleHoras, breakdown.extraNota].filter(Boolean).join(" · ");
    items.push({
      id: `${weekStartKey}-${key}`,
      fecha: fmtDateOnly(current),
      tipo: breakdown.extraTipo,
      concepto: getAdditionalLabel(breakdown.extraTipo),
      detalle,
      cantidad: breakdown.extraCantidad,
      monto: breakdown.extraMonto,
      nota: breakdown.extraNota,
    });
  }

  return items.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
}

function buildWeekMap(rows, employeeId) {
  const filtered = Array.isArray(rows)
    ? rows.filter((row) => String(row?.employeeId || "") === String(employeeId || ""))
    : [];
  return filtered.reduce((acc, row) => {
    const key = fmtDateOnly(row?.weekStart);
    if (key) acc[key] = row;
    return acc;
  }, {});
}

function calcularTotalTrabajadoMensualServer({ employeeId, asistencias, monthKey, empleado }) {
  const [year, monthInput] = String(monthKey || "").split("-").map(Number);
  if (!year || !monthInput) return 0;
  const month = monthInput - 1;
  const finMes = new Date(year, month + 1, 0);
  const weekMap = buildWeekMap(asistencias, employeeId);
  let total = 0;

  for (let day = 1; day <= finMes.getDate(); day += 1) {
    const current = new Date(year, month, day);
    const dow = current.getDay();
    if (dow === 0 || dow === 6) continue;
    const weekStartKey = fmtDateOnly(startOfWeek(current));
    const row = weekMap[weekStartKey];
    const key = DAY_KEYS[dow - 1];
    const breakdown = getDayPaymentBreakdown({
      dayData: row?.days?.[key],
      empleado,
      dateInput: current,
    });
    total += Number(breakdown.montoJornada || 0);
  }

  return Number(total.toFixed(2));
}

function calcularTotalExtrasMensualServer({ employeeId, asistencias, monthKey, empleado }) {
  const [year, monthInput] = String(monthKey || "").split("-").map(Number);
  if (!year || !monthInput) return 0;
  const month = monthInput - 1;
  const finMes = new Date(year, month + 1, 0);
  const weekMap = buildWeekMap(asistencias, employeeId);
  let total = 0;

  for (let day = 1; day <= finMes.getDate(); day += 1) {
    const current = new Date(year, month, day);
    const dow = current.getDay();
    const dayIndex = dow === 0 ? 6 : dow - 1;
    const weekStartKey = fmtDateOnly(startOfWeek(current));
    const row = weekMap[weekStartKey];
    const key = DAY_KEYS[dayIndex];
    const breakdown = getDayPaymentBreakdown({
      dayData: row?.days?.[key],
      empleado,
      dateInput: current,
    });
    total += Number(breakdown.extraMonto || 0);
  }

  return Number(total.toFixed(2));
}

function scoreDay(estado, pesoMedia) {
  if (estado === "presente" || estado === "extra") return 1;
  if (estado === "media") return Math.max(0, Number(pesoMedia || 0));
  return 0;
}

function isJustifiedAbsence(dayData) {
  return String(dayData?.estado || "") === "ausente" && Boolean(dayData?.ausentismoJustificado);
}

function isSameLocalDay(a, b) {
  return (
    a instanceof Date &&
    b instanceof Date &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function calcularPremioAsistenciaMensualServer({ empleado, asistencias, monthKey }) {
  const [year, monthInput] = String(monthKey || "").split("-").map(Number);
  if (!year || !monthInput) {
    return {
      config: getPremioAsistenciaConfig(empleado),
      diasEsperados: 0,
      presentes: 0,
      medias: 0,
      ausentes: 0,
      justificadas: 0,
      extras: 0,
      puntaje: 0,
      porcentaje: 0,
      cumple: false,
      premio: 0,
      motivos: [],
      estadoLabel: "Sin premio",
      fechaCorte: null,
      esMesActual: false,
    };
  }

  const month = monthInput - 1;
  const finMes = new Date(year, month + 1, 0);
  const hoy = new Date();
  const esMesActual = hoy.getFullYear() === year && hoy.getMonth() === month;
  const fechaCorte = esMesActual ? new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) : finMes;
  const config = getPremioAsistenciaConfig(empleado);
  const weekMap = buildWeekMap(asistencias, empleado?.id);

  let diasEsperados = 0;
  let presentes = 0;
  let medias = 0;
  let ausentes = 0;
  let justificadas = 0;
  let extras = 0;
  let puntaje = 0;

  for (let day = 1; day <= fechaCorte.getDate(); day += 1) {
    const current = new Date(year, month, day);
    const dow = current.getDay();
    if (dow === 0 || dow === 6) continue;

    const weekStartKey = fmtDateOnly(startOfWeek(current));
    const row = weekMap[weekStartKey];
    const key = DAY_KEYS[dow - 1];
    const dayData = row?.days?.[key] || null;
    const hasStoredDay = Boolean(row?.days && Object.prototype.hasOwnProperty.call(row.days, key));

    if (esMesActual && isSameLocalDay(current, fechaCorte) && !hasStoredDay) {
      continue;
    }

    const breakdown = getDayPaymentBreakdown({
      dayData,
      empleado,
      dateInput: current,
    });
    const estado = String(breakdown.estado || "ausente");

    if (isJustifiedAbsence(dayData)) {
      justificadas += 1;
      continue;
    }

    diasEsperados += 1;

    if (estado === "presente") presentes += 1;
    else if (estado === "media") medias += 1;
    else if (estado === "extra") {
      presentes += 1;
      extras += 1;
    } else {
      ausentes += 1;
    }

    puntaje += scoreDay(estado, config.pesoMedia);
  }

  const porcentaje = diasEsperados > 0 ? Number(((puntaje / diasEsperados) * 100).toFixed(1)) : 0;
  const motivos = [];
  if (porcentaje < config.minPorcentaje) motivos.push(`Asistencia menor a ${config.minPorcentaje}%`);
  if (ausentes > config.maxAusencias) motivos.push(`Ausencias ${ausentes}/${config.maxAusencias}`);
  if (medias > config.maxMedias) motivos.push(`Medias jornadas ${medias}/${config.maxMedias}`);

  const cumple =
    config.activo &&
    diasEsperados > 0 &&
    porcentaje >= config.minPorcentaje &&
    ausentes <= config.maxAusencias &&
    medias <= config.maxMedias;

  return {
    config,
    diasEsperados,
    presentes,
    medias,
    ausentes,
    justificadas,
    extras,
    puntaje: Number(puntaje.toFixed(2)),
    porcentaje,
    cumple,
    premio: cumple ? config.monto : 0,
    motivos,
    estadoLabel: !config.activo ? "Sin premio" : cumple ? "Cumple" : "No cumple",
    fechaCorte,
    esMesActual,
  };
}

function normalizePremioAsistenciaSnapshot(input) {
  return {
    ...(input || {}),
    premio: Number(input?.premio || 0),
    porcentaje: Number(input?.porcentaje || 0),
    presentes: Number(input?.presentes || 0),
    medias: Number(input?.medias || 0),
    ausentes: Number(input?.ausentes || 0),
    justificadas: Number(input?.justificadas || 0),
    diasEsperados: Number(input?.diasEsperados || 0),
    motivos: Array.isArray(input?.motivos) ? input.motivos : [],
    estadoLabel: String(input?.estadoLabel || "Sin premio"),
  };
}

function normalizarAdelantoDetalle(item) {
  return {
    id: String(item?.id || ""),
    fecha: item?.fecha || "",
    monto: Number(item?.monto || 0),
    nota: String(item?.nota || ""),
  };
}

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

export async function findAdelantosDetalleByEmployeeAndMonth(employeeId, monthKey) {
  const id = String(employeeId || "").trim();
  const key = String(monthKey || "").trim();
  if (!id || !key) return [];

  const db = getAdminDb();
  const snap = await db.collection("adelantos").where("employeeId", "==", id).get();

  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item) => String(item?.fecha || "").startsWith(`${key}-`))
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
    .map(normalizarAdelantoDetalle);
}

export async function resolvePublicLiquidacionData(data, adelantosDetalleInput = []) {
  const employeeId = String(data?.employeeId || "").trim();
  const monthKey = String(data?.monthKey || "").trim();
  const adelantosDetalle = Array.isArray(adelantosDetalleInput)
    ? adelantosDetalleInput.map(normalizarAdelantoDetalle)
    : [];

  if (!employeeId || !monthKey) {
    return {
      ...data,
      adelantosDetalle,
    };
  }

  const db = getAdminDb();
  const [employeeSnap, asistenciasSnap, cierreSnap] = await Promise.all([
    db.collection("empleados").doc(employeeId).get(),
    db.collection("asistencias").where("employeeId", "==", employeeId).get(),
    db.collection("premiosAsistenciaCierres").doc(monthKey).get(),
  ]);

  const empleado = employeeSnap.exists ? { id: employeeSnap.id, ...employeeSnap.data() } : { id: employeeId };
  const asistencias = asistenciasSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const totAdvLive = adelantosDetalle.reduce((acc, item) => acc + Number(item.monto || 0), 0);
  const totSemanaLive = calcularTotalTrabajadoMensualServer({
    employeeId,
    asistencias,
    monthKey,
    empleado,
  });
  const totExtrasLive = calcularTotalExtrasMensualServer({
    employeeId,
    asistencias,
    monthKey,
    empleado,
  });
  const extrasDetalleLive = buildExtrasDetalleMensualServer({
    employeeId,
    asistencias,
    monthKey,
    empleado,
  });
  const premioAsistenciaLive = calcularPremioAsistenciaMensualServer({
    empleado,
    asistencias,
    monthKey,
  });

  if (cierreSnap.exists) {
    const cierre = { id: cierreSnap.id, ...cierreSnap.data() };
    const cierreEmpleado = Array.isArray(cierre?.empleados)
      ? cierre.empleados.find((item) => String(item.id || item.employeeId || "") === employeeId)
      : null;

    if (cierreEmpleado) {
      return {
        ...data,
        employeeNombre: data?.employeeNombre || cierreEmpleado?.nombre || empleado?.nombre || "",
        employeeSector: data?.employeeSector || empleado?.sector || "",
        labelMes: cierre?.labelMes || data?.labelMes || formatMonthLabelFromKey(monthKey),
        closedAt: cierre?.closedAt || data?.closedAt || null,
        totSemana: Number(cierreEmpleado?.cobrado || 0),
        totExtras: Number(cierreEmpleado?.extras || data?.totExtras || 0),
        totAdv: Number(cierreEmpleado?.adelanto || 0),
        totPagar: Number(cierreEmpleado?.saldoConPremio || 0),
        adelantosDetalle,
        extrasDetalle: Array.isArray(data?.extrasDetalle) && data.extrasDetalle.length > 0
          ? data.extrasDetalle
          : extrasDetalleLive,
        premioAsistencia: normalizePremioAsistenciaSnapshot(
          cierreEmpleado?.premioAsistencia || premioAsistenciaLive
        ),
      };
    }
  }

  const premio = Number(premioAsistenciaLive?.premio || 0);
  return {
    ...data,
    employeeNombre: data?.employeeNombre || empleado?.nombre || "",
    employeeSector: data?.employeeSector || empleado?.sector || "",
    labelMes: data?.labelMes || formatMonthLabelFromKey(monthKey),
    totSemana: Number(totSemanaLive || 0),
    totExtras: Number(totExtrasLive || 0),
    totAdv: Number(totAdvLive || 0),
    totPagar: calcularTotalLiquidacionSnapshot(totSemanaLive, totExtrasLive, totAdvLive, premio),
    adelantosDetalle,
    extrasDetalle: Array.isArray(data?.extrasDetalle) && data.extrasDetalle.length > 0
      ? data.extrasDetalle
      : extrasDetalleLive,
    premioAsistencia: normalizePremioAsistenciaSnapshot(premioAsistenciaLive),
  };
}

export function buildPublicLiquidacionView(data, id, adelantosDetalleInput = []) {
  const adelantosDetalle = Array.isArray(data?.adelantosDetalle) && data.adelantosDetalle.length > 0
    ? data.adelantosDetalle.map(normalizarAdelantoDetalle)
    : Array.isArray(adelantosDetalleInput)
      ? adelantosDetalleInput.map(normalizarAdelantoDetalle)
      : [];
  const totSemana = Number(data?.totSemana || 0);
  const totExtras = Number(data?.totExtras || 0);
  const totAdv = Number(data?.totAdv || 0);
  const premio = Number(data?.premioAsistencia?.premio || 0);
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
    totSemana,
    totExtras,
    totAdv,
    adelantosDetalle,
    extrasDetalle: Array.isArray(data?.extrasDetalle) ? data.extrasDetalle : [],
    totPagar: calcularTotalLiquidacionSnapshot(totSemana, totExtras, totAdv, premio),
    premioAsistencia: {
      premio,
      porcentaje: Number(data?.premioAsistencia?.porcentaje || 0),
      presentes: Number(data?.premioAsistencia?.presentes || 0),
      medias: Number(data?.premioAsistencia?.medias || 0),
      ausentes: Number(data?.premioAsistencia?.ausentes || 0),
      justificadas: Number(data?.premioAsistencia?.justificadas || 0),
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
