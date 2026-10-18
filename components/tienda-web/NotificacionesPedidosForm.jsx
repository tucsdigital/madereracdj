"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MailCheck, RefreshCw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Btn } from "@/components/tienda-web/ui";

const EVENT_OPTIONS = [
  ["created", "Nuevo pedido", "Cuando se crea un pedido, incluso si todavía está pendiente de pago."],
  ["confirmed", "Pago confirmado", "Cuando se acredita el pago por Mercado Pago o se confirma desde el sistema."],
  ["cancelled", "Pedido cancelado", "Cuando se cancela un pago o se anula la venta vinculada."],
  ["paymentFailed", "Pago rechazado", "Cuando Mercado Pago rechaza el pago."],
  ["review", "Requiere revisión", "Cuando el pago se acredita pero el inventario necesita conciliación."],
];

const STATUS_LABEL = { sent: "Aceptado por Resend", failed: "Falló el envío", sending: "En curso", pending: "Pendiente" };
const DELIVERY_LABEL = {
  accepted: "Aceptado por Resend",
  pending: "A la espera de Resend",
  send_failed: "Falló el envío",
  delivered: "Entregado",
  delayed: "Entrega demorada",
  bounced: "Rebotado",
  complained: "Marcado como spam",
  provider_failed: "Falló la entrega",
  suppressed: "Suprimido por Resend",
};
const STATUS_STYLE = {
  sent: "bg-sky-50 text-sky-800",
  failed: "bg-red-50 text-red-800",
  sending: "bg-amber-50 text-amber-800",
  pending: "bg-default-100 text-default-600",
};
const DELIVERY_STYLE = {
  accepted: "bg-sky-50 text-sky-800",
  pending: "bg-default-100 text-default-600",
  send_failed: "bg-red-50 text-red-800",
  delivered: "bg-emerald-50 text-emerald-800",
  delayed: "bg-amber-50 text-amber-800",
  bounced: "bg-red-50 text-red-800",
  complained: "bg-red-50 text-red-800",
  provider_failed: "bg-red-50 text-red-800",
  suppressed: "bg-amber-50 text-amber-800",
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export default function NotificacionesPedidosForm({ notifications, issues = [], onChange, authFetch }) {
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
    } catch (error) {
      setNotice({ type: "error", text: error.message || "No se pudo cargar el historial." });
    } finally {
      setLoadingEvents(false);
    }
  }, [authFetch]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const sendTest = async () => {
    setSendingTest(true);
    setNotice(null);
    try {
      const result = await authFetch("/api/tienda/notificaciones/prueba", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: parsedRecipients }),
      });
      setNotice({ type: "ok", text: `Correo de prueba enviado a ${result.recipients.join(", ")}.` });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "No se pudo enviar la prueba." });
    } finally {
      setSendingTest(false);
    }
  };

  const retry = async (event) => {
    setRetrying(event.id);
    setNotice(null);
    try {
      const result = await authFetch(`/api/tienda/notificaciones/eventos/${encodeURIComponent(event.id)}/retry`, { method: "POST" });
      setNotice({ type: "ok", text: result.alreadySent ? "Este aviso ya había sido enviado." : result.status === "sending" ? "El aviso ya se está enviando." : "Aviso reenviado correctamente." });
      await loadEvents();
    } catch (error) {
      setNotice({ type: "error", text: error.message || "No se pudo reintentar el aviso." });
      await loadEvents();
    } finally {
      setRetrying("");
    }
  };

  return <div className="space-y-4">
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-default-100"><MailCheck className="h-5 w-5" /></span>
        <div><h2 className="text-sm font-semibold">Avisos por email al equipo</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-default-500">Son independientes de los emails transaccionales que recibe el cliente. Cada evento tiene una clave única; el historial distingue la aceptación del envío de la entrega informada por Resend. Configurá un webhook de Resend en <code>/api/webhooks/resend</code> y guardá su secreto como <code>RESEND_WEBHOOK_SECRET</code>.</p></div>
      </div>

      {notice ? <div role="status" className={cn("mt-4 rounded-lg px-3 py-2.5 text-sm", notice.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>{notice.text}</div> : null}

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
        <input type="checkbox" checked={Boolean(settings.enabled)} onChange={(event) => onChange({ ...settings, enabled: event.target.checked })} className="mt-0.5 h-4 w-4 accent-black" />
        <span><span className="block text-sm font-medium">Activar avisos de pedidos</span><span className="mt-0.5 block text-xs leading-5 text-default-500">Los cambios se aplican al guardar la configuración de Tienda web.</span></span>
      </label>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.75fr)]">
        <label className="block space-y-1.5">
          <span className="flex items-center justify-between gap-2 text-xs font-medium text-default-600"><span>Destinatarios</span><span className="text-[10px] font-normal text-default-400">Hasta 10 emails</span></span>
          <textarea value={emailLines} onChange={(event) => onChange({ ...settings, recipients: event.target.value.split(/[\n,;]+/).map((email) => email.trim()).filter(Boolean) })} placeholder="ventas@tuempresa.com&#10;administracion@tuempresa.com" className="min-h-28 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          <span className="block text-[10px] leading-4 text-default-400">Un email por línea. También podés separar direcciones con coma o punto y coma.</span>
          {invalidRecipients.map((issue) => <span key={issue.field} className="block text-xs text-destructive">{issue.message}</span>)}
        </label>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-medium">Correo de prueba</p>
          <p className="mt-1 text-xs leading-5 text-default-500">Envía un mensaje a los destinatarios actuales sin crear un pedido real.</p>
          <Btn variant="outline" className="mt-3" disabled={sendingTest || parsedRecipients.length === 0 || parsedRecipients.length > 10 || invalidRecipients.length > 0} onClick={sendTest}>
            {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sendingTest ? "Enviando…" : "Enviar prueba"}
          </Btn>
        </div>
      </div>

      <fieldset className="mt-5 space-y-2">
        <legend className="mb-2 text-xs font-semibold">Eventos que generan un aviso</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {EVENT_OPTIONS.map(([key, label, description]) => <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3">
            <input type="checkbox" checked={settings.events?.[key] !== false} onChange={(event) => onChange({ ...settings, events: { ...settings.events, [key]: event.target.checked } })} className="mt-0.5 h-4 w-4 accent-black" />
            <span><span className="block text-xs font-medium">{label}</span><span className="mt-0.5 block text-[11px] leading-4 text-default-500">{description}</span></span>
          </label>)}
        </div>
      </fieldset>
    </section>

    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Historial de avisos</h2><p className="mt-1 text-xs text-default-500">Estado de entrega y errores recientes.</p></div>
        <Btn variant="outline" size="sm" disabled={loadingEvents} onClick={() => void loadEvents()}>{loadingEvents ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Actualizar</Btn>
      </div>
      {loadingEvents && !events.length ? <p className="py-8 text-center text-xs text-default-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Cargando historial…</p>
        : events.length ? <div className="mt-4 divide-y divide-border">
          {events.map((event) => <article key={event.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-medium">{event.label}</p><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLE[event.status] || STATUS_STYLE.pending)}>{STATUS_LABEL[event.status] || event.status}</span>{event.deliveryStatus ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", DELIVERY_STYLE[event.deliveryStatus] || STATUS_STYLE.pending)}>{DELIVERY_LABEL[event.deliveryStatus] || event.deliveryStatus}</span> : null}</div>
              <p className="mt-1 break-all text-[11px] text-default-500">Pedido {event.orderId} · {formatDate(event.updatedAt)} · {event.attempts} intento(s)</p>
              <p className="mt-0.5 break-words text-[11px] text-default-400">{event.recipients.join(", ")}</p>
              {event.error ? <p className="mt-1 text-xs text-destructive">{event.error}</p> : null}
              {event.deliveryError ? <p className="mt-1 text-xs text-destructive">{event.deliveryError}</p> : null}
            </div>
            {event.status === "failed" ? <Btn variant="outline" size="sm" disabled={retrying === event.id} onClick={() => void retry(event)}>{retrying === event.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Reintentar</Btn> : null}
          </article>)}
        </div> : <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-7 text-center text-xs text-default-500">Todavía no hay avisos registrados.</p>}
    </section>
  </div>;
}
