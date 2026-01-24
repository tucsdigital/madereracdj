# Sistema de Ritual Diario

## Descripción

Sistema completo de "Ritual Diario" implementado en el dashboard principal. Permite a los usuarios jugar una ruleta diaria una vez por día, competir en rankings, ganar premios y crear contenido destacado.

## Arquitectura

### Estructura de Carpetas

```
lib/
  daily/
    dateKey.ts              # Utilidades para manejar dateKey (timezone Argentina)
  game/
    roulette.ts             # Lógica del juego (probabilidades, tiers, premios)
  repo/
    interfaces.ts           # Interfaces de repositorios (desacopladas)
    firestore/
      dailySpinRepo.ts      # Implementación Firestore
      rewardClaimRepo.ts
      dailyWinnerRepo.ts
    index.ts                # Exporta instancias de repos
  security/
    rateLimit.ts            # Rate limiting básico (memory store)
  editor/
    blocks.ts               # Sistema de bloques para editor
  auth/
    currentUser.ts          # Utilidades de autenticación

app/api/
  daily-spin/
    route.ts                # POST: Jugar ruleta diaria
  daily-status/
    route.ts                # GET: Estado del ritual
  reward/
    submit-content/
      route.ts              # POST: Enviar contenido destacado
  admin/
    close-day/
      route.ts              # POST: Cerrar día y calcular winners

app/[lang]/(dashboard)/(home)/dashboard/
  components/
    daily-ritual-card.tsx      # Card principal con botón jugar
    leaderboard-card.tsx      # Ranking del día
    winners-card.tsx           # Ganadores de ayer
    spotlight-section.tsx      # Mensaje destacado
    daily-ritual-section.tsx   # Componente principal que integra todo
  hooks/
    use-daily-ritual.ts        # Hook para manejar estado y llamadas API
```

## Configuración

### Probabilidades del Juego

Las probabilidades están definidas en `lib/game/roulette.ts`:

- **Tiers:**
  - Común: 60% (score 0-50)
  - Raro: 25% (score 51-75)
  - Épico: 12% (score 76-90)
  - Legendario: 3% (score 91-100)

- **Premios por Tier:**
  - Común: 80% sin premio, 15% perk, 5% badge
  - Raro: 50% sin premio, 30% perk, 5% spotlight, 10% badge, 5% editorSlot
  - Épico: 20% sin premio, 40% perk, 15% spotlight, 15% badge, 10% editorSlot
  - Legendario: 0% sin premio, 30% perk, 30% spotlight, 20% badge, 20% editorSlot

### Timezone

El sistema usa `America/Argentina/Buenos_Aires` (UTC-3) para calcular el `dateKey` diario.

## Uso

### Para Usuarios

1. **Jugar:** Click en "Jugar Ahora" en el card de Ritual Diario
2. **Ver Ranking:** Se muestra automáticamente el Top 10 del día y tu posición
3. **Reclamar Premio:** Si ganaste spotlight o editorSlot, puedes crear contenido destacado

### Para Administradores

1. **Cerrar Día:** Llamar a `POST /api/admin/close-day` para calcular winners del día anterior
2. **Aprobar Contenido:** Los contenidos con links/videos requieren aprobación (implementar UI admin)

## Cambiar Base de Datos

Para cambiar de Firestore a Postgres/Supabase:

1. Crear nuevas clases que implementen las interfaces en `lib/repo/interfaces.ts`
2. Reemplazar las instancias en `lib/repo/index.ts`:

```typescript
// Antes:
export const dailySpinRepo = new FirestoreDailySpinRepository();

// Después:
export const dailySpinRepo = new PostgresDailySpinRepository();
```

## Rate Limiting

Actualmente usa memory store (se pierde al reiniciar). Para producción:

1. Instalar Redis
2. Reemplazar `lib/security/rateLimit.ts` con implementación Redis
3. Comentar el código actual y descomentar la versión Redis

## Cron Job

Para automatizar el cierre diario:

1. Configurar cron job que llame a `POST /api/admin/close-day` a las 00:00 (Argentina)
2. Ejemplo con Vercel Cron: agregar a `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/admin/close-day",
    "schedule": "0 3 * * *"
  }]
}
```

## Seguridad

- ✅ Validación server-side de todos los resultados
- ✅ Idempotencia por (userId + dateKey)
- ✅ Rate limiting básico
- ✅ Sanitización de contenido (XSS protection)
- ✅ Validación de bloques antes de guardar

## Próximos Pasos

- [ ] UI para aprobar/rechazar contenido destacado
- [ ] Sistema de rachas (streaks) de días consecutivos
- [ ] Badges coleccionables persistentes
- [ ] Notificaciones push cuando ganas premio
- [ ] Historial de jugadas del usuario
