"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Mail, Phone, User, CalendarDays, UserCheck, TrendingUp, Info, MessageCircle, Edit2, UserPlus } from "lucide-react";
import { getLeadById } from "@/lib/firebase";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useVendedores } from "@/hooks/useVendedores";

export default function LeadDetailPage() {
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const { vendedores } = useVendedores();

  useEffect(() => {
    getLeadById(id).then((data) => {
      setLead(data);
      setLoading(false);
    });
  }, [id]);

  // Buscar el vendedor asignado
  const vendedorAsignado = vendedores.find(v => v.id === lead?.vendedor);

  if (loading) return <div className="p-8 text-center">Cargando detalles...</div>;
  if (!lead) return <div className="p-8 text-center text-destructive">Lead no encontrado</div>;

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      {/* Header profesional */}
      <Card className="overflow-visible">
        <CardHeader className="flex-row items-center gap-6 pb-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <Avatar className="h-20 w-20 text-3xl">
              <AvatarImage src={lead.avatar || undefined} alt={lead.nombre} />
              <AvatarFallback>
                {lead.nombre?.[0] || <User />}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1 min-w-0">
              <h1 className="text-2xl font-bold truncate">{lead.nombre}</h1>
              <div className="flex gap-2 flex-wrap mt-1">
                <Badge color="info" variant="soft" className="capitalize">{lead.estado}</Badge>
                <Badge color="warning" variant="soft" className="capitalize">{lead.prioridad}</Badge>
              </div>
              <div className="flex gap-2 mt-2 text-muted-foreground text-sm flex-wrap">
                <span className="flex items-center gap-1"><CalendarDays className="w-4 h-4" /> {lead.createdAt ? format(new Date(lead.createdAt), "dd/MM/yyyy", { locale: es }) : "-"}</span>
                {lead.fuente && <span className="flex items-center gap-1"><TrendingUp className="w-4 h-4" /> {lead.fuente}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button size="sm" color="primary" variant="outline" className="w-full flex items-center gap-2"><Edit2 className="w-4 h-4" /> Editar</Button>
            <Button size="sm" color="info" variant="outline" className="w-full flex items-center gap-2"><UserPlus className="w-4 h-4" /> Asignar vendedor</Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-0">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-base">
              <Mail className="w-5 h-5 text-primary" />
              <span>{lead.email || <span className="text-muted-foreground">Sin email</span>}</span>
            </div>
            <div className="flex items-center gap-3 text-base">
              <Phone className="w-5 h-5 text-primary" />
              <span>{lead.telefono || <span className="text-muted-foreground">Sin teléfono</span>}</span>
            </div>
            <div className="flex items-center gap-3 text-base">
              <UserCheck className="w-5 h-5 text-primary" />
              {vendedorAsignado ? (
                <Link href={`/user-profile/${vendedorAsignado.id}`} className="flex items-center gap-2 hover:underline group">
                  {vendedorAsignado.avatar && (
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={vendedorAsignado.avatar} alt={vendedorAsignado.nombre} />
                      <AvatarFallback>{vendedorAsignado.nombre?.[0]}</AvatarFallback>
                    </Avatar>
                  )}
                  <span className="group-hover:text-primary transition-colors">{vendedorAsignado.nombre}</span>
                </Link>
              ) : (
                <span className="text-muted-foreground">Sin asignar</span>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-base">
              <Info className="w-5 h-5 text-primary" />
              <span>{lead.descripcion || <span className="text-muted-foreground">Sin descripción</span>}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cronograma de seguimiento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold flex items-center gap-2"><MessageCircle className="w-5 h-5 text-primary" /> Cronograma de Seguimiento</CardTitle>
        </CardHeader>
        <CardContent>
          {lead.historial && lead.historial.length > 0 ? (
            <ol className="relative border-l-2 border-primary/30 ml-4">
              {lead.historial.map((evento, idx) => (
                <li key={idx} className="mb-8 ml-6 relative">
                  <span className="absolute -left-4 flex items-center justify-center w-8 h-8 bg-primary text-white rounded-full ring-4 ring-white shadow-lg">
                    {idx + 1}
                  </span>
                  <div className="flex flex-col gap-1 bg-card/80 rounded-lg p-4 shadow-sm border border-border">
                    <div className="flex items-center gap-2">
                      <Badge color="info" variant="soft" className="capitalize">{evento.estado}</Badge>
                      <span className="text-xs text-muted-foreground">{evento.fecha ? format(new Date(evento.fecha), "dd/MM/yyyy HH:mm", { locale: es }) : ""}</span>
                    </div>
                    <span className="text-sm text-default-900">{evento.comentario}</span>
                    {evento.vendedor && (
                      <span className="text-xs flex items-center gap-1 text-muted-foreground"><User className="w-4 h-4" /> Vendedor: {evento.vendedor}</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="text-muted-foreground">No hay historial de seguimiento.</div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between items-center mt-6">
        <Link href="/leads" className="text-primary underline flex items-center gap-1"><User className="w-4 h-4" /> Volver a la lista de leads</Link>
        {/* Aquí puedes agregar más acciones rápidas si lo deseas */}
      </div>
    </div>
  );
} 