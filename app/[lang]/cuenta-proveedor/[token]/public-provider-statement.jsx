"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, ArrowDownToLine, Building2, CalendarDays, Loader2, Printer, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

const currency = (value) => `$${Number(value || 0).toLocaleString("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const dateLabel = (value) => {
  if (!value) return "No informada";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
};

const statusLabel = (status) => ({
  pendiente: "Pendiente",
  parcial: "Pago parcial",
  pagado: "Pagada",
  vencida: "Vencida",
  anulada: "Anulada",
}[status] || "Pendiente");

const statusTone = (status) => {
  if (status === "pagado") return "bg-emerald-600";
  if (status === "vencida") return "bg-red-600";
  if (status === "anulada") return "bg-slate-400";
  if (status === "parcial") return "bg-amber-500";
  return "bg-blue-600";
};

export default function PublicProviderStatement({ token }) {
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/public/cuentas-por-pagar/${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "No se pudo abrir el estado de cuenta.");
        if (mounted) setStatement(payload.statement);
      } catch (loadError) {
        if (mounted) setError(loadError?.message || "No se pudo abrir el estado de cuenta.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [token]);

  const printDocument = () => window.print();
  const pdfUrl = `/api/public/cuentas-por-pagar/${encodeURIComponent(token)}/pdf`;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-[#183f38]" />Cargando estado de cuenta…
        </div>
      </main>
    );
  }

  if (error || !statement) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="max-w-md border-l-2 border-amber-500 py-2 pl-5 text-left">
          <AlertCircle className="mb-3 h-5 w-5 text-amber-700" />
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Estado de cuenta no disponible</h1>
          <p className="mt-2 text-sm text-slate-600">{error || "El enlace puede haber vencido o haber sido revocado."}</p>
          <p className="mt-4 text-xs text-slate-500">Solicitá a Maderas Caballero un enlace vigente.</p>
        </section>
      </main>
    );
  }

  const summary = statement.summary || {};
  return (
    <main className="min-h-screen bg-[#fafaf8] px-4 py-6 text-slate-900 sm:px-8 sm:py-9">
      <div className="statement-shell mx-auto max-w-6xl space-y-7 sm:space-y-9">
        <header className="flex flex-col gap-5 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[#183f38]"><Building2 className="h-3.5 w-3.5" />Maderas Caballero</div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.18em] text-amber-700">Proveedores · Tesorería</p>
            <h1 className="text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Estado de cuenta</h1>
            <p className="mt-2 text-sm text-slate-500"><span className="uppercase">{statement.provider?.name || "Proveedor"}</span>{statement.provider?.taxId ? ` · CUIT ${statement.provider.taxId}` : ""}</p>
          </div>
          <div className="statement-actions flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={printDocument} className="text-slate-600 hover:bg-slate-100 hover:text-slate-950">
              <Printer className="mr-2 h-4 w-4" />Imprimir
            </Button>
            <Button asChild variant="default" className="bg-[#183f38] text-white hover:bg-[#24574d]">
              <a href={pdfUrl}>
                <ArrowDownToLine className="mr-2 h-4 w-4" />Descargar PDF
              </a>
            </Button>
          </div>
        </header>

        <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            <CalendarDays className="h-4 w-4 text-[#183f38]" />
            <span>{statement.isFiltered
              ? `Movimientos del ${dateLabel(statement.period?.from)} al ${dateLabel(statement.period?.to)}`
              : "Historial completo"}</span>
          </div>
          <span className="text-xs text-slate-500">Actualizado {dateLabel(statement.generatedAt)}</span>
        </div>

        <section className="grid grid-cols-2 divide-x divide-y divide-slate-200/80 border-y border-slate-200/80 sm:grid-cols-4 sm:divide-y-0" aria-label="Resumen de cuenta">
          <SummaryMetric label="Total de cuentas" value={currency(summary.accountTotal)} primary />
          <SummaryMetric label="Pagado a la fecha" value={currency(summary.paidToDate)} tone="green" />
          <SummaryMetric label="Saldo pendiente bruto" value={currency(summary.grossBalance)} tone="red" detail={`${summary.overdueCount || 0} cuenta(s) vencida(s)`} />
          <SummaryMetric label="Saldo a favor" value={currency(summary.creditBalance)} tone="blue" detail={summary.netBalance > 0 ? `Pendiente neto ${currency(summary.netBalance)}` : `Remanente ${currency(summary.creditRemainder)}`} />
        </section>

        {statement.isFiltered ? (
          <div className="border-l-2 border-amber-500 py-1 pl-3 text-sm text-amber-900">
            Este enlace filtra los movimientos por período. Los saldos del resumen reflejan la cuenta actual, no solo los movimientos visibles.
          </div>
        ) : null}

        <section className="statement-section space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Cuentas y pagos aplicados</h2>
              <p className="text-sm text-slate-500">Cada pago se presenta dentro de la cuenta a la que fue aplicado.</p>
            </div>
            <span className="hidden text-sm text-slate-500 sm:block">{statement.accounts?.length || 0} cuenta(s)</span>
          </div>
          {statement.accounts?.length ? statement.accounts.map((account) => (
            <article key={account.id} className={`statement-card border-b border-slate-200/80 py-4 sm:py-5 ${account.annulled ? "opacity-60" : ""}`}>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(110px,.7fr))] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${statusTone(account.status)}`} aria-hidden="true" />
                    <h3 className="font-semibold">{account.concept || "Cuenta por pagar"}</h3>
                    <span className="text-xs text-slate-500">{statusLabel(account.status)}</span>
                  </div>
                  {account.invoiceNumber ? <p className="mt-1 text-xs text-slate-500">Comprobante {account.invoiceNumber}</p> : null}
                  <p className="mt-1 text-xs text-slate-500">Emitida {dateLabel(account.date)} · Vence {dateLabel(account.dueDate)}</p>
                </div>
                <Amount label="Total" value={currency(account.total)} />
                <Amount label="Pagado a la fecha" value={currency(account.paidToDate)} tone="green" />
                <Amount label="Saldo actual" value={currency(account.balance)} tone={account.balance > 0 ? "red" : "default"} />
              </div>
              <div className="mt-4 border-l border-amber-500/60 pl-4 sm:ml-2 sm:pl-5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Pagos aplicados</p>
                {account.payments?.length ? (
                  <div className="divide-y divide-slate-200/70">
                    {account.payments.map((payment) => (
                      <div key={`${account.id}-${payment.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium">{dateLabel(payment.date)}</span>
                          <span className="ml-2 text-slate-500">{payment.origin} · {payment.method}</span>
                          {payment.annulled ? <span className="ml-2 text-xs font-medium text-red-700">Anulado</span> : null}
                        </div>
                        <span className={`font-semibold ${payment.amount < 0 ? "text-red-700" : "text-emerald-700"}`}>{currency(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-500">No hay pagos en el período seleccionado.</p>}
              </div>
            </article>
          )) : (
            <div className="py-10 text-center text-sm text-slate-500">No hay cuentas ni pagos dentro del alcance de este enlace.</div>
          )}
        </section>

        <section className="statement-section">
          <div className="border-b border-slate-200/80 pb-3">
            <h2 className="font-semibold tracking-tight">Pagos globales y movimientos de saldo a favor</h2>
            <p className="mt-1 text-sm text-slate-500">Los pagos globales resumen aplicaciones que ya se muestran por cuenta; no deben sumarse dos veces.</p>
          </div>
          {statement.movements?.length ? (
            <div className="divide-y divide-slate-200/70">
              {statement.movements.map((movement) => (
                <div key={movement.id} className={`grid gap-3 py-3 text-sm sm:grid-cols-[1fr_1.5fr_repeat(3,auto)] sm:items-center ${movement.annulled ? "opacity-60" : ""}`}>
                  <span className="text-slate-600">{dateLabel(movement.date)}</span>
                  <span className="font-medium">{movement.type}{movement.annulled ? " · Anulado" : ""}<span className="block text-xs font-normal text-slate-500">{movement.method}</span></span>
                  <Amount label="Ingresado / ajuste" value={currency(movement.amount)} compact />
                  <Amount label="Aplicado a cuentas" value={currency(movement.applied)} compact />
                  <Amount label="Cambio saldo a favor" value={currency(movement.creditDelta)} compact />
                </div>
              ))}
            </div>
          ) : <p className="p-5 text-sm text-slate-500">No hay movimientos en el período seleccionado.</p>}
        </section>

        <footer className="border-t border-slate-200/80 pt-4 text-center text-xs text-slate-500">
          Estado informativo emitido {dateLabel(statement.generatedAt)}. Ante cualquier diferencia, comuníquese con Maderas Caballero.
        </footer>
      </div>
      <style jsx global>{`
        @media print {
          body { background: #fff !important; }
          main { background: #fff !important; padding: 0 !important; }
          .statement-shell { max-width: none !important; }
          .statement-actions { display: none !important; }
          .statement-card, .statement-section { break-inside: avoid; box-shadow: none !important; }
          a { color: inherit !important; text-decoration: none !important; }
        }
      `}</style>
    </main>
  );
}

function SummaryMetric({ label, value, tone = "default", detail, primary = false }) {
  const color = tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-700" : tone === "blue" ? "text-blue-700" : "text-slate-900";
  return (
    <div className={`min-w-0 px-3 py-4 first:pl-0 sm:px-5 sm:py-5 ${primary ? "col-span-2 sm:col-span-1" : ""}`}>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`mt-1 truncate tabular-nums font-semibold tracking-tight ${primary ? "text-2xl sm:text-[1.7rem]" : "text-lg sm:text-xl"} ${color}`}>{value}</p>
      {detail ? <p className="mt-1 text-[11px] text-slate-400">{detail}</p> : null}
    </div>
  );
}

function Amount({ label, value, tone = "default", compact = false }) {
  const color = tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-700" : "text-slate-900";
  return (
    <div className={compact ? "sm:text-right" : "min-w-0"}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-semibold ${color}`}>{value}</p>
    </div>
  );
}
