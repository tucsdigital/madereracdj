"use client";

import React, { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Plus, Ticket as TicketIcon } from "lucide-react";
import { db } from "@/lib/firebase";
import { addDoc, collection } from "firebase/firestore";
import { useAuth } from "@/provider/auth.provider";
import {
  isTicketsAdminUser,
  TICKET_MODULES,
  TICKET_PRIORITIES,
  TICKETS_AGENCY_ASSIGNEES,
  findAgencyAssigneeByEmail,
  toIsoNow,
  uniqueEmails,
} from "@/lib/tickets";

const TicketsCreatePage = () => {
  const router = useRouter();
  const params = useParams();
  const lang = params?.lang;
  const { user, loading: authLoading } = useAuth();

  const isAdmin = isTicketsAdminUser(user);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [moduleId, setModuleId] = useState("general");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");

  const [assigneeEmail, setAssigneeEmail] = useState("");
  const [relatedUrl, setRelatedUrl] = useState("");

  const sideLabel = (v) => (v === "agencia" ? "Agencia" : "Cliente");

  const canSubmit = useMemo(() => {
    if (authLoading) return false;
    if (!user) return false;
    if (!title.trim()) return false;
    return true;
  }, [authLoading, title, user]);

  const handleSubmit = async () => {
    setError("");
    if (!canSubmit) return;
    setSaving(true);
    try {
      const now = toIsoNow();
      const requesterEmail = String(user?.email || "").trim().toLowerCase();
      const requesterName = String(user?.displayName || user?.email || "").trim();
      const assEmail = isAdmin ? String(assigneeEmail || "").trim().toLowerCase() : "";
      const participantsEmails = uniqueEmails([requesterEmail, assEmail]);

      const requesterSide = isAdmin ? "agencia" : "cliente";
      const targetSide = isAdmin ? "cliente" : "agencia";
      const assigneeInfo = findAgencyAssigneeByEmail(assEmail);

      const ticket = {
        title: title.trim(),
        description: description.trim(),
        module: moduleId,
        priority,
        status: "open",
        dueDate: "",
        requesterSide,
        targetSide,
        requester: {
          uid: String(user?.uid || ""),
          email: requesterEmail,
          name: requesterName,
        },
        assignee: assEmail
          ? { email: assEmail, name: assigneeInfo?.label || "" }
          : null,
        participantsEmails,
        related: {
          entityId: "",
          url: String(relatedUrl || "").trim(),
        },
        commentCount: 0,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      };

      const ref = await addDoc(collection(db, "tickets"), ticket);
      router.push(`/${lang}/tickets/${ref.id}`);
    } catch (e) {
      setError(e?.message || "Error al crear ticket");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-8 px-2 max-w-4xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <Button
          variant="outline"
          onClick={() => router.push(`/${lang}/tickets`)}
          className="shrink-0"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <TicketIcon className="w-9 h-9 text-primary" />
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-1">Nuevo Ticket</h1>
          <p className="text-lg text-muted-foreground">
            Creá una solicitud o tarea con prioridad y contexto.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {authLoading ? (
            <div className="py-8 text-center text-muted-foreground">Cargando...</div>
          ) : !user ? (
            <div className="py-8 text-center text-muted-foreground">
              Iniciá sesión para crear tickets.
            </div>
          ) : (
            <>
              {error ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="text-sm font-medium">
                  Título <span className="text-red-500">*</span>
                </div>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej: Arreglar cálculo de totales en ventas"
                  disabled={saving}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Módulo</div>
                  <select
                    className="h-10 w-full rounded-lg border border-default-300 bg-background px-3 text-sm"
                    value={moduleId}
                    onChange={(e) => setModuleId(e.target.value)}
                    disabled={saving}
                  >
                    {TICKET_MODULES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Prioridad</div>
                  <select
                    className="h-10 w-full rounded-lg border border-default-300 bg-background px-3 text-sm"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    disabled={saving}
                  >
                    {TICKET_PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Descripción</div>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contexto, criterios de aceptación, pasos para reproducir, etc."
                  disabled={saving}
                  className="min-h-[120px]"
                />
              </div>

              {isAdmin ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Asignar</div>
                  <select
                    className="h-10 w-full rounded-lg border border-default-300 bg-background px-3 text-sm"
                    value={assigneeEmail}
                    onChange={(e) => setAssigneeEmail(e.target.value)}
                    disabled={saving}
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

              <div className="space-y-2">
                <div className="text-sm font-medium">URL relacionada</div>
                <Input
                  value={relatedUrl}
                  onChange={(e) => setRelatedUrl(e.target.value)}
                  placeholder="Ej: https://..."
                  disabled={saving}
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSubmit} disabled={!canSubmit || saving}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Crear ticket
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TicketsCreatePage;
