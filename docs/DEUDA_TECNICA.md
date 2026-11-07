# Deuda técnica y pendientes

Lista viva de lo que quedó para más adelante. Prioridad: 🔴 alta · 🟡 media · 🟢 baja.
Esfuerzo: S (horas) · M (1–2 días) · L (más).

## Seguridad

| # | Tema | Riesgo | Qué hacer | Prioridad | Esfuerzo |
|---|---|---|---|---|---|
| S1 | **Dueño entra sólo con contraseña** | Si se filtra o adivinan la clave, controlan todo | Verificación en dos pasos (TOTP) obligatoria para administradores. Supabase la trae gratis; exigir `aal2` en `is_admin()` para que la base rechace sesiones sin el segundo paso | 🔴 | M |
| S2 | **Usuarios de prueba con clave conocida** (`*@lacalandria.test`, `prueba123`), uno es admin | Cualquiera puede entrar como dueño | Antes de usar con clientes reales: borrar esos usuarios y apagar el login rápido (`VITE_DEMO_LOGIN=0` en `.env`) | 🔴 | S |
| S3 | **Sin protección contra bots** | Altas masivas, prueba de contraseñas | CAPTCHA (Cloudflare Turnstile, gratis) en registro, ingreso y "olvidé mi contraseña"; se activa en Supabase → Authentication → Attack Protection + el widget en la web | 🔴 | S |
| S4 | **Redirecciones de los mails de auth** | El link de "olvidé mi contraseña" podría apuntar a otro sitio | Supabase → Authentication → URL Configuration: *Site URL* y *Redirect URLs* sólo `https://pevaq.github.io/la-calandria/**` (o el dominio final) | 🔴 | S |
| S5 | **Contraseñas débiles** (mínimo 6) | Más fáciles de adivinar | Mínimo 8–10 con letras y números (Supabase → Authentication → Passwords). La detección de contraseñas filtradas requiere plan pago | 🟡 | S |
| S6 | **Los trabajadores ven de más** | Pueden leer todos los pedidos (montos) y datos de contacto de clientes | Restringir `orders_select` y `profiles_select` para `worker`: sólo número y fecha de los pedidos con tareas suyas, sin montos; perfiles sólo del equipo | 🟡 | M |
| S7 | **Sin límites anti-spam** | Un cliente habilitado puede crear muchísimos pedidos o disparar mails repetidos | Límite de pedidos por cliente por hora en `place_order`; límite de invocaciones en `notify-order`. (Las notas ya tienen largo máximo) | 🟡 | S |
| S8 | **Sin historial de cambios** | No se sabe quién cambió un precio, canceló o marcó un pago | Tabla `audit_log` con triggers en pedidos, pagos, precios y stock | 🟡 | M |
| S9 | **Sin backups propios** | El plan gratis no da backups descargables y pausa el proyecto tras 7 días sin uso | Exportación semanal a planilla (o `pg_dump` programado); evaluar plan Pro cuando se use en serio | 🟡 | S |
| S10 | **Sesiones abiertas en celulares compartidos** | Alguien usa el teléfono del taller con la sesión de otro | Cierre de sesión por inactividad para trabajadores | 🟢 | S |
| S11 | **Configuración pública** | El mail del dueño se puede leer sin iniciar sesión (alias/CBU sí deben ser públicos) | Vista pública sólo con los datos de pago | 🟢 | S |
| S12 | **Encabezados de seguridad del navegador** | GitHub Pages no permite CSP ni otros headers | Al pasar a Cloudflare Pages: `_headers` con CSP, `X-Frame-Options`, etc. | 🟢 | S |

## Funcionalidad postergada

| # | Tema | Notas | Esfuerzo |
|---|---|---|---|
| F1 | **Capacidad semanal por trabajador** | Horas o unidades por semana; alertar si una semana se pasa; sugerir fechas posibles al confirmar | L |
| F2 | **Logística Pergamino ↔ Rosario** | Qué piezas viajan, cuándo, y que el armado espere la llegada | L |
| F3 | Pedidos editados en producción pierden el avance | Hoy se re-planifica todo (se avisa antes). Mejor: conservar lo ya hecho y sólo agregar/quitar la diferencia | M |
| F4 | Lo terminado de más no vuelve al stock | Si se cancela un pedido con piezas ya hechas, sumarlas al stock | S |

## Experiencia de uso a revisar con el dueño

- El editor de producto (partes, procesos, condiciones) es lo más abstracto: ver si lo entiende solo; si no, asistente paso a paso o plantilla "bombilla estándar".
- "Paso n°" y "días" de cada proceso pueden no ser intuitivos.
- Al confirmar un pedido no se ve antes qué stock se va a usar: agregar un resumen previo ("se usan 50 palos de stock, se fabrican 250").

## Mails (requiere acción del dueño)

1. Crear cuenta en **resend.com** con el mail del dueño y generar una API key.
2. Cargarla en Supabase → Edge Functions → **Secrets** como `RESEND_API_KEY`.
3. Con eso ya llega el aviso de **pedido nuevo** al dueño.
4. Para mandar mails **a clientes** (avisos de estado) y para que funcione **"olvidé mi contraseña"**: verificar un dominio propio en Resend, cargar `MAIL_FROM` (ej. `La Calandria <pedidos@dominio>`), configurar Resend como SMTP en Supabase → Authentication → SMTP, y activar "Avisar a los clientes por mail" en Configuración.
