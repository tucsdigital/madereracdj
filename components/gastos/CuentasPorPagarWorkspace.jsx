"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  CalendarClock,
  Download,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Share2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { calcularSaldoCuenta, esCuentaAnulada, formatMoneyARS } from "@/lib/erp/cuentas-pagar-calculos";

const todayKey = () => new Date().toISOString().slice(0, 10);

const toDateKey = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : value?.toDate?.() || new Date(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const formatDate = (value) => {
  const key = toDateKey(value);
  if (!key) return "Fecha no informada";
  const [, year, month, day] = key.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  return year ? `${day}/${month}/${year}` : key;
};

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const accountPaidAt = (account, cutoff, movements) => {
  const payments = Array.isArray(account?.pagos) ? account.pagos : [];
  const currentPaid = number(account?.montoPagado);
  const today = todayKey();
  if (cutoff >= today) return currentPaid;

  const movementForPayment = (payment) => {
    const movementId = String(payment?.pagoGlobalId || payment?.saldoAFavorMovimientoId || "");
    if (movementId) return movements.find((movement) => String(movement.id) === movementId) || null;
    if (!payment?.saldoAFavorAplicado) return null;
    const candidates = movements.filter((movement) => {
      if (movement?.tipo !== "saldoAFavor" || movement?.direccion !== "aplicacion_a_cuentas") return false;
      if (toDateKey(movement?.fecha) !== toDateKey(payment?.fecha)) return false;
      return (Array.isArray(movement?.cuentasAplicadas) ? movement.cuentasAplicadas : []).some((item) =>
        String(item?.cuentaId || "") === String(account?.id || "") && Math.abs(number(item?.montoAplicado)) === Math.abs(number(payment?.monto))
      );
    });
    const recordedAt = String(payment?.fechaRegistro || "");
    return candidates.find((movement) => String(movement?.fechaRegistro || "") === recordedAt) || candidates[0] || null;
  };
  const amountAtCutoff = (payment) => {
    const movement = movementForPayment(payment);
    const isReversal = payment?.pagoGlobalReversion === true || payment?.saldoAFavorReversion === true || number(payment?.monto) < 0;
    const paymentDate = isReversal
      ? toDateKey(movement?.anuladoEn) || toDateKey(payment?.fechaRegistro) || toDateKey(payment?.fecha)
      : toDateKey(payment?.fecha);
    if (!paymentDate) return null;
    return paymentDate <= cutoff ? number(payment?.monto) : 0;
  };
  const datedPayments = payments.filter((payment) => amountAtCutoff(payment) !== null);
  const datedTotal = payments.reduce((total, payment) => {
    const amount = amountAtCutoff(payment);
    return total + (amount === null ? 0 : number(payment?.monto));
  }, 0);
  const undatedTotal = payments
    .filter((payment) => amountAtCutoff(payment) === null)
    .reduce((total, payment) => total + number(payment?.monto), 0);
  const missingLegacyPayments = Math.max(currentPaid - datedTotal - undatedTotal, 0);
  const paidBeforeCutoff = datedPayments.reduce((total, payment) => total + number(amountAtCutoff(payment)), 0);

  // Los pagos sin fecha de origen no se pueden ubicar con exactitud; se conservan como anteriores al cierre.
  return Math.max(paidBeforeCutoff + undatedTotal + missingLegacyPayments, 0);
};

const accountBalanceAt = (account, cutoff, movements) => {
  const invoiceDate = toDateKey(account?.fecha);
  if (!invoiceDate || invoiceDate > cutoff) return 0;
  const annulledAt = toDateKey(account?.anuladaEn);
  const annulledNow = esCuentaAnulada(account);
  const cancellationReached = annulledAt ? annulledAt <= cutoff : annulledNow && cutoff >= todayKey();
  if (cancellationReached) return 0;
  return Math.max(number(account?.monto) - accountPaidAt(account, cutoff, movements), 0);
};

const accountStateAt = (account, cutoff, movements) => {
  const invoiceDate = toDateKey(account?.fecha);
  if (invoiceDate && invoiceDate > cutoff) return "Pendiente";
  const annulledAt = toDateKey(account?.anuladaEn);
  if (annulledAt && annulledAt <= cutoff) return "Anulada";
  if (esCuentaAnulada(account) && !annulledAt && cutoff >= todayKey()) return "Anulada";
  const balance = accountBalanceAt(account, cutoff, movements);
  if (balance <= 0 && number(account?.monto) > 0) return "Pagada";
  if (accountPaidAt(account, cutoff, movements) > 0) return "Pago parcial";
  const dueDate = toDateKey(account?.fechaVencimiento);
  return dueDate && dueDate < cutoff ? "Vencida" : "Pendiente";
};

const movementBalanceDelta = (movement) => {
  if (movement?.tipo === "pagoGlobal") {
    if (movement?.montoDeltaSaldoAFavor != null) return number(movement.montoDeltaSaldoAFavor);
    if (movement?.saldoAFavorAntes != null || movement?.saldoAFavorDespues != null) {
      return number(movement.saldoAFavorDespues) - number(movement.saldoAFavorAntes);
    }
    return 0;
  }
  return number(movement?.montoDelta ?? movement?.monto);
};

const advanceBalanceAt = (group, movements, cutoff) => {
  if (cutoff >= todayKey()) return number(group?.saldoAFavor);
  const dated = movements
    .filter((movement) => String(movement?.proveedorId || "") === String(group?.proveedorId || ""))
    .filter((movement) => toDateKey(movement?.fecha))
    .sort((a, b) => toDateKey(a.fecha).localeCompare(toDateKey(b.fecha)));

  if (!dated.length) return 0;
  let balance = number(dated[0]?.saldoAFavorAntes);
  const operations = [];
  for (const movement of dated) {
    const delta = movementBalanceDelta(movement);
    const date = toDateKey(movement.fecha);
    const annulledAt = movement.anulado === true ? toDateKey(movement.anuladoEn) || todayKey() : "";
    if (date <= cutoff) operations.push({ date, delta, order: 0 });
    if (annulledAt && date <= cutoff && annulledAt <= cutoff) {
      operations.push({ date: annulledAt, delta: -delta, order: 1 });
    }
  }
  operations.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  operations.forEach((operation) => {
    balance = Math.max(balance + operation.delta, 0);
  });
  return balance;
};

const makeProviderSnapshot = (group, movements, cutoff) => {
  const accounts = Array.isArray(group?.cuentas) ? group.cuentas : [];
  let pending = 0;
  let overdue = 0;
  let overdueCount = 0;
  let activeAccounts = 0;
  for (const account of accounts) {
    const balance = accountBalanceAt(account, cutoff, movements);
    if (balance <= 0) continue;
    pending += balance;
    activeAccounts += 1;
    const dueDate = toDateKey(account?.fechaVencimiento);
    if (dueDate && dueDate < cutoff) {
      overdue += balance;
      overdueCount += 1;
    }
  }
  return {
    pending,
    overdue,
    overdueCount,
    activeAccounts,
    advances: advanceBalanceAt(group, movements, cutoff),
  };
};

const isAnnulledHistoryEvent = (event = {}) => {
  const status = String(event?.status || "")
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return event?.kind === "anulacion" ||
    event?.movement?.anulado === true ||
    event?.movement?.anulada === true ||
    Boolean(event?.movement?.anuladoEn) ||
    Boolean(event?.account && (esCuentaAnulada(event.account) || event.account?.anuladaEn)) ||
    status === "anulado" ||
    status === "anulada" ||
    status === "anulacion";
};

const makeHistory = (group, movements) => {
  const history = [];
  const accounts = Array.isArray(group?.cuentas) ? group.cuentas : [];
  const providerId = String(group?.proveedorId || group?.proveedor?.id || "");
  const cuentasAnuladasIds = new Set(
    accounts
      .filter((account) => esCuentaAnulada(account) || Boolean(account?.anuladaEn))
      .map((account) => String(account?.id || ""))
      .filter(Boolean)
  );
  const movimientoVinculadoACuentaAnulada = (movement) => {
    const appliedAccountIds = Array.isArray(movement?.cuentasAplicadas)
      ? movement.cuentasAplicadas.map((application) => String(application?.cuentaId || ""))
      : [];
    const accountIds = [movement?.cuentaId, movement?.facturaId, ...appliedAccountIds]
      .map((id) => String(id || ""))
      .filter(Boolean);
    return accountIds.some((id) => cuentasAnuladasIds.has(id));
  };
  const providerMovementsAll = movements.filter((movement) => String(movement?.proveedorId || "") === providerId);
  const isHiddenMovement = (movement) =>
    movement?.anulado === true ||
    movement?.anulada === true ||
    Boolean(movement?.anuladoEn) ||
    movimientoVinculadoACuentaAnulada(movement);
  const hiddenMovementIds = new Set(
    providerMovementsAll.filter(isHiddenMovement).map((movement) => String(movement?.id || "")).filter(Boolean)
  );
  const providerMovements = providerMovementsAll.filter((movement) => !isHiddenMovement(movement));
  const globalMovementIds = new Set(providerMovements.filter((movement) => movement.tipo === "pagoGlobal").map((movement) => String(movement.id)));

  accounts.forEach((account) => {
    if (esCuentaAnulada(account) || account?.anuladaEn) return;
    const date = toDateKey(account?.fecha);
    if (date) {
      history.push({
        id: `factura-${account.id}`,
        account,
        date,
        kind: "factura",
        title: "Factura registrada",
        description: [account.concepto || account.descripcion, account.numeroComprobante || account.nroComprobante || account.comprobanteNumero]
          .filter(Boolean)
          .join(" · ") || "Cuenta por pagar",
        amount: number(account.monto),
        status: esCuentaAnulada(account) && !toDateKey(account?.anuladaEn) ? "Anulada" : "Registrada",
        rank: 0,
      });
    }

    const cancelledAt = toDateKey(account?.anuladaEn);
    if (esCuentaAnulada(account) && cancelledAt) {
      history.push({
        id: `anulacion-factura-${account.id}`,
        account,
        date: cancelledAt,
        kind: "anulacion",
        title: "Factura anulada",
        description: account.anulacionMotivo || "Se anuló la cuenta por pagar",
        amount: 0,
        status: "Anulada",
        rank: 2,
      });
    }

    (Array.isArray(account?.pagos) ? account.pagos : []).forEach((payment, index) => {
      const linkedMovementId = String(payment?.pagoGlobalId || payment?.saldoAFavorMovimientoId || "");
      const isGlobal = payment?.pagoGlobalProveedor === true ||
        globalMovementIds.has(linkedMovementId) ||
        hiddenMovementIds.has(linkedMovementId);
      if (isGlobal) return;
      const paymentDate = toDateKey(payment?.fecha);
      if (!paymentDate) return;
      const amount = number(payment?.monto);
      const reversed = payment?.anulado === true || payment?.anulada === true || payment?.pagoGlobalReversion === true || amount < 0 || String(payment?.metodo || "").toLowerCase() === "anulación";
      if (reversed) return;
      history.push({
        id: `pago-${account.id}-${index}`,
        account,
        date: paymentDate,
        kind: "pago",
        title: "Pago aplicado a factura",
        description: [account.concepto || account.descripcion, payment?.metodo, payment?.notas].filter(Boolean).join(" · ") || "Pago individual",
        amount,
        status: "Aplicado",
        rank: 1,
      });
    });
  });

  providerMovements.forEach((movement) => {
    const date = toDateKey(movement?.fecha);
    if (!date) return;
    if (movement.tipo === "pagoGlobal") {
      history.push({
        id: movement.id,
        movement,
        date,
        kind: "pago",
        title: "Pago al proveedor",
        description: [movement.metodo, movement.notas].filter(Boolean).join(" · ") || "Pago registrado",
        amount: number(movement.pagoIngresado ?? movement.monto),
        detail: number(movement.aplicadoACuentas) > 0 ? `En la operación se imputaron ${formatMoneyARS(movement.aplicadoACuentas)} a facturas (puede incluir adelantos previos)` : "Quedó como adelanto pendiente de aplicar",
        status: movement.anulado ? "Anulado" : "Registrado",
        rank: 1,
      });
      if (movement.anulado === true && toDateKey(movement.anuladoEn)) {
        history.push({
          id: `anulacion-${movement.id}`,
          movement,
          date: toDateKey(movement.anuladoEn),
          kind: "anulacion",
          title: "Pago al proveedor anulado",
          description: movement.anulacionMotivo || "Se revirtió el pago registrado",
          amount: 0,
          status: "Anulación",
          rank: 2,
        });
      }
      return;
    }

    if (movement.tipo !== "saldoAFavor") return;
    const direction = String(movement.direccion || "");
    const delta = movementBalanceDelta(movement);
    if (direction === "adelanto") {
      history.push({
        id: movement.id,
        movement,
        date,
        kind: "adelanto",
        title: "Adelanto al proveedor",
        description: [movement.metodo, movement.notas].filter(Boolean).join(" · ") || "Dinero entregado por adelantado",
        amount: Math.abs(delta),
        status: movement.anulado ? "Anulado" : "Pendiente de aplicar",
        rank: 1,
      });
    } else if (direction === "aplicacion_a_cuentas") {
      history.push({
        id: movement.id,
        movement,
        date,
        kind: "aplicacion",
        title: "Aplicación de adelanto",
        description: "Se imputó a facturas; no representa un nuevo pago",
        detail: number(movement.aplicadoACuentas) > 0 ? `Aplicado: ${formatMoneyARS(movement.aplicadoACuentas)}` : "Aplicación registrada",
        amount: 0,
        status: movement.anulado ? "Anulada" : "Aplicado",
        rank: 1,
      });
    } else {
      history.push({
        id: movement.id,
        movement,
        date,
        kind: "ajuste",
        title: "Ajuste de adelantos",
        description: [movement.metodo, movement.notas].filter(Boolean).join(" · ") || "Corrección del saldo de adelantos",
        amount: delta,
        status: movement.anulado ? "Anulado" : "Registrado",
        rank: 1,
      });
    }

    if (movement.anulado === true && toDateKey(movement.anuladoEn)) {
      history.push({
        id: `anulacion-${movement.id}`,
        movement,
        date: toDateKey(movement.anuladoEn),
        kind: "anulacion",
        title: "Movimiento anulado",
        description: movement.anulacionMotivo || "Se revirtió el movimiento de adelantos",
        amount: 0,
        status: "Anulación",
        rank: 2,
      });
    }
  });

  return history
    .filter((event) => !isAnnulledHistoryEvent(event))
    .sort((a, b) => b.date.localeCompare(a.date) || b.rank - a.rank || String(a.id).localeCompare(String(b.id)));
};

const kindLabels = {
  factura: "Factura",
  pago: "Pago",
  adelanto: "Adelanto",
  aplicacion: "Aplicación de adelanto",
  ajuste: "Ajuste",
};

const statusOrder = ["Pendiente", "Vencida", "Pago parcial", "Pagada", "Registrado", "Aplicado", "Pendiente de aplicar"];

export default function CuentasPorPagarWorkspace({
  providerGroups = [],
  movements = [],
  suppliers = [],
  loadError = "",
  onRetry,
  onNewAccount,
  onExport,
  onShareProvider,
  onDownloadProviderPdf,
  pdfLoadingProviderId,
  onOpenAdvance,
  onAccountHistory,
  onAccountPayment,
  onAccountEdit,
  onAccountCancel,
  onMovementDetail,
  onMovementDelete,
  busy,
}) {
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(todayKey());
  const [kindFilter, setKindFilter] = useState("factura");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filteredProviders = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-AR");
    return providerGroups.filter((group) => {
      if (!term) return true;
      const provider = group.proveedor || {};
      return [provider.nombre, provider.cuit, provider.telefono].some((value) => String(value || "").toLocaleLowerCase("es-AR").includes(term));
    });
  }, [providerGroups, search]);

  const selectedGroup = useMemo(
    () => providerGroups.find((group) => String(group.proveedorId || group.proveedor?.id || "") === selectedProviderId) || null,
    [providerGroups, selectedProviderId]
  );
  const history = useMemo(() => selectedGroup ? makeHistory(selectedGroup, movements) : [], [selectedGroup, movements]);
  const snapshot = useMemo(
    () => selectedGroup ? makeProviderSnapshot(selectedGroup, movements, dateTo || todayKey()) : null,
    [selectedGroup, movements, dateTo]
  );
  const historyForKind = useMemo(() => history
    .filter((event) => {
      if (isAnnulledHistoryEvent(event)) return false;
      if (dateTo && event.date > dateTo) return false;
      return kindFilter === "todos" || event.kind === kindFilter;
    })
    .map((event) => event.kind === "factura"
      ? { ...event, status: accountStateAt(event.account, dateTo || todayKey(), movements) }
      : event)
    .filter((event) => !isAnnulledHistoryEvent(event)), [history, dateTo, kindFilter, movements]);
  const statusOptions = useMemo(() => Array.from(new Set(
    historyForKind.map((event) => String(event.status || "").trim()).filter(Boolean)
  )).sort((a, b) => {
    const aIndex = statusOrder.indexOf(a);
    const bIndex = statusOrder.indexOf(b);
    if (aIndex < 0 && bIndex < 0) return a.localeCompare(b, "es-AR");
    if (aIndex < 0) return 1;
    if (bIndex < 0) return -1;
    return aIndex - bIndex;
  }), [historyForKind]);
  const showStatusFilter = kindFilter !== "todos" && statusOptions.length > 1;
  const filteredHistory = useMemo(() => historyForKind
    .filter((event) => {
      if (dateFrom && event.date < dateFrom) return false;
      return statusFilter === "todos" || event.status === statusFilter;
    }), [historyForKind, dateFrom, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredHistory.length / pageSize));
  const visibleHistory = filteredHistory.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [selectedProviderId, dateFrom, dateTo, kindFilter, statusFilter]);
  useEffect(() => {
    if (statusFilter !== "todos" && !statusOptions.includes(statusFilter)) {
      setStatusFilter("todos");
    }
  }, [statusFilter, statusOptions]);

  const openProvider = (group) => {
    setKindFilter("factura");
    setStatusFilter("todos");
    setSelectedProviderId(String(group.proveedorId || group.proveedor?.id || ""));
  };
  const openNewAccount = (providerId = "") => {
    if (providerId) setSelectedProviderId(String(providerId));
    onNewAccount?.(providerId);
  };
  const selectedProvider = selectedGroup?.proveedor || suppliers.find((provider) => String(provider.id) === selectedProviderId) || {};
  const providerId = String(selectedGroup?.proveedorId || selectedProvider.id || selectedProviderId || "");
  const currentAdvance = number(selectedGroup?.saldoAFavor);

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-6 px-1 pb-8 text-slate-900 sm:px-2">
      {loadError ? (
        <div role="alert" className="flex flex-col gap-3 border-l-2 border-red-600 bg-red-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-red-900"><AlertTriangle className="h-4 w-4 shrink-0" />{loadError}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry} className="self-start border-red-200 bg-white text-red-900 hover:bg-red-50 sm:self-auto">Reintentar</Button>
        </div>
      ) : null}
      {!selectedGroup ? (
        <>
          <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">Elegí un proveedor para consultar sus facturas, pagos y adelantos en una sola cuenta corriente.</p>
            </div>
            <Button type="button" onClick={() => openNewAccount()} className="h-10 self-start rounded-lg bg-[#183f38] px-4 text-white hover:bg-[#24574d] sm:self-auto">
              <Plus className="mr-2 h-4 w-4" />Registrar factura
            </Button>
          </header>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-baseline gap-3">
                <h3 className="text-lg font-semibold tracking-tight">Proveedores</h3>
                <span className="text-xs tabular-nums text-slate-500">{filteredProviders.length} resultados</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">Seleccioná uno para ver el saldo y el historial.</p>
            </div>
            <label className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar proveedor, CUIT o teléfono" aria-label="Buscar proveedor" className="h-10 rounded-none border-0 border-b border-slate-300 bg-transparent pl-7 shadow-none focus-visible:border-slate-900 focus-visible:ring-0" />
            </label>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="hidden grid-cols-[minmax(220px,1.5fr)_minmax(150px,.8fr)_minmax(190px,1fr)_96px] gap-4 bg-slate-50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500 sm:grid">
              <span>Proveedor</span><span className="text-right">Pendiente actual</span><span className="text-right">Adelantos pendientes de aplicar</span><span />
            </div>
            {loadError ? (
              <div className="py-12 text-center text-sm text-slate-600">La lista no está disponible hasta recuperar la conexión.</div>
            ) : filteredProviders.length ? filteredProviders.map((group) => {
              const provider = group.proveedor || {};
              const id = String(group.proveedorId || provider.id || "");
              return (
                <button key={id} type="button" onClick={() => openProvider(group)} className="grid w-full cursor-pointer gap-3 border-t border-slate-200 px-4 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#183f38] motion-reduce:transition-none sm:grid-cols-[minmax(220px,1.5fr)_minmax(150px,.8fr)_minmax(190px,1fr)_96px] sm:items-center sm:gap-4">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold uppercase">{provider.nombre || "Proveedor sin nombre"}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{provider.cuit ? `CUIT ${provider.cuit}` : "CUIT no informado"}{provider.telefono ? ` · ${provider.telefono}` : ""}</span>
                  </span>
                  <span className="flex justify-between gap-3 text-sm tabular-nums sm:justify-end"><span className="text-xs text-slate-500 sm:hidden">Pendiente actual</span><strong className={number(group.saldoPendienteBruto) ? "font-semibold text-slate-900" : "font-medium text-slate-500"}>{formatMoneyARS(group.saldoPendienteBruto)}</strong></span>
                  <span className="flex justify-between gap-3 text-sm tabular-nums sm:justify-end"><span className="text-xs text-slate-500 sm:hidden">Adelantos pendientes de aplicar</span><strong className="font-medium text-emerald-800">{formatMoneyARS(group.saldoAFavor)}</strong></span>
                  <span className="hidden text-right text-xs font-semibold text-[#183f38] sm:block">Ver cuenta <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></span>
                </button>
              );
            }) : (
              <div className="py-12 text-center">
                <Building2 className="mx-auto mb-3 h-5 w-5 text-slate-400" />
                <p className="text-sm font-medium text-slate-800">No hay proveedores para mostrar</p>
                <p className="mt-1 text-sm text-slate-500">Probá otra búsqueda o registrá una factura para comenzar.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <header className="border-b border-slate-200 pb-5">
            <Button type="button" variant="ghost" onClick={() => setSelectedProviderId("")} className="mb-4 -ml-3 h-8 px-3 text-slate-600 hover:text-slate-950">
              <ArrowLeft className="mr-2 h-4 w-4" />Todos los proveedores
            </Button>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.18em] text-amber-700">Cuenta corriente</p>
                <h2 className="truncate text-3xl font-semibold tracking-[-.04em] uppercase sm:text-4xl">{selectedProvider.nombre || "Proveedor"}</h2>
                <p className="mt-2 text-sm text-slate-500">{selectedProvider.cuit ? `CUIT ${selectedProvider.cuit}` : "CUIT no informado"}{selectedProvider.telefono ? ` · ${selectedProvider.telefono}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => openNewAccount(providerId)} className="h-9"><Plus className="mr-1.5 h-4 w-4" />Factura</Button>
                <Button type="button" variant="outline" onClick={() => onOpenAdvance?.({ proveedorId: providerId, proveedorNombre: selectedProvider.nombre, saldoAFavor: currentAdvance })} className="h-9"><ArrowDownLeft className="mr-1.5 h-4 w-4" />Registrar adelanto</Button>
              </div>
            </div>
          </header>

          <section aria-label="Saldos al cierre del período" className="grid grid-cols-1 divide-y divide-slate-200 border-y border-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <SnapshotMetric title="Pendiente al cierre" value={formatMoneyARS(snapshot?.pending)} detail={`${snapshot?.activeAccounts || 0} facturas abiertas · no descuenta adelantos`} />
            <SnapshotMetric title="Vencido al cierre" value={formatMoneyARS(snapshot?.overdue)} detail={`${snapshot?.overdueCount || 0} facturas vencidas`} tone={snapshot?.overdue > 0 ? "red" : "default"} />
            <SnapshotMetric title="Adelantos pendientes de aplicar" value={formatMoneyARS(snapshot?.advances)} detail="Dinero ya entregado al proveedor" tone="green" />
          </section>

          <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-lg font-semibold tracking-tight">Historial de movimientos</h3>
                <span className="text-xs tabular-nums text-slate-500">{filteredHistory.length} resultados</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">Se muestran eventos del período; los anteriores también cuentan para calcular los saldos al cierre de “Hasta”.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:flex xl:items-end">
              <label className="space-y-1 text-xs text-slate-500"><span>Desde</span><Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="h-9 w-full sm:w-40" /></label>
              <label className="space-y-1 text-xs text-slate-500"><span>Hasta</span><Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="h-9 w-full sm:w-40" /></label>
              <label className="col-span-2 space-y-1 text-xs text-slate-500 sm:col-span-1">
                <span className="sr-only">Tipo de movimiento</span>
                <Select value={kindFilter} onValueChange={(value) => {
                  setKindFilter(value);
                  setStatusFilter("todos");
                }}>
                  <SelectTrigger aria-label="Tipo de movimiento" className="h-9 w-full sm:w-48"><SelectValue placeholder="Todos los movimientos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los movimientos</SelectItem>
                    {Object.entries(kindLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              {showStatusFilter ? (
                <label className="col-span-2 space-y-1 text-xs text-slate-500 sm:col-span-1">
                  <span>Estado</span>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger aria-label="Filtrar por estado" className="h-9 w-full sm:w-40"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los estados</SelectItem>
                      {statusOptions.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              ) : null}
              <Button type="button" variant="outline" onClick={() => onExport?.({ events: filteredHistory, provider: selectedProvider, from: dateFrom, to: dateTo })} disabled={!filteredHistory.length} className="col-span-2 h-9 sm:col-span-1">
                <Download className="mr-1.5 h-4 w-4" />Exportar
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            {visibleHistory.length ? visibleHistory.map((event) => (
              <HistoryRow
                key={`${event.kind}-${event.id}`}
                event={event}
                busy={busy}
                onAccountHistory={onAccountHistory}
                onAccountPayment={onAccountPayment}
                onAccountEdit={onAccountEdit}
                onAccountCancel={onAccountCancel}
                onMovementDetail={onMovementDetail}
                onMovementDelete={onMovementDelete}
              />
            )) : (
              <div className="py-12 text-center">
                <CalendarClock className="mx-auto mb-3 h-5 w-5 text-slate-400" />
                <p className="text-sm font-medium text-slate-800">No hay movimientos en este período</p>
                <p className="mt-1 text-sm text-slate-500">Ampliá las fechas o elegí otro tipo de movimiento.</p>
              </div>
            )}
            {filteredHistory.length > pageSize ? (
              <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredHistory.length)} de {filteredHistory.length}</p>
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>Anterior</Button>
                  <span className="min-w-12 text-center text-xs tabular-nums text-slate-500">{page} / {pageCount}</span>
                  <Button type="button" size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(current + 1, pageCount))}>Siguiente</Button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function SnapshotMetric({ title, value, detail, tone = "default" }) {
  const toneClass = tone === "green" ? "text-emerald-800" : tone === "red" ? "text-red-700" : "text-slate-950";
  return (
    <div className="min-w-0 px-4 py-4 first:pl-0 sm:px-5 sm:py-5">
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <p className={`mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function HistoryRow({ event, busy, onAccountHistory, onAccountPayment, onAccountEdit, onAccountCancel, onMovementDetail, onMovementDelete }) {
  const account = event.account;
  const movement = event.movement;
  const isInvoice = event.kind === "factura";
  const canPay = isInvoice && !esCuentaAnulada(account) && calcularSaldoCuenta(account) > 0;
  const hasMovementActions = Boolean(movement) && event.kind !== "anulacion";
  const amountClass = event.kind === "adelanto" || event.kind === "pago" ? "text-emerald-800" : event.amount < 0 ? "text-red-700" : "text-slate-900";

  return (
    <article className="grid gap-3 border-b border-slate-200 px-3 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(130px,.35fr)_auto] sm:items-center sm:gap-5 sm:px-4">
      <div className="flex min-w-0 items-start gap-3">
        <EventMark kind={event.kind} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="text-sm font-semibold text-slate-900">{event.title}</h4>
            <StatusBadge status={event.status} />
          </div>
          <p className="mt-1 break-words text-xs text-slate-600">{event.description}</p>
          {event.detail ? <p className="mt-1 text-xs text-slate-500">{event.detail}</p> : null}
          <p className="mt-1 text-xs tabular-nums text-slate-400">{formatDate(event.date)}{event.account?.fechaVencimiento && isInvoice ? ` · Vence ${formatDate(event.account.fechaVencimiento)}` : ""}</p>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
        <span className="text-xs text-slate-500 sm:hidden">{kindLabels[event.kind] || "Importe"}</span>
        <span className={`text-sm font-semibold tabular-nums ${amountClass}`}>{event.kind === "aplicacion" ? "—" : formatMoneyARS(event.amount)}</span>
      </div>

      <div className="flex items-center justify-end gap-1 border-t border-slate-100 pt-2 sm:border-0 sm:pt-0">
        {canPay ? <Button type="button" size="sm" onClick={() => onAccountPayment?.(account)} className="h-8 bg-[#183f38] px-3 text-xs text-white hover:bg-[#24574d]">Pagar</Button> : null}
        {event.kind === "factura" || event.kind === "pago" && account ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Más acciones del movimiento"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {account ? <DropdownMenuItem onSelect={() => onAccountHistory?.(account)}><Eye className="mr-2 h-4 w-4" />Ver pagos de la factura</DropdownMenuItem> : null}
              {isInvoice && !esCuentaAnulada(account) ? <>
                <DropdownMenuItem onSelect={() => onAccountEdit?.(account)}><Pencil className="mr-2 h-4 w-4" />Editar factura</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-700 focus:text-red-700" onSelect={() => onAccountCancel?.(account)} disabled={busy}>Anular factura</DropdownMenuItem>
              </> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {hasMovementActions ? (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => onMovementDetail?.(movement)} className="h-8 px-2 text-xs text-slate-600"><Eye className="mr-1.5 h-3.5 w-3.5" />Detalle</Button>
            {!movement.anulado ? <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Más acciones del movimiento"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem className="text-red-700 focus:text-red-700" onSelect={() => onMovementDelete?.(movement)} disabled={busy}>Eliminar movimiento</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu> : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

function StatusBadge({ status }) {
  if (!status) return null;
  const normalized = String(status)
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const styles = {
    pendiente: "border-amber-200 bg-amber-50 text-amber-900",
    vencida: "border-red-200 bg-red-50 text-red-800",
    "pago parcial": "border-blue-200 bg-blue-50 text-blue-800",
    pagada: "border-emerald-200 bg-emerald-50 text-emerald-800",
    registrado: "border-slate-300 bg-slate-100 text-slate-800",
    aplicado: "border-emerald-200 bg-emerald-50 text-emerald-800",
    "pendiente de aplicar": "border-amber-200 bg-amber-50 text-amber-900",
  };
  const dots = {
    pendiente: "bg-amber-600",
    vencida: "bg-red-600",
    "pago parcial": "bg-blue-600",
    pagada: "bg-emerald-600",
    registrado: "bg-slate-600",
    aplicado: "bg-emerald-600",
    "pendiente de aplicar": "bg-amber-600",
  };
  const style = styles[normalized] || "border-slate-300 bg-slate-100 text-slate-800";
  const dot = dots[normalized] || "bg-slate-500";

  return (
    <span aria-label={`Estado: ${status}`} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium leading-none ${style}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

function EventMark({ kind }) {
  const style = kind === "adelanto" ? "bg-emerald-50 text-emerald-800" : kind === "factura" ? "bg-slate-100 text-slate-700" : kind === "anulacion" ? "bg-red-50 text-red-700" : kind === "aplicacion" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800";
  const Icon = kind === "factura" ? FileText : kind === "adelanto" ? ArrowDownLeft : kind === "aplicacion" ? ArrowLeftRight : kind === "anulacion" ? ArrowUpRight : Wallet;
  return <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style}`} aria-hidden="true"><Icon className="h-4 w-4" /></span>;
}
