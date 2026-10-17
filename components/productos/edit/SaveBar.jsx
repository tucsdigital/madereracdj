"use client";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Btn } from "@/components/panel-ui/ui";

/**
 * Barra de guardado fija: aparece sólo cuando hay algo para guardar y acompaña a quien edita.
 * Estados: dirty (cambios), saving, saved (confirmación breve) y error.
 */
export default function SaveBar({ status, count, errorCount, message, onSave, onDiscard }) {
  const visible = status !== "idle";
  const tone = status === "error" ? "text-destructive" : status === "saved" ? "text-emerald-700" : "text-foreground";
  return (
    <div
      className={cn(
        "pointer-events-none sticky bottom-4 z-30 mt-6 flex justify-center px-2 transition-all duration-300 motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      )}
      aria-live="polite"
    >
      <div className={cn("pointer-events-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/95 px-4 py-3 shadow-xl backdrop-blur", status === "error" ? "border-destructive/40" : "border-border", !visible && "pointer-events-none")}>
        <div className={cn("flex min-w-0 items-center gap-2.5 text-sm font-medium", tone)}>
          {status === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : status === "saved" ? <CheckCircle2 className="h-4 w-4" /> : status === "error" ? <AlertCircle className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-amber-500" />}
          <span className="truncate">
            {status === "saving" ? "Guardando cambios…" : status === "saved" ? "Cambios guardados" : status === "error" ? message || `Revisá ${errorCount} campo${errorCount === 1 ? "" : "s"} antes de guardar` : `${count} cambio${count === 1 ? "" : "s"} sin guardar`}
          </span>
        </div>
        {status === "dirty" || status === "error" || status === "saving" ? (
          <div className="flex items-center gap-2">
            <Btn variant="ghost" onClick={onDiscard} disabled={status === "saving"}><RotateCcw className="h-4 w-4" /> Descartar</Btn>
            <Btn variant="primary" onClick={onSave} disabled={status === "saving"}>
              {status === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar cambios
            </Btn>
          </div>
        ) : null}
      </div>
    </div>
  );
}
