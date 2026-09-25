"use client";
import { useMemo, useState } from "react";
import { useAuth } from "@/provider/auth.provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@iconify/react";
import Link from "next/link";
import { useLocalizedPath } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ProfileInfo = () => {
  const { user, logout } = useAuth();
  const localize = useLocalizedPath();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reportEmail, setReportEmail] = useState("");
  const [reportExports, setReportExports] = useState({ obras: true, ventas: false });
  const [sendingReport, setSendingReport] = useState(false);
  const [reportFeedback, setReportFeedback] = useState(null);
  const isAdmin = user?.email?.toLowerCase() === "admin@admin.com";
  const isValidEmail = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reportEmail.trim()), [reportEmail]);

  const openReport = () => {
    setReportFeedback(null);
    setReportOpen(true);
  };

  const sendReport = async () => {
    if (!user || !reportMonth || !isValidEmail || sendingReport) return;
    setSendingReport(true);
    setReportFeedback(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/reportes/obras", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ month: reportMonth, email: reportEmail.trim(), exports: Object.entries(reportExports).filter(([, active]) => active).map(([name]) => name) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "No se pudo enviar el reporte.");
      setReportFeedback({ type: "success", text: `Reporte enviado a ${payload.recipient}.` });
    } catch (error) {
      setReportFeedback({ type: "error", text: error?.message || "No se pudo enviar el reporte." });
    } finally {
      setSendingReport(false);
    }
  };

  if (!user) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild className=" cursor-pointer">
          <div className=" flex items-center  ">
          {/* Puedes agregar un avatar por defecto si quieres */}
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold uppercase">
            {user.displayName?.[0] || user.email?.[0] || "U"}
          </div>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 p-0" align="end">
        <DropdownMenuLabel className="flex gap-2 items-center mb-1 p-3">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold uppercase">
            {user.displayName?.[0] || user.email?.[0] || "U"}
          </div>
          <div>
            <div className="text-sm font-medium text-default-800 capitalize ">
              {user.displayName || user.email?.split("@")[0] || "Usuario"}
            </div>
            <div className="text-xs text-default-600">{user.email}</div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {[
            {
              name: "Perfil",
              icon: "heroicons:user",
              href: "/dashboard",
            },
            {
              name: "Configuración",
              icon: "heroicons:paper-airplane",
              href: "/dashboard",
            },
          ].map((item, index) => (
            <Link
              href={localize(item.href)}
              key={`info-menu-${index}`}
              className="cursor-pointer"
            >
              <DropdownMenuItem className="flex items-center gap-2 text-sm font-medium text-default-600 capitalize px-3 py-1.5 dark:hover:bg-background cursor-pointer">
                <Icon icon={item.icon} className="w-4 h-4" />
                {item.name}
              </DropdownMenuItem>
            </Link>
          ))}
          </DropdownMenuGroup>
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  openReport();
                }}
                className="flex items-center gap-2 text-sm font-medium text-default-600 capitalize px-3 py-2 dark:hover:bg-background cursor-pointer"
              >
                <Icon icon="heroicons:document-chart-bar" className="w-4 h-4 text-primary" />
                Reporte
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator className="mb-0 dark:bg-background" />
          <DropdownMenuItem
            onSelect={logout}
            className="flex items-center gap-2 text-sm font-medium text-default-600 capitalize my-1 px-3 dark:hover:bg-background cursor-pointer"
          >
            <Icon icon="heroicons:power" className="w-4 h-4" />
            Salir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isAdmin && (
        <Dialog
          open={reportOpen}
          onOpenChange={(open) => {
            if (!sendingReport) setReportOpen(open);
          }}
        >
          <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-border/70 p-0 overflow-hidden">
            <DialogHeader className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 pb-5 pt-7 text-left">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Icon icon="heroicons:document-chart-bar" className="h-5 w-5" />
              </div>
              <DialogTitle className="text-xl font-bold">Enviar reporte de obras</DialogTitle>
              <DialogDescription className="pt-1 leading-5">
                Incluye las obras confirmadas, las pendientes de cobrar y la comisión del 2,5% sobre las confirmadas.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 px-6 py-5">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-default-800">Mes del reporte</span>
                <Input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} disabled={sendingReport} />
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-default-800">Exportar</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["obras", "Obras"],
                    ["ventas", "Ventas"],
                  ].map(([key, label]) => (
                    <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${reportExports[key] ? "border-primary bg-primary/10 text-primary" : "border-border text-default-600"}`}>
                      <input type="checkbox" checked={reportExports[key]} onChange={(event) => setReportExports((current) => ({ ...current, [key]: event.target.checked }))} disabled={sendingReport} className="h-4 w-4 accent-primary" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-default-800">Enviar a</span>
                <Input type="email" value={reportEmail} onChange={(event) => setReportEmail(event.target.value)} placeholder="nombre@empresa.com" autoComplete="email" disabled={sendingReport} />
                <span className="block text-xs text-default-500">El PDF se genera al momento y se envía únicamente a esta dirección.</span>
              </label>
              {reportFeedback && (
                <div className={`flex gap-2 rounded-lg border px-3 py-2.5 text-sm ${reportFeedback.type === "success" ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`} role="status">
                  <Icon icon={reportFeedback.type === "success" ? "heroicons:check-circle" : "heroicons:exclamation-circle"} className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{reportFeedback.text}</span>
                </div>
              )}
            </div>
            <DialogFooter className="border-t bg-default-50/70 px-6 py-4 sm:justify-between">
              <Button type="button" variant="outline" color="secondary" onClick={() => setReportOpen(false)} disabled={sendingReport}>Cancelar</Button>
              <Button type="button" onClick={sendReport} disabled={!reportMonth || !isValidEmail || !Object.values(reportExports).some(Boolean) || sendingReport} className="min-w-36">
                <Icon icon={sendingReport ? "svg-spinners:ring-resize" : "heroicons:paper-airplane"} className="mr-2 h-4 w-4" />
                {sendingReport ? "Enviando..." : "Enviar reporte"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
export default ProfileInfo;
