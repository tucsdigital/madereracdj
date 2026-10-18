# Contenido editorial de productos

El contenido administrado en **Tienda web → Productos** se guarda en `settings/tiendaProductosContenido`. La API administrativa valida la versión base, publica el documento y deja el antes/después en `settingsHistory`. El catálogo Firestore sigue siendo la fuente de precio, stock, unidad y medidas.

## Resolución

La API `/api/precios` incluye `tiendaContent`, resuelto con esta prioridad:

1. Global.
2. Reglas de categoría.
3. Reglas más específicas por subcategoría, tipo, material, unidad o uso.
4. Excepción del producto.

Cada parche reemplaza solo los campos que define. Si una regla coincide con un producto futuro, también se aplica cuando ese producto aparezca en la tienda. Descripción e imágenes pueden tener reglas independientes. Una lista de imágenes vacía hereda el nivel anterior; una regla sin descripción o sin imágenes tampoco borra el valor heredado. Sin una sobrescritura editorial, quedan las imágenes y descripción del catálogo original.

## Imágenes

- Máximo 12 imágenes por nivel; las imágenes nuevas se recortan al centro a 1200 × 1200 px (1:1). El original debe tener al menos 1200 px en cada lado.
- La primera imagen es la portada para tarjetas; la ficha pública muestra miniaturas para recorrer la galería.
- Los assets se referencian por URL compartida, no se duplican al asignar una regla.
- La carpeta de biblioteca de producto es `tienda/productos`. La limpieza de medios protege las URLs referenciadas por el contenido publicado.
- Solo se aceptan rutas locales `/images/` o URLs HTTPS del host R2 configurado y bajo `/tienda/`.

## Verificación

Desde `sistema`:

```sh
node --test
npx next lint --file "components/tienda-web/ProductosContenidoManager.jsx" --file "components/tienda-web/ObrasManager.jsx" --file "app/[lang]/(dashboard)/tienda-web/page.jsx"
```

Desde `tienda`:

```sh
node --test
npx tsc --noEmit --incremental false
```
