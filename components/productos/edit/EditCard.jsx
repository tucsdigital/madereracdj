"use client";
import { cn } from "@/lib/utils";
import { Chip } from "@/components/panel-ui/ui";

/** Tarjeta de sección de la pantalla de edición: título, explicación y marca de "modificado". */
export default function EditCard({ id, title, description, icon: Icon, modified, action, className, children }) {
  return (
    <section id={id} className={cn("scroll-mt-24 rounded-xl border border-border bg-card", className)}>
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-default-100 text-default-600">
              <Icon className="h-[18px] w-[18px]" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6">{title}</h2>
            {description ? <p className="text-sm text-default-500">{description}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {modified ? <Chip tone="warn">Modificado</Chip> : null}
          {action}
        </div>
      </header>
      <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
    </section>
  );
}
