"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrencyAR } from "@/lib/asistencia-utils";

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

function PublicLiquidacionSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-[28px] bg-slate-950 p-6 text-white">
          <div className="h-3 w-32 animate-pulse rounded bg-white/15" />
          <div className="mt-3 h-8 w-2/3 animate-pulse rounded bg-white/15" />
          <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-white/10" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-[24px] border bg-white p-5 shadow-sm">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
              <div className="mt-3 h-7 w-28 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
        <div className="rounded-[24px] border bg-white p-6 shadow-sm">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublicLiquidacionAsistenciaPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liquidacion, setLiquidacion] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/asistencia/liquidaciones/public/${token}`);
      const data = await safeJson(res);
      if (!data?.ok) {
        throw new Error(data?.error || "No se pudo abrir la liquidacion");
      }
      setLiquidacion(data.liquidacion || null);
    } catch (e) {
      setError(e?.message || "No se pudo abrir la liquidacion");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const resumen = useMemo(() => {
    return {
      totSemana: Number(liquidacion?.totSemana || 0),
      totAdv: Number(liquidacion?.totAdv || 0),
      premio: Number(liquidacion?.premioAsistencia?.premio || 0),
      totPagar: Number(liquidacion?.totPagar || 0),
      porcentaje: Number(liquidacion?.premioAsistencia?.porcentaje || 0),
    };
  }, [liquidacion]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {}
  }, []);

  if (loading) {
    return <PublicLiquidacionSkeleton />;
  }

  if (error || !liquidacion) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <Card className="rounded-[28px] border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Liquidacion no disponible</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              {error || "No se encontro la liquidacion solicitada."}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="overflow-hidden rounded-[32px] bg-slate-950 text-white shadow-[0_30px_80px_-35px_rgba(15,23,42,0.65)]">
          <div className="bg-black p-6 md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">
                  Liquidacion mensual
                </div>
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                  {liquidacion.employeeNombre || "Empleado"}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
                  <span>{liquidacion.labelMes || liquidacion.monthKey || "-"}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-white/35" />
                  <span>Version {Number(liquidacion.version || 1)}</span>
                  {liquidacion.employeeSector ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-white/35" />
                      <span>{liquidacion.employeeSector}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Total mes</div>
            <div className="mt-3 text-2xl font-bold">{formatCurrencyAR(resumen.totSemana)}</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Adelantos</div>
            <div className="mt-3 text-2xl font-bold">{formatCurrencyAR(resumen.totAdv)}</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Premio</div>
            <div className="mt-3 text-2xl font-bold text-amber-600">{formatCurrencyAR(resumen.premio)}</div>
          </div>
          <div className="rounded-[24px] border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">Total a pagar</div>
            <div className="mt-3 text-2xl font-bold text-blue-700">{formatCurrencyAR(resumen.totPagar)}</div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-[28px] border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle>Detalle de liquidacion</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-[22px] border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Concepto</th>
                      <th className="px-4 py-3 text-right font-semibold">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-200">
                      <td className="px-4 py-3">Total trabajado del mes</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrencyAR(resumen.totSemana)}</td>
                    </tr>
                    <tr className="border-t border-slate-200">
                      <td className="px-4 py-3">Adelantos descontados</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrencyAR(resumen.totAdv)}</td>
                    </tr>
                    <tr className="border-t border-slate-200">
                      <td className="px-4 py-3">Premio por asistencia</td>
                      <td className="px-4 py-3 text-right font-medium text-amber-600">{formatCurrencyAR(resumen.premio)}</td>
                    </tr>
                    <tr className="border-t border-slate-200 bg-blue-50/70">
                      <td className="px-4 py-3 font-semibold text-blue-700">Total a pagar</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{formatCurrencyAR(resumen.totPagar)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="rounded-[28px] border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle>Asistencia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-[18px] bg-slate-50 px-4 py-3">
                  <span className="text-slate-500">% asistencia</span>
                  <span className="font-semibold">{resumen.porcentaje.toLocaleString("es-AR")}%</span>
                </div>
                <div className="flex items-center justify-between rounded-[18px] bg-slate-50 px-4 py-3">
                  <span className="text-slate-500">Presentes</span>
                  <span className="font-semibold">{Number(liquidacion.premioAsistencia?.presentes || 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-[18px] bg-slate-50 px-4 py-3">
                  <span className="text-slate-500">Medias</span>
                  <span className="font-semibold">{Number(liquidacion.premioAsistencia?.medias || 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-[18px] bg-slate-50 px-4 py-3">
                  <span className="text-slate-500">Ausencias</span>
                  <span className="font-semibold">{Number(liquidacion.premioAsistencia?.ausentes || 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-[18px] bg-emerald-50 px-4 py-3">
                  <span className="text-emerald-700">Estado del premio</span>
                  <span className="font-semibold text-emerald-700">
                    {liquidacion.premioAsistencia?.estadoLabel || "-"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle>Emision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Emitido</span>
                  <span className="font-medium text-slate-900">
                    {liquidacion.generatedAt ? new Date(liquidacion.generatedAt).toLocaleString("es-AR") : "-"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {Array.isArray(liquidacion.premioAsistencia?.motivos) && liquidacion.premioAsistencia.motivos.length > 0 ? (
          <Card className="rounded-[28px] border-amber-200 bg-amber-50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-amber-800">Observaciones</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-amber-900">
              {liquidacion.premioAsistencia.motivos.join(" · ")}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
