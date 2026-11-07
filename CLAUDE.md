# La Calandria — reglas del proyecto

App de pedidos mayoristas y reparto de producción para La Calandria (bombillas y productos para el mate). Dueño, trabajadores y clientes la usan **sobre todo desde el celular**. Todo el texto de la interfaz y de los manuales va en **español rioplatense**, claro y sin jerga técnica.

Prioridades, en este orden: **seguridad**, **experiencia de uso**, **código simple y ordenado**. Ningún cambio se da por terminado sin pasar las listas de verificación de abajo.

## El repo es público: qué NO va acá

El repositorio se puede leer desde internet. No se commitea:

- Contenido de manuales, ayuda ni deuda técnica: viven en la tabla `docs` de la base (ver "Manuales").
- Claves secretas (service role, Resend, etc.): van en los secretos de Supabase. La clave *publicable* del `.env` sí puede estar: los permisos los controla la base.
- Datos reales de clientes, precios o pedidos (ni en código, ni en migraciones, ni en datos de prueba).
- Descripciones de vulnerabilidades pendientes.

Pendiente recomendado: volver el repo privado y publicar en Cloudflare Pages (ver deuda técnica en la base).

## Estructura

```
src/
  App.tsx                 rutas (público, /admin, /trabajo)
  main.tsx                providers (router, auth, carrito)
  index.css               tema (colores de marca, tipografías), estilos base, manual e impresión
  components/             piezas reutilizables
    ui.tsx                Button, Field, Modal, Tabs, Icon, BottomNav, Logo…
    layouts.tsx           layouts por rol + RequireRole (guarda de rutas)
    Payments.tsx, PaymentInfo.tsx, DemoLogin.tsx
  lib/                    lógica sin pantalla
    supabase.ts           cliente, appUrl, errMsg (mensajes legibles)
    auth.tsx              sesión + perfil (rol)
    types.ts              tipos de las tablas
    format.ts             fechas, plata, estados
    pricing.ts            precio con descuentos (misma cuenta que la base)
    notify.ts             mensajes de WhatsApp / mail al cliente
    cart.tsx, data.ts, demo.ts
  pages/
    public/               tienda y cliente (catálogo, producto, pedido, mis pedidos, ingreso)
    admin/                back office del dueño
      modals/             modales del back office
    worker/               "Mis tareas"
    shared/               pantallas de más de un rol (Ayuda)
supabase/
  migrations/             esquema, funciones y permisos, numerados (NNNN_nombre.sql)
  functions/              edge functions (notify-order, notify-client, admin-users)
```

Convenciones: un componente de pantalla por archivo, nombre en PascalCase; lo que se repite en 2 o más pantallas va a `components/` o `lib/`; tipos en `lib/types.ts`; nada de lógica de negocio solo en el navegador (precios, stock, permisos se deciden en la base).

## Base de datos (Supabase)

- Proyecto `la-calandria` (`lqqqbhvsghuvxnqsrwbb`, São Paulo). Migraciones en `supabase/migrations/`, numeradas, **solo esquema y lógica** (nada de contenido ni datos reales).
- **Aplicar migraciones en bloques chicos** (unos pocos objetos por llamada): las grandes piden una aprobación que no llega y se cortan.
- La lógica que importa vive en funciones `security definer` con `set search_path = ''`, que **verifican el rol** de quien llama (`is_admin()`, `is_staff()`, `can_buy()`).
- Supabase bloquea `DELETE` sin `WHERE` desde la API: en funciones, `delete … where true`.
- Cuidado en plpgsql: un alias de consulta con el mismo nombre que una variable (`r`, `v`) rompe en ejecución. Usar alias distintos.

## Lista de verificación de seguridad (cada cambio)

1. **Toda tabla nueva** tiene RLS activado y políticas explícitas por rol (lectura y escritura por separado). Sin políticas de `update`/`delete` si el dato no debe cambiar (ej. `docs`).
2. **Toda función nueva** `security definer`: chequea el rol al empezar, `search_path = ''`, y si es interna se revoca para `public, anon, authenticated`.
3. **Validaciones en la base**, no solo en la pantalla: `check` de largos, rangos y valores permitidos; precios y totales siempre calculados por la base.
4. **Archivos subidos**: bucket con tipos y tamaño máximo; políticas de storage que atan la carpeta al dueño del dato.
5. **HTML que viene de datos** (manuales) se limpia con DOMPurify antes de mostrarse. Nunca `dangerouslySetInnerHTML` con texto de usuarios.
6. **Probar como cada rol vía API** (anónimo, cliente, otro cliente, trabajador, dueño): lo que no debe poder leer o escribir, falla. El SQL directo corre como superusuario y saltea RLS: no sirve para probar permisos.
7. Correr los avisos de seguridad de Supabase (`get_advisors`) después de cambiar el esquema.
8. Nada sensible al repo (ver arriba).

