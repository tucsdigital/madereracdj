# Guía UI Global – Light/Dark

## Objetivo
Mantener contraste y legibilidad en modo claro y oscuro en todas las pantallas (dashboard, listados, formularios, modales y pantallas internas) evitando clases “solo light” (por ejemplo `bg-white`, `bg-*-50`, `text-slate-900`, `border-slate-*`) y usando tokens de tema + opacidades.

## Tokens base recomendados
- Contenedores: `bg-card`, `border-border`
- Texto: `text-foreground`, `text-muted-foreground`
- Superficies suaves: `bg-muted/50`, `bg-card/60`
- Bordes suaves: `border border-border/60`
- Overlay sutil: `bg-gradient-to-br from-foreground/5 via-transparent to-transparent`

## Reglas rápidas
- Base: contenedores `bg-card` + `border border-border/60`, texto `text-foreground` y secundarios `text-muted-foreground`.
- Evitar: `bg-white`, `bg-*-50`, `text-slate-900`, `border-slate-*`, `text-gray-*`, `border-gray-*` en UI de aplicación (porque rompen en dark).
- Colores (estado/acción): usar opacidades (`*-500/10`, `*-500/20`) + variantes `dark:*` cuando aplique.
- Tablas: separar fondo/encabezado/divisores con tokens y evitar `bg-*-50` en hover/thead.

## Estructura base de Card

### Wrapper
```tsx
<Card className="relative rounded-3xl shadow-2xl border border-border overflow-hidden bg-card">
  <div className="absolute inset-0 bg-gradient-to-br from-foreground/5 via-transparent to-transparent pointer-events-none" />
  ...
</Card>
```

### Header
- Padding: `pt-6 pb-4 px-6`
- Título con gradiente compatible con dark:
```tsx
<CardTitle className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-slate-700 via-gray-700 to-zinc-700 dark:from-slate-100 dark:via-gray-100 dark:to-zinc-100 flex items-center gap-3">
  ...
</CardTitle>
```

### Icono del título
```tsx
<div className="p-2 rounded-2xl bg-muted/50 shadow-lg">
  <Icon className="w-5 h-5 md:w-6 md:h-6 text-slate-700 dark:text-slate-200" />
</div>
```

## Items clickeables / tarjetas internas
Usar “glass” consistente:
```tsx
className="bg-card/60 border border-border/60 shadow-lg backdrop-blur-sm hover:bg-card/80 hover:shadow-xl transition-all"
```

## Badges de estado (nivel, tips, etc.)
Patrón recomendado para reemplazar `bg-*-50`:
- Fondo: `bg-{color}-500/10`
- Borde: `border border-{color}-500/20`
- Texto: `text-{color}-700 dark:text-{color}-300`

Ejemplo:
```tsx
className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
```

## Reporte mensual (bloques KPI)
Separar por color usando opacidades (mantiene identidad en dark sin depender de `*-50`):

### Ventas
```tsx
className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/10 to-emerald-500/5 border border-emerald-500/20"
```

### Obras
```tsx
className="bg-gradient-to-br from-sky-500/15 via-sky-500/10 to-sky-500/5 border border-sky-500/20"
```

### Comisiones
```tsx
className="bg-gradient-to-br from-amber-500/15 via-amber-500/10 to-amber-500/5 border border-amber-500/25"
```

Textos recomendados dentro del bloque:
- Título: `text-{color}-700/90 dark:text-{color}-300/90`
- Valor principal: `text-{color}-800 dark:text-{color}-100`
- Secundario: `text-{color}-700/90 dark:text-{color}-200/90`
- Valores negativos: `text-red-700 dark:text-red-300`

Sub-bloques dentro del reporte:
```tsx
className="bg-card/60 border border-border/60 rounded-xl px-3 py-2"
```

## Tablas dentro del reporte
- Contenedor: `bg-card/70 border border-border rounded-2xl p-4`
- Encabezado: `text-muted-foreground`
- Separadores: `border-t border-border/50`
- Links: `text-foreground hover:underline`

## Checklist rápido
- Usar `bg-card`/`border-border` para contenedores principales.
- Evitar `bg-white`, `bg-*-50`, `border-slate-*`, `text-slate-900` en toda la app.
- Preferir `bg-*-500/10` + `text-*-700 dark:text-*-300` para estados.
- Si se usa `text-transparent bg-clip-text`, asegurar variantes `dark:*` en el gradiente.
