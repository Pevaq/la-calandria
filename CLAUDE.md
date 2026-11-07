# La Calandria — reglas del proyecto

App de pedidos mayoristas y reparto de producción para La Calandria (bombillas y productos para el mate). Dueño, trabajadores y clientes la usan sobre todo desde el **celular**. Todo el texto de la interfaz y la documentación va en **español rioplatense**, claro y sin jerga técnica.

## Regla: cada cambio de funcionalidad actualiza los manuales

Los manuales se muestran en la web (sección **Ayuda**) y se descargan en PDF desde ahí. Son la única fuente: no hay otra copia.

| Archivo | Quién lo lee | Dónde se ve |
| --- | --- | --- |
| `docs/manual/clientes.md` | Clientes: cómo comprar + preguntas frecuentes | `/ayuda` (público) |
| `docs/manual/equipo.md` | Trabajadores | `/trabajo/ayuda` y `/admin/ayuda` |
| `docs/manual/dueno.md` | Dueño (admin) | `/admin/ayuda` |

En **el mismo cambio** que agrega, modifica o quita una funcionalidad:

1. Actualizar el o los manuales de los roles que la ven o la usan (qué hace, dónde está el botón, pasos).
2. Si cambia algo que un cliente puede preguntar (comprar, pagar, estados, envíos), agregar o corregir la pregunta en `clientes.md`.
3. Si cambia lo que el dueño les dice a los clientes, actualizar los mensajes de "Cómo compran los clientes" en `dueno.md`.
4. Si cambia la deuda técnica o algo queda pendiente, actualizar `docs/DEUDA_TECNICA.md`.

Formato de los manuales: markdown simple. Preguntas frecuentes como `<details><summary>Pregunta</summary>…</details>` (dejar una línea en blanco después de `<summary>…</summary>`). Nombres de botones en **negrita**, tal cual aparecen en pantalla. Datos variables con tokens que se completan desde Configuración: `{{negocio}}`, `{{contacto}}`, `{{datos_pago}}`.

## Base de datos (Supabase)

- Proyecto `la-calandria` (`lqqqbhvsghuvxnqsrwbb`). Migraciones en `supabase/migrations/`, numeradas.
- **Aplicar migraciones en bloques chicos** (unos pocos objetos por llamada): las migraciones grandes piden una aprobación que no llega y se cortan.
- La lógica que importa vive en funciones de la base con `security definer`, que verifican el rol de quien llama. Toda tabla nueva lleva RLS. Las funciones internas se revocan para `anon`/`authenticated`.
- Supabase bloquea `DELETE` sin `WHERE` desde la API: en funciones usar `delete … where true`.
- Probar la lógica con un `do $$ … raise exception 'RESULT %' $$` (se deshace solo) y la seguridad con usuarios reales vía API (el SQL directo corre como superusuario y saltea RLS).

## Web

- React + Vite + Tailwind, publicada en GitHub Pages en cada push a `main` (`.github/workflows/pages.yml`), en `/la-calandria/`.
- Diseño pensado primero para el celular: barra de navegación inferior, tarjetas en lugar de tablas, campos de 16px.
- Usuarios de prueba (`*@lacalandria.test`, contraseña `prueba123`) y login rápido en `/demo` mientras `VITE_DEMO_LOGIN=1`. Antes de usar con clientes reales: apagarlo y borrar esos usuarios (ver `docs/DEUDA_TECNICA.md`).
