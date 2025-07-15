"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReportsChart from "./reports-chart";
import { useThemeStore } from "@/store";
import { useTheme } from "next-themes";
import { themes } from "@/config/themes";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import DashboardSelect from "@/components/dasboard-select";
import { cn } from "@/lib/utils";
import { useLeads } from "@/hooks/useLeads";

const ReportsSnapshot = () => {
  const { theme: config, setTheme: setConfig } = useThemeStore();
  const { theme: mode } = useTheme();
  const theme = themes.find((theme) => theme.name === config);
  const primary = `hsl(${theme?.cssVars[mode === "dark" ? "dark" : "light"].primary})`;
  const warning = `hsl(${theme?.cssVars[mode === "dark" ? "dark" : "light"].warning})`;
  const success = `hsl(${theme?.cssVars[mode === "dark" ? "dark" : "light"].success})`;
  const info = `hsl(${theme?.cssVars[mode === "dark" ? "dark" : "light"].info})`;

  // Obtener leads en tiempo real
  const { leads, loading } = useLeads();

  // Agrupar y calcular totales
  const todas = leads;
  const activas = leads.filter(l => l.estado && ["En seguimiento", "Contactado"].includes(l.estado));
  const proyectos = leads.filter(l => l.proyecto);
  // Nuevos contactos: últimos 30 días
  const nuevos = leads.filter(l => {
    const fecha = l.createdAt || l.fecha;
    if (!fecha) return false;
    const leadDate = new Date(fecha);
    const now = new Date();
    const diff = (now - leadDate) / (1000 * 60 * 60 * 24);
    return diff <= 30;
  });

  // Generar series para los gráficos (ejemplo: leads por día en los últimos 10 días)
  function getSeries(leadsArr) {
    // Agrupar por día (últimos 10 días)
    const days = Array.from({ length: 10 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (9 - i));
      return d.toISOString().slice(0, 10);
    });
    const data = days.map(day =>
      leadsArr.filter(l => {
        const fecha = l.createdAt || l.fecha;
        return fecha && fecha.startsWith(day);
      }).length
    );
    return [{ data }];
  }

  const tabsTrigger = [
    {
      value: "todas",
      text: "Todas las consultas",
      total: todas.length,
      color: "primary",
    },
    {
      value: "proyectos",
      text: "Proyectos interesados",
      total: proyectos.length,
      color: "warning",
    },
    {
      value: "activas",
      text: "Consultas activas",
      total: activas.length,
      color: "success",
    },
    {
      value: "nuevos",
      text: "Nuevos contactos",
      total: nuevos.length,
      color: "info",
    },
  ];
  const tabsContentData = [
    {
      value: "todas",
      series: getSeries(todas),
      color: primary,
    },
    {
      value: "proyectos",
      series: getSeries(proyectos),
      color: warning,
    },
    {
      value: "activas",
      series: getSeries(activas),
      color: success,
    },
    {
      value: "nuevos",
      series: getSeries(nuevos),
      color: info,
    },
  ];
  return (
    <Card>
      <CardHeader className="border-none pb-0">
        <div className="flex items-center gap-2 flex-wrap ">
          <div className="flex-1">
            <div className="text-xl font-semibold text-default-900 whitespace-nowrap">
              Consultas
            </div>
            <span className="text-xs text-default-600">
              Seguimiento profesional de consultas inmobiliarias provenientes de Meta
            </span>
          </div>
          <div className="flex-none">
            <DashboardSelect />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-1 md:p-5">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Cargando datos de Firebase...</div>
        ) : (
          <Tabs defaultValue="todas">
            <TabsList className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6 justify-start w-full bg-transparent h-full">
              {tabsTrigger.map((item, index) => (
                <TabsTrigger
                  key={`report-trigger-${index}`}
                  value={item.value}
                  className={cn(
                    "flex flex-col gap-1.5 p-4 overflow-hidden   items-start  relative before:absolute before:left-1/2 before:-translate-x-1/2 before:bottom-1 before:h-[2px] before:w-9 before:bg-primary/50 dark:before:bg-primary-foreground before:hidden data-[state=active]:shadow-none data-[state=active]:before:block",
                    {
                      "bg-primary/30 data-[state=active]:bg-primary/50 dark:bg-primary/70":
                        item.color === "primary",
                      "bg-warning/30 data-[state=active]:bg-warning/50 dark:bg-orange-500":
                        item.color === "warning",
                      "bg-success/30 data-[state=active]:bg-success/50 dark:bg-green-500":
                        item.color === "success",
                      "bg-info/30 data-[state=active]:bg-info/50 dark:bg-cyan-500 ":
                        item.color === "info",
                    }
                  )}
                >
                  <span
                    className={cn(
                      "h-10 w-10 rounded-full bg-primary/40 absolute -top-3 -right-3 ring-8 ring-primary/30",
                      {
                        "bg-primary/50  ring-primary/20 dark:bg-primary dark:ring-primary/40":
                          item.color === "primary",
                        "bg-orange-200 ring-orange-100 dark:bg-orange-300 dark:ring-orange-400":
                          item.color === "warning",
                        "bg-green-200 ring-green-100 dark:bg-green-300 dark:ring-green-400":
                          item.color === "success",
                        "bg-cyan-200 ring-cyan-100 dark:bg-cyan-300 dark:ring-cyan-400":
                          item.color === "info",
                      }
                    )}
                  ></span>
                  <span className="text-sm text-default-800 dark:text-primary-foreground font-semibold capitalize relative z-10">
                    {item.text}
                  </span>
                  <span
                    className={`text-lg font-semibold text-${item.color}/80 dark:text-primary-foreground`}
                  >
                    {item.total}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {/* datos de los charts */}
            {tabsContentData.map((item, index) => (
              <TabsContent key={`report-tab-${index}`} value={item.value}>
                <ReportsChart series={item.series} chartColor={item.color} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};

export default ReportsSnapshot;
