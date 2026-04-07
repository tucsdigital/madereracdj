"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/provider/auth.provider";
import { DOCUMENTO_ESTADOS } from "@/lib/documentacion-states";
import { DOCUMENTACION_TEXTOS } from "@/lib/documentacion-texts";
import { Loader2 } from "lucide-react";

const estadoLabel = (estado) => {
  const map = DOCUMENTACION_TEXTOS?.estados || {};
  return map[estado] || estado || "-";
};

const estadoColor = (estado) => {
  if (estado === DOCUMENTO_ESTADOS.FIRMADO) return "success";
  if (estado === DOCUMENTO_ESTADOS.RECHAZADO_U_OBSERVADO) return "destructive";
  if (estado === DOCUMENTO_ESTADOS.VENCIDO) return "warning";
  if (estado === DOCUMENTO_ESTADOS.ANULADO) return "secondary";
  if (estado === DOCUMENTO_ESTADOS.PENDIENTE_ACEPTACION) return "info";
  return "default";
};

export default function DocumentacionPage() {
  const { lang } = useParams();
  const { user } = useAuth();
  const [estado, setEstado] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const qs = new URLSearchParams();
      qs.set("limit", "100");
      if (estado && estado !== "todos") qs.set("estado", estado);
      const res = await fetch(`/api/documentacion/documents?${qs.toString()}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Error");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      toast({
        title: "No se pudieron cargar los documentos",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user, estado]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c = {
      borrador: 0,
      emitido: 0,
      enviado: 0,
      abierto: 0,
      pendiente_de_aceptacion: 0,
      firmado: 0,
      rechazado_u_observado: 0,
      vencido: 0,
      anulado: 0,
    };
    for (const it of items) {
      const e = it?.estado;
      if (e && e in c) c[e] += 1;
    }
    return c;
  }, [items]);

  return (
    <div className="py-8 px-2 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-bold text-default-900">Documentación</div>
          <div className="text-sm text-default-600">Cierre de obra, aceptación y firma con trazabilidad.</div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href={`/${lang}/documentacion/create`}>Nuevo documento</Link>
          </Button>
          {/* <Button variant="outline" asChild>
            <Link href={`/${lang}/documentacion/templates`}>Plantillas</Link>
          </Button> */}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Card className="border border-default-200">
          <CardContent className="p-4">
            <div className="text-xs text-default-500">Pendientes</div>
            {loading ? <Skeleton className="mt-2 h-7 w-10" /> : <div className="text-xl font-bold">{counts.pendiente_de_aceptacion}</div>}
          </CardContent>
        </Card>
        <Card className="border border-default-200">
          <CardContent className="p-4">
            <div className="text-xs text-default-500">Enviados</div>
            {loading ? <Skeleton className="mt-2 h-7 w-10" /> : <div className="text-xl font-bold">{counts.enviado}</div>}
          </CardContent>
        </Card>
        <Card className="border border-default-200">
          <CardContent className="p-4">
            <div className="text-xs text-default-500">Abiertos</div>
            {loading ? <Skeleton className="mt-2 h-7 w-10" /> : <div className="text-xl font-bold">{counts.abierto}</div>}
          </CardContent>
        </Card>
        <Card className="border border-default-200">
          <CardContent className="p-4">
            <div className="text-xs text-default-500">Firmados</div>
            {loading ? <Skeleton className="mt-2 h-7 w-10" /> : <div className="text-xl font-bold">{counts.firmado}</div>}
          </CardContent>
        </Card>
        <Card className="border border-default-200">
          <CardContent className="p-4">
            <div className="text-xs text-default-500">Sin abrir</div>
            {loading ? <Skeleton className="mt-2 h-7 w-10" /> : <div className="text-xl font-bold">{counts.enviado}</div>}
          </CardContent>
        </Card>
        <Card className="border border-default-200">
          <CardContent className="p-4">
            <div className="text-xs text-default-500">Borradores</div>
            {loading ? <Skeleton className="mt-2 h-7 w-10" /> : <div className="text-xl font-bold">{counts.borrador}</div>}
          </CardContent>
        </Card>
      </div>

      <Card className="border border-default-200 mt-5">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Listado</CardTitle>
          <div className="flex items-center gap-2">
            <div className="w-[240px]">
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {Object.values(DOCUMENTO_ESTADOS).map((e) => (
                    <SelectItem key={e} value={e}>
                      {estadoLabel(e)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Actualizando...
                </>
              ) : (
                "Actualizar"
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-10" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[240px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[180px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[120px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-9 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-default-500">
                    No hay documentos.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.numero || "-"}</TableCell>
                    <TableCell className="max-w-[360px] truncate">{it.titulo || "-"}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{it?.cliente?.nombre || "-"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{it?.obra?.numeroPedido || "-"}</TableCell>
                    <TableCell>
                      <Badge color={estadoColor(it.estado)}>{estadoLabel(it.estado)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/${lang}/documentacion/${it.id}`}>Ver</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
