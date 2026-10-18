"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Check, Clock3, Loader2, RefreshCw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Btn } from "@/components/tienda-web/ui";

const EVENT_OPTIONS = [
  ["created", "Nuevo pedido"],
  ["confirmed", "Pago confirmado"],
  ["cancelled", "Pedido cancelado"],
  ["paymentFailed", "Pago rechazado"],
  ["review", "Requiere revisión"],
];

const STATUS = {
  sent: { label: "Enviado", style: "bg-emerald-50 text-emerald-800" },
  delivered: { label: "Entregado", style: "bg-emerald-50 text-emerald-800" },
  failed: { label: "Error", style: "bg-red-50 text-red-800" },
  sending: { label: "Enviando", style: "bg-amber-50 text-amber-800" },
  pending: { label: "Pendiente", style: "bg-default-100 text-default-600" },
  delayed: { label: "Demorado", style: "bg-amber-50 text-amber-800" },
  bounced: { label: "No entregado", style: "bg-red-50 text-red-800" },
  complained: { label: "Reportado como spam", style: "bg-red-50 text-red-800" },
  provider_failed: { label: "No entregado", style: "bg-red-50 text-red-800" },
  suppressed: { label: "No enviado", style: "bg-amber-50 text-amber-800" },
  send_failed: { label: "Error", style: "bg-red-50 text-red-800" },
  accepted: { label: "Enviado", style: "bg-emerald-50 text-emerald-800" },
};

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function eventStatus(event) {
  return STATUS[event.deliveryStatus] || STATUS[event.status] || STATUS.pending;
}

