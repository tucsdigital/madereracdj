"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="py-8 px-2 max-w-7xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <TicketIcon className="w-10 h-10 text-primary" />
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-1">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Vista de administrador: todos los tickets del sistema."
              : "Vista personal: tickets en los que participás."}
          </p>
        </div>
        <Button asChild>
          <Link href={hrefCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo ticket
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle>Listado</CardTitle>
          <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
            <Input
              placeholder="Buscar por título, descripción, email o referencia..."
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              className="md:w-[360px]"
            />
            <select
              className="h-10 rounded-lg border border-default-300 bg-background px-3 text-sm"
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
              className="h-10 rounded-lg border border-default-300 bg-background px-3 text-sm"
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
              className="h-10 rounded-lg border border-default-300 bg-background px-3 text-sm"
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
        </CardHeader>
        <CardContent className="overflow-x-auto">
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
            <Table className="[&_th]:uppercase">
              <TableHeader>
                <TableRow>
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
              <TableBody>
                {filtered.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleAbrirTicket(t.id)}
                  >
                    <TableCell className="font-semibold">
                      {t.title || "Sin título"}
                      {t.commentCount ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({t.commentCount} com.)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeClass("module", t.module)}>
                        {labelFor(TICKET_MODULES, t.module)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeClass("priority", t.priority)}>
                        {labelFor(TICKET_PRIORITIES, t.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeClass("status", t.status)}>
                        {labelFor(TICKET_STATUSES, t.status)}
                      </Badge>
                    </TableCell>
                    {showDueDateColumn ? (
                      <TableCell>{t.dueDate ? formatDateAR(t.dueDate) : "-"}</TableCell>
                    ) : null}
                    {isAdmin ? <TableCell>{t.assignee?.name || t.assignee?.email || "-"}</TableCell> : null}
                    <TableCell className="text-muted-foreground">
                      {t.createdAt ? String(t.createdAt).slice(0, 10) : "-"}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default TicketsPage;
