# Dirección visual del sistema

Estas reglas aplican a pantallas nuevas y a renovaciones de interfaz.

## Principio

No heredar automáticamente la apariencia de los componentes existentes. Primero definir la jerarquía, la densidad y el flujo de lectura de la pantalla; después elegir componentes que lo resuelvan. La lógica, los datos y los permisos se conservan, pero la presentación no queda atada a los patrones visuales antiguos.

## Evitar

- Cuadrículas de tarjetas idénticas para cada cifra, entidad o acción.
- Contenedores grandes con borde sólido alrededor de cada sección y sub-sección.
- Mosaicos decorativos de icono + color, degradados de portada y banners sin función.
- Insignias con forma de píldora para valores que se entienden mejor como texto jerarquizado; los estados pueden usar una insignia compacta cuando la referencia visual lo indique.
- Tablas anchas que obliguen a desplazamiento horizontal en móvil cuando pueden convertirse en filas adaptables.
- Duplicar acciones o datos en varios paneles solo para llenar espacio.

## Preferir

- Jerarquía tipográfica clara, espacio en blanco y composición asimétrica cuando ayude a priorizar.
- Fondos neutros y una paleta de acento acotada; color solo para estado, énfasis o acción.
- Listas y libros de actividad con separadores sutiles; reservar bordes para controles, foco, límites realmente necesarios y accesibilidad.
- Resúmenes compactos y sin cajas repetidas; mostrar primero la cifra o tarea que guía la decisión.
- Acciones contextuales y estados vacíos útiles; mantener respuestas visuales rápidas y movimiento discreto.
- Diseño adaptable, navegación por teclado, contraste suficiente y respeto por `prefers-reduced-motion`.

## Temas y configuración de colores

- Antes de modificar colores, revisar cómo se definen y aplican los temas en `config/themes.js`, `app/assets/css/globals.css` y `app/assets/css/theme.css`. Mantener coherencia entre los temas disponibles y sus variantes claras y oscuras; no crear una paleta paralela dentro de una pantalla.
- Para superficies y texto dependientes del tema, preferir los tokens semánticos (`background`, `foreground`, `card`, `muted`, `border`, `primary` y sus colores de primer plano) en lugar de colores fijos de Tailwind, valores hexadecimales o RGB.
- Reservar `success`, `warning`, `destructive` e `info` para sus significados semánticos. Usar el color de primer plano correspondiente cuando exista texto o iconografía sobre un fondo de estado. No reemplazar estos significados por el color primario.
- Los estados hover, focus, active y disabled deben conservar contraste en todos los temas. En hover neutral, combinar una superficie como `muted` con texto `foreground`; sobre fondos `primary`, usar `primary-foreground`. No asumir que el texto `primary` será legible sobre cualquier fondo.
- Los gráficos circulares y de dona de estadísticas deben usar un solo matiz derivado del color `primary` del tema seleccionado, diferenciado mediante tonos en capas. Adaptar los tonos al tema claro u oscuro y evitar paletas de varios colores categóricos en esos gráficos. Conservar los colores semánticos en indicadores y componentes fuera de ellos.
- Si se agrega o modifica un token, comprobar su definición y contraste en todas las variantes de tema que lo necesiten; no depender de que un tema particular sea el predeterminado.

## Estándar para tablas y listados

- Usar como patrón de los listados la composición de `/ventas/deudores`: título y cantidad de resultados en línea, descripción breve debajo y búsqueda, filtro y exportación alineados en una sola barra.
- Presentar los datos en una tabla compacta dentro de un contenedor de borde fino y esquinas discretas; encabezado claro con ordenamiento, columnas alineadas y separadores sutiles entre filas. No sustituir esta composición por mosaicos de tarjetas.
- En la primera columna, priorizar la entidad y su identificador; mostrar debajo los datos de contacto o contexto. Alinear importes a la derecha, usar cifras tabulares y reservar el énfasis para el saldo.
- Mostrar estados con una insignia compacta, punto de color semántico y texto legible. Mantener una acción principal visible y agrupar las acciones secundarias en un menú contextual.
- En móvil, reorganizar las columnas como filas o registros apilados con etiquetas visibles; evitar el desplazamiento horizontal cuando la información pueda adaptarse sin perder contexto.
- Mostrar los nombres de clientes en MAYÚSCULAS en las listas de `/ventas` y `/obras`, sin alterar los datos originales.
- Formatear importes sin decimales cuando no haya centavos (`$848.300`) y conservar dos decimales cuando los haya (`$848.300,50`). No mostrar `,00`.
- Conservar las búsquedas, filtros, ordenamientos, paginación, permisos, navegación y acciones existentes al renovar una tabla. Resolver explícitamente los estados de carga, error y vacío.

## Revisión antes de terminar

1. Comprobar móvil y escritorio, incluidos estados de carga, error, vacío y contenido extenso.
2. Preguntar si la jerarquía se entiende de inmediato y si se repitió la misma tarjeta más de lo necesario.
3. Verificar que búsquedas, filtros, permisos, navegación y operaciones existentes sigan funcionando.
4. No dar por terminada una renovación visual por cambiar únicamente radios, colores o sombras.
5. Comprobar contraste de texto e iconos en hover, foco y estado activo, en temas claros y oscuros; verificar también que los cambios respeten la configuración de tema seleccionada.