export default function NotificacionesPedidosForm({
  notifications,
  reservationMinutes = 10,
  onReservationMinutesChange,
  issues = [],
  onChange,
  authFetch,
}) {
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [retrying, setRetrying] = useState("");
  const [notice, setNotice] = useState(null);
  const settings = notifications || { enabled: false, recipients: [], events: {} };
  const emailLines = (settings.recipients || []).join("\n");
  const invalidRecipients = issues.filter((issue) => issue.field?.startsWith("recipient-") || issue.field === "recipients");
  const parsedRecipients = [...new Set(emailLines.split(/[\n,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const data = await authFetch("/api/tienda/notificaciones/eventos?limit=30");
      setEvents(Array.isArray(data.items) ? data.items : []);
    } catch {
      setNotice({ type: "error", text: "No se pudo cargar el historial." });
    } finally {
      setLoadingEvents(false);
    }
  }, [authFetch]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const sendTest = async () => {
    setSendingTest(true);
    setNotice(null);
    try {
      await authFetch("/api/tienda/notificaciones/prueba", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: parsedRecipients }),
      });
      setNotice({ type: "ok", text: "Correo de prueba enviado." });
    } catch {
      setNotice({ type: "error", text: "No se pudo enviar. Revisá los destinatarios e intentá nuevamente." });
    } finally {
      setSendingTest(false);
    }
  };

  const retry = async (event) => {
    setRetrying(event.id);
    setNotice(null);
    try {
      const result = await authFetch(`/api/tienda/notificaciones/eventos/${encodeURIComponent(event.id)}/retry`, { method: "POST" });
      setNotice({ type: "ok", text: result.alreadySent ? "El aviso ya fue enviado." : result.status === "sending" ? "El aviso ya se está enviando." : "Aviso reenviado." });
      await loadEvents();
    } catch {
      setNotice({ type: "error", text: "No se pudo reenviar el aviso." });
      await loadEvents();
    } finally {
      setRetrying("");
    }
  };

  const updateReservationMinutes = (value) => {
    const parsed = Number(value);
    onReservationMinutesChange?.(Number.isFinite(parsed) ? Math.min(30, Math.max(5, Math.trunc(parsed))) : 10);
  };

  return <div className="space-y-4">
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-default-100"><Clock3 className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Pago con Mercado Pago</h2><p className="mt-1 text-xs text-default-500">La reserva y el enlace de pago vencen juntos.</p></div>
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <input aria-label="Minutos para completar el pago" type="number" min="5" max="30" step="1" value={reservationMinutes ?? 10}
            onChange={(event) => onReservationMinutesChange?.(event.target.value)} onBlur={(event) => updateReservationMinutes(event.target.value)}
            className="h-10 w-20 rounded-lg border border-border bg-background px-3 text-center text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          <span className="text-xs text-default-500">min</span>
        </label>
      </div>
      <p className="mt-3 text-[11px] text-default-400">Entre 5 y 30 minutos. El stock físico solo se descuenta cuando el pago queda aprobado.</p>
    </section>

    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-default-100"><Bell className="h-5 w-5" /></span>
        <div><h2 className="text-sm font-semibold">Avisos por email</h2><p className="mt-1 text-xs text-default-500">Notificaciones de pedidos para tu equipo.</p></div>
      </div>

      {notice ? <div role="status" className={cn("mt-4 rounded-lg px-3 py-2.5 text-sm", notice.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>{notice.text}</div> : null}

      <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border px-3 py-3">
        <span className="text-sm font-medium">Activar avisos</span>
        <input type="checkbox" checked={Boolean(settings.enabled)} onChange={(event) => onChange({ ...settings, enabled: event.target.checked })} className="h-4 w-4 accent-primary" />
      </label>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="block space-y-1.5">
          <span className="flex items-center justify-between gap-2 text-xs font-medium text-default-600"><span>Destinatarios</span><span className="text-[10px] font-normal text-default-400">{parsedRecipients.length}/10</span></span>
          <textarea aria-label="Destinatarios de los avisos" value={emailLines} onChange={(event) => onChange({ ...settings, recipients: event.target.value.split(/[\n,;]+/).map((email) => email.trim()).filter(Boolean) })} placeholder="ventas@empresa.com" className="min-h-20 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          {invalidRecipients.map((issue) => <span key={issue.field} className="block text-xs text-destructive">{issue.message}</span>)}
        </label>
        <Btn variant="outline" className="h-10" disabled={sendingTest || parsedRecipients.length === 0 || parsedRecipients.length > 10 || invalidRecipients.length > 0} onClick={sendTest}>
          {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sendingTest ? "Enviando…" : "Enviar prueba"}
        </Btn>
      </div>

      <fieldset className="mt-5">
        <legend className="mb-2 text-xs font-semibold">Avisar cuando</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {EVENT_OPTIONS.map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-3 py-2.5 text-xs">
            <input type="checkbox" checked={settings.events?.[key] !== false} onChange={(event) => onChange({ ...settings, events: { ...settings.events, [key]: event.target.checked } })} className="h-4 w-4 accent-primary" />
            <span>{label}</span>
          </label>)}
        </div>
      </fieldset>
    </section>

    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Historial</h2><p className="mt-1 text-xs text-default-500">Últimos avisos enviados.</p></div>
        <Btn variant="outline" size="sm" disabled={loadingEvents} onClick={() => void loadEvents()}>{loadingEvents ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Actualizar</Btn>
      </div>
      {loadingEvents && !events.length ? <p className="py-8 text-center text-xs text-default-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Cargando…</p>
        : events.length ? <div className="mt-3 divide-y divide-border">
          {events.map((event) => {
            const status = eventStatus(event);
            return <article key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-medium">{event.label}</p><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", status.style)}>{status.label}</span></div>
                <p className="mt-1 text-[11px] text-default-500">{event.orderNumber ? `Pedido ${event.orderNumber} · ` : ""}{formatDate(event.updatedAt)}</p>
              </div>
              {event.status === "failed" ? <Btn variant="outline" size="sm" disabled={retrying === event.id} onClick={() => void retry(event)}>{retrying === event.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Reintentar</Btn> : null}
            </article>;
          })}
        </div> : <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-7 text-center"><Check className="mx-auto h-5 w-5 text-default-400" /><p className="mt-2 text-xs text-default-500">Todavía no hay avisos.</p></div>}
    </section>
  </div>;
}