## Lista de verificación de experiencia de uso (cada pantalla)

1. **Celular primero**: probar en iPhone (390 px) **y en Android chico (360 px)**. Sin scroll horizontal ni zoom automático: el chequeo es `window.innerWidth` igual al ancho del teléfono (si la página es más ancha, el navegador se aleja solo y `innerWidth` crece). Tarjetas en vez de tablas anchas. Barra de navegación abajo.
   - Toda grilla responsive lleva `grid-cols-1` de base (`grid grid-cols-1 lg:grid-cols-3`): sin eso, un texto largo con `truncate` estira la columna más allá de la pantalla.
   - `truncate` solo funciona dentro de un contenedor con `min-w-0`.
2. Campos de 16 px (evita el zoom de iPhone), botones grandes, acciones principales arriba y visibles.
3. Siempre los cuatro estados: **cargando**, **vacío** (con qué hacer), **error** (mensaje claro en castellano, vía `errMsg`) y **éxito** (confirmación breve).
4. Confirmar antes de algo destructivo o que no se deshace (cancelar pedido, borrar, re-planificar) y decir qué va a pasar.
5. Textos de botones = la acción ("Confirmar y generar trabajo", no "OK"). Mismos nombres en pantalla y en el manual.
6. Colores de la marca (azul marino `#0f2242`, crema, dorado de acento); títulos en Uncial Antiqua, texto en Inter. Rojo solo para atrasos y errores; verde para pagado/terminado.
7. Probar el recorrido completo con Playwright en celular y mirar las capturas antes de publicar.

## Manuales: cada cambio de funcionalidad los actualiza

Los manuales se ven en la web (**Ayuda**), se descargan en PDF desde ahí y **viven solo en la tabla `docs`**, con versiones que nunca se pisan:

| slug | Audiencia (quién lo puede leer) | Dónde se ve |
| --- | --- | --- |
| `ayuda-clientes` | `publico` (cualquiera): cómo comprar + preguntas frecuentes | `/ayuda` |
| `manual-equipo` | `equipo` (trabajadores y dueño) | `/trabajo/ayuda`, `/admin/ayuda` |
| `manual-dueno` | `admin` (solo el dueño) | `/admin/ayuda` |
| `deuda-tecnica` | `admin` | `/admin/ayuda` → Pendientes técnicos |

En **el mismo cambio** que agrega, modifica o quita una funcionalidad:

1. Leer la última versión del documento de la base, editarla y **publicar una versión nueva** (insert en `docs` como dueño, con `note` explicando el cambio). El número de versión lo pone la base.
2. Manual de cada rol que ve o usa la funcionalidad: qué hace, dónde está el botón, pasos.
3. Si un cliente puede preguntarlo (comprar, pagar, estados, envíos): pregunta frecuente en `ayuda-clientes`.
4. Si cambia lo que el dueño les dice a los clientes: mensajes de "Cómo compran los clientes" en `manual-dueno`.
5. Lo que queda pendiente o la deuda nueva: `deuda-tecnica`.

Formato: markdown simple. Preguntas frecuentes como `<details><summary>Pregunta</summary>` + línea en blanco + respuesta + `</details>`. Botones en **negrita**, tal cual aparecen en pantalla. Tokens que se completan desde Configuración: `{{negocio}}`, `{{contacto}}`, `{{datos_pago}}`.

## Web y publicación

- React + Vite + Tailwind. Se publica en GitHub Pages en cada push a `main` (`.github/workflows/pages.yml`), en `/la-calandria/`. Verificar en el sitio real después de publicar.
- Antes de commitear: `npx tsc -b`, `npm run build` y `npx eslint src` sin errores.
- Usuarios de prueba (`*@lacalandria.test`, contraseña `prueba123`) y login rápido en `/demo` mientras `VITE_DEMO_LOGIN=1`. Antes de usar con clientes reales: apagarlo y borrar esos usuarios.
