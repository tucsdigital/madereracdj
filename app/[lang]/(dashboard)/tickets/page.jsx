"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Edit3, Eye, Plus, Trash2, Ticket as TicketIcon } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where } from "firebase/firestore";
import { useAuth } from "@/provider/auth.provider";
import {
  formatDateAR,
  isTicketsAdminUser,
  labelFor,
  TICKET_MODULES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  toIsoNow,
} from "@/lib/tickets";

const TicketsPage = () => {
  const router = useRouter();
  const params = useParams();
  const lang = params?.lang;
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tickets, setTickets] = useState([]);

  const [qText, setQText] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fModule, setFModule] = useState("");
  const [finalizando, setFinalizando] = useState({});

  const isAdmin = isTicketsAdminUser(user);

  useEffect(() => {
    const load = async () => {
      if (authLoading) return;
      setError("");

      if (!user) {
        setTickets([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const ref = collection(db, "tickets");
        let snap;
        if (isAdmin) {
          snap = await getDocs(query(ref, orderBy("createdAt", "desc")));
        } else {
          const email = String(user?.email || "").trim().toLowerCase();
          snap = await getDocs(query(ref, where("participantsEmails", "array-contains", email)));
        }

        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!isAdmin) {
          rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
        }
        setTickets(rows);
      } catch (e) {
        setError(e?.message || "Error al cargar tickets");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [authLoading, isAdmin, user]);

  const filtered = useMemo(() => {
    const q = qText.trim().toLowerCase();
    return (Array.isArray(tickets) ? tickets : []).filter((t) => {
      if (fStatus && String(t.status || "") !== fStatus) return false;
      if (fPriority && String(t.priority || "") !== fPriority) return false;
      if (fModule && String(t.module || "") !== fModule) return false;
      if (!q) return true;
      const hay =
        String(t.title || "").toLowerCase().includes(q) ||
        String(t.description || "").toLowerCase().includes(q) ||
        String(t.requester?.email || "").toLowerCase().includes(q) ||
        String(t.assignee?.email || "").toLowerCase().includes(q) ||
        String(t.related?.entityId || "").toLowerCase().includes(q);
      return hay;
    });
  }, [tickets, qText, fStatus, fPriority, fModule]);

  const showDueDateColumn = useMemo(() => {
    if (isAdmin) return true;
    return (Array.isArray(filtered) ? filtered : []).some((t) => Boolean(t?.dueDate));
  }, [filtered, isAdmin]);

  const hrefCreate = `/${lang}/tickets/create`;

  const badgeClass = (type, value) => {
    const palettes = {
      status: {
        open: "border-sky-200 bg-sky-50 text-sky-700",
        triage: "border-violet-200 bg-violet-50 text-violet-700",
        in_progress: "border-blue-200 bg-blue-50 text-blue-700",
        blocked: "border-red-200 bg-red-50 text-red-700",
        waiting_client: "border-amber-200 bg-amber-50 text-amber-700",
        done: "border-emerald-200 bg-emerald-50 text-emerald-700",
        cancelled: "border-slate-200 bg-slate-50 text-slate-600",
      },
      priority: {
        low: "border-slate-200 bg-slate-50 text-slate-600",
        medium: "border-blue-200 bg-blue-50 text-blue-700",
        high: "border-orange-200 bg-orange-50 text-orange-700",
        urgent: "border-red-200 bg-red-50 text-red-700",
      },
      module: "border-default-200 bg-default-50 text-default-700",
    };
    return palettes[type]?.[value] || palettes[type] || "border-default-200 bg-default-50 text-default-700";
  };

  const handleAbrirTicket = (ticketId) => {
    router.push(`/${lang}/tickets/${ticketId}`);
  };

  const canDeleteTicket = (t) => {
    if (!user) return false;
    if (isAdmin) return true;
    const uid = String(user?.uid || "");
    return Boolean(uid) && String(t?.requester?.uid || "") === uid;
  };

  const handleFinalizarTicket = async (event, ticket) => {
    event.preventDefault();
    event.stopPropagation();
    if (!ticket?.id || ticket.status === "done" || !user) return;

    setFinalizando((prev) => ({ ...prev, [ticket.id]: true }));
    try {
      const now = toIsoNow();
      await updateDoc(doc(db, "tickets", String(ticket.id)), {
        status: "done",
        updatedAt: now,
        lastActivityAt: now,
      });
      setTickets((prev) => prev.map((item) => (
        item.id === ticket.id ? { ...item, status: "done", updatedAt: now, lastActivityAt: now } : item
      )));
    } catch (err) {
      setError(err?.message || "No se pudo finalizar el ticket");
    } finally {
      setFinalizando((prev) => {
        const next = { ...prev };
        delete next[ticket.id];
        return next;
      });
    }
  };

  const handleEliminarTicket = async (e, t) => {
    e.preventDefault();
    e.stopPropagation();
    if (!t?.id) return;
    if (!canDeleteTicket(t)) return;
    const ok = window.confirm("¿Eliminar este ticket? Esta acción no se puede deshacer.");
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "tickets", String(t.id)));
      setTickets((prev) => (Array.isArray(prev) ? prev.filter((x) => x?.id !== t.id) : prev));
    } catch (err) {
      setError(err?.message || "No se pudo eliminar el ticket");
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-6 font-sans text-slate-900 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.18em] text-amber-700">Soporte · Seguimiento</p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Tickets</h1>
            <span className="text-xs tabular-nums text-slate-500">{filtered.length} resultados</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {isAdmin
              ? "Vista de administrador: todos los tickets del sistema."
              : "Vista personal: tickets en los que participás."}
          </p>
        </div>
        <Button asChild className="h-9 self-start rounded-md px-3 text-xs sm:self-auto">
          <Link href={hrefCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo ticket
          </Link>
        </Button>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40" aria-label="Listado de tickets">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4">
            <Input
              placeholder="Buscar por título, descripción, email o referencia..."
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              aria-label="Buscar tickets"
              className="h-9 min-w-0 rounded-md border-slate-200 text-xs shadow-sm sm:w-[min(360px,100%)]"
            />
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 sm:w-auto"
              value={fModule}
              onChange={(e) => setFModule(e.target.value)}
            >
              <option value="">Módulo (todos)</option>
              {TICKET_MODULES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 sm:w-auto"
              value={fPriority}
              onChange={(e) => setFPriority(e.target.value)}
            >
              <option value="">Prioridad (todas)</option>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 sm:w-auto"
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
            >
              <option value="">Estado (todos)</option>
              {TICKET_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
        </div>
        <div>
          {authLoading || loading ? (
            <div className="py-10 text-center text-muted-foreground">Cargando...</div>
          ) : !user ? (
            <div className="py-10 text-center text-muted-foreground">
              Iniciá sesión para ver tickets.
            </div>
          ) : error ? (
            <div className="py-10 text-center text-red-600">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No hay tickets para mostrar.
            </div>
          ) : (
            <Table className="block w-full min-w-0 lg:table">
              <TableHeader className="hidden lg:table-header-group">
                <TableRow className="border-slate-200 bg-slate-50/70 hover:bg-slate-50/70">
                  <TableHead>Título</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  {showDueDateColumn ? <TableHead>Vence</TableHead> : null}
                  {isAdmin ? <TableHead>Asignado</TableHead> : null}
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="block lg:table-row-group">
                {filtered.map((t) => (
                  <TableRow
                    key={t.id}
                    className="block border-b border-slate-200 py-2 transition-colors hover:bg-slate-50/70 lg:table-row lg:py-0"
                    onClick={() => handleAbrirTicket(t.id)}
                  >
                    <TableCell data-label="Ticket" className="flex items-start justify-between gap-3 border-0 px-3 py-1.5 text-right lg:table-cell lg:border-b lg:px-4 lg:py-3 lg:text-left before:shrink-0 before:content-[attr(data-label)] before:w-[34%] before:pt-0.5 before:text-left before:text-[10px] before:font-semibold before:uppercase before:tracking-wide before:text-slate-400 lg:before:hidden">
                      <div className="min-w-0 flex-1">
                      {t.title || "Sin título"}
                      {t.commentCount ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({t.commentCount} com.)
                        </span>
                      ) : null}
                      </div>
                    </TableCell>
                    <TableCell data-label="Módulo" className="flex items-center justify-between gap-3 border-0 px-3 py-1.5 text-right lg:table-cell lg:border-b lg:px-4 lg:py-3 lg:text-left before:shrink-0 before:content-[attr(data-label)] before:w-[34%] before:text-left before:text-[10px] before:font-semibold before:uppercase before:tracking-wide before:text-slate-400 lg:before:hidden">
                      <Badge variant="outline" className={badgeClass("module", t.module)}>
                        {labelFor(TICKET_MODULES, t.module)}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="Prioridad" className="flex items-center justify-between gap-3 border-0 px-3 py-1.5 text-right lg:table-cell lg:border-b lg:px-4 lg:py-3 lg:text-left before:shrink-0 before:content-[attr(data-label)] before:w-[34%] before:text-left before:text-[10px] before:font-semibold before:uppercase before:tracking-wide before:text-slate-400 lg:before:hidden">
                      <Badge variant="outline" className={badgeClass("priority", t.priority)}>
                        {labelFor(TICKET_PRIORITIES, t.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="Estado" className="flex items-center justify-between gap-3 border-0 px-3 py-1.5 text-right lg:table-cell lg:border-b lg:px-4 lg:py-3 lg:text-left before:shrink-0 before:content-[attr(data-label)] before:w-[34%] before:text-left before:text-[10px] before:font-semibold before:uppercase before:tracking-wide before:text-slate-400 lg:before:hidden">
                      <Badge variant="outline" className={badgeClass("status", t.status)}>
                        {labelFor(TICKET_STATUSES, t.status)}
                      </Badge>
                    </TableCell>
                    {showDueDateColumn ? (
                      <TableCell data-label="Vence" className="flex items-center justify-between gap-3 border-0 px-3 py-1.5 text-right lg:table-cell lg:border-b lg:px-4 lg:py-3 lg:text-left before:shrink-0 before:content-[attr(data-label)] before:w-[34%] before:text-left before:text-[10px] before:font-semibold before:uppercase before:tracking-wide before:text-slate-400 lg:before:hidden">{t.dueDate ? formatDateAR(t.dueDate) : "-"}</TableCell>
                    ) : null}
                    {isAdmin ? <TableCell data-label="Asignado" className="flex items-center justify-between gap-3 border-0 px-3 py-1.5 text-right lg:table-cell lg:border-b lg:px-4 lg:py-3 lg:text-left before:shrink-0 before:content-[attr(data-label)] before:w-[34%] before:text-left before:text-[10px] before:font-semibold before:uppercase before:tracking-wide before:text-slate-400 lg:before:hidden">{t.assignee?.name || t.assignee?.email || "-"}</TableCell> : null}
                    <TableCell data-label="Fecha" className="flex items-center justify-between gap-3 border-0 px-3 py-1.5 text-right text-muted-foreground lg:table-cell lg:border-b lg:px-4 lg:py-3 lg:text-left before:shrink-0 before:content-[attr(data-label)] before:w-[34%] before:text-left before:text-[10px] before:font-semibold before:uppercase before:tracking-wide before:text-slate-400 lg:before:hidden">
                      {t.createdAt ? String(t.createdAt).slice(0, 10) : "-"}
                    </TableCell>
                    <TableCell data-label="Acciones" className="flex items-center justify-between gap-3 border-0 px-3 py-2 text-right lg:table-cell lg:border-b lg:px-4 lg:py-3 lg:text-right before:shrink-0 before:content-[attr(data-label)] before:w-[34%] before:text-left before:text-[10px] before:font-semibold before:uppercase before:tracking-wide before:text-slate-400 lg:before:hidden" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={(event) => handleFinalizarTicket(event, t)}
                          disabled={t.status === "done" || finalizando[t.id]}
                          aria-label={t.status === "done" ? "Ticket finalizado" : "Finalizar ticket"}
                          title={t.status === "done" ? "Finalizado" : "Finalizar"}
                          className={t.status === "done" ? "text-emerald-600" : "text-emerald-600 hover:bg-emerald-50"}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => handleAbrirTicket(t.id)}
                          aria-label="Editar ticket"
                          title="Editar"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => handleAbrirTicket(t.id)}
                          aria-label="Ver ticket"
                          title="Ver"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canDeleteTicket(t) ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            onClick={(e) => handleEliminarTicket(e, t)}
                            aria-label="Eliminar ticket"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </main>
  );
};

export default TicketsPage;
