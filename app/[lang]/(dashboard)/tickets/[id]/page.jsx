"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, MessageSquarePlus, Save, Ticket as TicketIcon } from "lucide-react";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "@/provider/auth.provider";
import {
  formatDateAR,
  isTicketsAdminUser,
  normalizeEmail,
  parseDateARToISO,
  toIsoNow,
  uniqueEmails,
  TICKETS_AGENCY_ASSIGNEES,
  findAgencyAssigneeByEmail,
  TICKET_MODULES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "@/lib/tickets";

const TicketsDetallePage = () => {
  const router = useRouter();
  const params = useParams();
  const lang = params?.lang;
  const ticketId = params?.id;
  const { user, loading: authLoading } = useAuth();
  const isAdmin = isTicketsAdminUser(user);
  const canEditAdminFields = Boolean(isAdmin);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState(null);
  const [comments, setComments] = useState([]);

  const [draft, setDraft] = useState({
    title: "",
    module: "general",
    priority: "medium",
    status: "open",
    dueDate: "",
    assigneeEmail: "",
  });
  const [dueDateInput, setDueDateInput] = useState("");

  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const canView = useMemo(() => {
    if (!user || !ticket) return false;
    if (isAdmin) return true;
    const email = normalizeEmail(user?.email);
    const participants = Array.isArray(ticket?.participantsEmails) ? ticket.participantsEmails : [];
    return participants.map(normalizeEmail).includes(email);
  }, [isAdmin, ticket, user]);

  const canEditTitle = Boolean(user && canView);
  const canEditDueDate = Boolean(isAdmin);

  const load = async () => {
    if (!ticketId) return;
    setError("");
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "tickets", String(ticketId)));
      if (!snap.exists()) {
        setTicket(null);
        setComments([]);
        setError("Ticket no encontrado.");
        return;
      }
      const data = { id: snap.id, ...(snap.data() || {}) };
      setTicket(data);
      setDraft({
        title: String(data.title || ""),
        module: String(data.module || "general"),
        priority: String(data.priority || "medium"),
        status: String(data.status || "open"),
        dueDate: String(data.dueDate || ""),
        assigneeEmail: String(data.assignee?.email || ""),
      });
      setDueDateInput(formatDateAR(String(data.dueDate || "")));

      const commentsSnap = await getDocs(collection(db, "tickets", snap.id, "comments"));
      const rows = commentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      setComments(rows);
    } catch (e) {
      setError(e?.message || "Error al cargar ticket.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, ticketId]);

  const handleGuardarCambios = async () => {
    if (!ticket?.id) return;
    if (!user) return;
    if (!canView) return;
    setError("");
    setSaving(true);
    try {
      const now = toIsoNow();
      const nextTitle = String(draft.title || "").trim();

      if (!isAdmin) {
        if (!nextTitle) {
          setError("El título es obligatorio.");
          return;
        }
        if (String(ticket?.title || "").trim() === nextTitle) {
          return;
        }
        const patch = {
          title: nextTitle,
          updatedAt: now,
          lastActivityAt: now,
        };
        await updateDoc(doc(db, "tickets", ticket.id), patch);
        setTicket((prev) => (prev ? { ...prev, ...patch } : prev));
        return;
      }

      const nextAssigneeEmail = normalizeEmail(draft.assigneeEmail);
      const dueDateIso = (() => {
        const raw = String(dueDateInput || "").trim();
        if (!raw) return "";
        const iso = parseDateARToISO(raw);
        return iso;
      })();
      if (dueDateIso === null) {
        setError("Vencimiento inválido. Usá formato dd/mm/aaaa.");
        return;
      }
      const requesterEmail = normalizeEmail(ticket?.requester?.email);
      const prevAssigneeEmail = normalizeEmail(ticket?.assignee?.email);
      const participantsEmails = uniqueEmails([
        requesterEmail,
        nextAssigneeEmail,
        ...(Array.isArray(ticket?.participantsEmails) ? ticket.participantsEmails : []),
      ]);
      const assigneeInfo = findAgencyAssigneeByEmail(nextAssigneeEmail);

      const patch = {
        title: nextTitle,
        module: String(draft.module || "general"),
        priority: String(draft.priority || "medium"),
        status: String(draft.status || "open"),
        dueDate: dueDateIso || "",
        assignee: nextAssigneeEmail
          ? { email: nextAssigneeEmail, name: assigneeInfo?.label || "" }
          : null,
        participantsEmails,
        updatedAt: now,
        lastActivityAt: now,
      };

      await updateDoc(doc(db, "tickets", ticket.id), patch);

      if (
        ticket?.status !== patch.status ||
        ticket?.priority !== patch.priority ||
        ticket?.module !== patch.module ||
        String(ticket?.dueDate || "") !== patch.dueDate ||
        prevAssigneeEmail !== nextAssigneeEmail ||
        String(ticket?.title || "") !== patch.title
      ) {
        const actorEmail = normalizeEmail(user?.email);
        const actorName = String(user?.displayName || user?.email || "").trim();
        await addDoc(collection(db, "tickets", ticket.id, "events"), {
          type: "ticket_updated",
          at: now,
          actor: { uid: String(user?.uid || ""), email: actorEmail, name: actorName },
          patch: {
            status: patch.status,
            priority: patch.priority,
            module: patch.module,
            dueDate: patch.dueDate,
            assigneeEmail: nextAssigneeEmail || "",
            title: patch.title,
          },
        });
      }

      const nextTicket = { ...ticket, ...patch, assignee: patch.assignee };
      setTicket(nextTicket);
    } catch (e) {
      setError(e?.message || "Error al guardar cambios.");
    } finally {
      setSaving(false);
    }
  };

  const handleAgregarComentario = async () => {
    if (!ticket?.id) return;
    if (!user) return;
    if (!canView) return;
    const text = String(newComment || "").trim();
    if (!text) return;
    setPostingComment(true);
    setError("");
    try {
      const now = toIsoNow();
      const actorEmail = normalizeEmail(user?.email);
      const actorName = String(user?.displayName || user?.email || "").trim();

      const commentPayload = {
        text,
        createdAt: now,
        author: {
          uid: String(user?.uid || ""),
          email: actorEmail,
          name: actorName,
        },
      };

      const commentRef = await addDoc(collection(db, "tickets", ticket.id, "comments"), commentPayload);

      await updateDoc(doc(db, "tickets", ticket.id), {
        commentCount: increment(1),
        updatedAt: now,
        lastActivityAt: now,
        participantsEmails: uniqueEmails([
          ...(Array.isArray(ticket?.participantsEmails) ? ticket.participantsEmails : []),
          actorEmail,
        ]),
      });

      await addDoc(collection(db, "tickets", ticket.id, "events"), {
        type: "comment_added",
        at: now,
        actor: { uid: String(user?.uid || ""), email: actorEmail, name: actorName },
        commentId: commentRef.id,
      });

      setComments((prev) => [...prev, { id: commentRef.id, ...commentPayload }]);
      setNewComment("");
      setTicket((prev) => (prev ? { ...prev, commentCount: Number(prev.commentCount || 0) + 1, updatedAt: now, lastActivityAt: now } : prev));
    } catch (e) {
      setError(e?.message || "Error al agregar comentario.");
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div className="py-8 px-2 max-w-6xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <Button variant="outline" onClick={() => router.push(`/${lang}/tickets`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <TicketIcon className="w-9 h-9 text-primary" />
        <div className="flex-1">
          <div className="text-sm text-muted-foreground">
            Ticket {String(ticketId || "").slice(0, 8)}
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">{ticket?.title || "Detalle"}</h1>
        </div>
        <Button onClick={handleGuardarCambios} disabled={saving || loading || !user || !canView}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Guardar cambios
            </>
          )}
        </Button>
      </div>

      {authLoading || loading ? (
        <div className="py-10 text-center text-muted-foreground">Cargando...</div>
      ) : error ? (
        <div className="py-10 text-center text-red-600">{error}</div>
      ) : !ticket ? (
        <div className="py-10 text-center text-muted-foreground">Ticket no encontrado.</div>
      ) : !user ? (
        <div className="py-10 text-center text-muted-foreground">Iniciá sesión.</div>
      ) : !canView ? (
        <div className="py-10 text-center text-muted-foreground">
          No tenés acceso a este ticket.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Información</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="text-sm font-medium">Título</div>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                  disabled={saving || !canEditTitle}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Estado</div>
                  <select
                    className="h-10 w-full rounded-lg border border-default-300 bg-background px-3 text-sm"
                    value={draft.status}
                    onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
                    disabled={saving || !canEditAdminFields}
                  >
                    {TICKET_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Prioridad</div>
                  <select
                    className="h-10 w-full rounded-lg border border-default-300 bg-background px-3 text-sm"
                    value={draft.priority}
                    onChange={(e) => setDraft((p) => ({ ...p, priority: e.target.value }))}
                    disabled={saving || !canEditAdminFields}
                  >
                    {TICKET_PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Módulo</div>
                  <select
                    className="h-10 w-full rounded-lg border border-default-300 bg-background px-3 text-sm"
                    value={draft.module}
                    onChange={(e) => setDraft((p) => ({ ...p, module: e.target.value }))}
                    disabled={saving || !canEditAdminFields}
                  >
                    {TICKET_MODULES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                {isAdmin ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Vencimiento</div>
                    <Input
                      value={dueDateInput}
                      onChange={(e) => setDueDateInput(e.target.value)}
                      placeholder="dd/mm/aaaa"
                      disabled={saving || !canEditDueDate}
                    />
                  </div>
                ) : ticket?.dueDate ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Vencimiento</div>
                    <div className="h-10 w-full rounded-lg border border-default-200 bg-card px-3 text-sm flex items-center">
                      {formatDateAR(ticket.dueDate)}
                    </div>
                  </div>
                ) : null}
              </div>

              {isAdmin ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Asignar</div>
                  <select
                    className="h-10 w-full rounded-lg border border-default-300 bg-background px-3 text-sm"
                    value={draft.assigneeEmail}
                    onChange={(e) => setDraft((p) => ({ ...p, assigneeEmail: e.target.value }))}
                    disabled={saving || !canEditAdminFields}
                  >
                    <option value="">Sin asignar</option>
                    {TICKETS_AGENCY_ASSIGNEES.map((a) => (
                      <option key={a.id} value={a.email}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="rounded-lg border border-default-200 bg-card p-4 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">Solicita:</span>{" "}
                    <span className="font-medium">{ticket.requester?.email || "-"}</span>
                  </div>
                  {isAdmin ? (
                    <div>
                      <span className="text-muted-foreground">Asignado:</span>{" "}
                      <span className="font-medium">{ticket.assignee?.name || ticket.assignee?.email || "-"}</span>
                    </div>
                  ) : null}
                  <div>
                    <span className="text-muted-foreground">Creado:</span>{" "}
                    <span className="font-medium">{ticket.createdAt ? String(ticket.createdAt).slice(0, 10) : "-"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Actualizado:</span>{" "}
                    <span className="font-medium">{ticket.updatedAt ? String(ticket.updatedAt).slice(0, 10) : "-"}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Descripción</div>
                <div className="rounded-lg border border-default-200 bg-card p-4 whitespace-pre-wrap">
                  {ticket.description || <span className="text-muted-foreground">Sin descripción.</span>}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comentarios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Escribir comentario..."
                  className="min-h-[110px]"
                  disabled={postingComment}
                />
                <Button
                  className="w-full"
                  onClick={handleAgregarComentario}
                  disabled={postingComment || !String(newComment || "").trim()}
                >
                  {postingComment ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <MessageSquarePlus className="w-4 h-4 mr-2" />
                      Agregar comentario
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-3">
                {comments.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No hay comentarios todavía.
                  </div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="rounded-lg border border-default-200 bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">
                          {c.author?.name || c.author?.email || "Usuario"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.createdAt ? String(c.createdAt).slice(0, 16).replace("T", " ") : ""}
                        </div>
                      </div>
                      <div className="mt-2 text-sm whitespace-pre-wrap">{c.text}</div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default TicketsDetallePage;
