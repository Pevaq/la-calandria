# La Calandria · gestión de pedidos y producción

Web para clientes mayoristas + back office para el dueño + vista "Mis tareas" para cada trabajador.

- **Clientes**: se registran, el dueño los habilita, ven precios, arman el pedido y al final ven el alias/CBU y a dónde mandar el comprobante. Siguen el estado del pedido.
- **Dueño (admin)**: carga productos con atributos y variantes, fotos, precios y stock; define las partes de cada producto y los procesos (de cada parte y del producto armado) con un responsable fijo. Al **confirmar un pedido** el sistema usa el stock disponible y genera las tareas de cada trabajador con fechas calculadas hacia atrás desde la entrega.
- **Trabajadores**: ven qué les toca, de qué pedido es y para cuándo, y cargan el avance desde el celular.

## Tecnología (todo en planes gratis)

| Pieza | Servicio |
|---|---|
| Base de datos, usuarios, fotos, funciones | Supabase (proyecto `la-calandria`, región São Paulo) |
| Web (React + Vite + Tailwind) | Cloudflare Pages (o cualquier hosting estático) |
| Mails de pedido nuevo | Resend |

La lógica importante vive en la base (Postgres) y está protegida por rol:

- `supabase/migrations/` — tablas, funciones (`place_order`, `confirm_order`, `cancel_order`, `report_progress`, `adjust_stock`) y permisos (RLS).
- `supabase/functions/notify-order` — manda el mail al dueño cuando entra un pedido.
- `supabase/functions/admin-users` — alta de trabajadores/clientes y cambio de contraseña (sólo admin).

## Desarrollo local

```bash
npm install
npm run dev
```

El archivo `.env` ya apunta al proyecto de Supabase (la clave publicable es pública por diseño; los permisos los controla la base).

## Puesta en marcha (una sola vez)

1. **Publicar la web** en Cloudflare Pages: conectar este repo, comando de build `npm run build`, carpeta `dist`. El archivo `public/_redirects` ya hace que funcionen las rutas.
2. **Supabase → Authentication → URL Configuration**: poner la URL publicada como *Site URL* (para los links de los mails de contraseña).
3. **Supabase → Authentication → Sign In / Providers → Email**: desactivar *Confirm email*. El dueño ya habilita a cada cliente a mano, y el servidor de mail gratuito de Supabase sólo manda a los miembros del equipo, así que con la confirmación activada los clientes no podrían terminar el registro. (Alternativa: configurar Resend como SMTP propio.)
4. **Mails de pedido nuevo**: crear una cuenta en resend.com **con el mail del dueño**, generar una API key y cargarla en Supabase → Edge Functions → Secrets como `RESEND_API_KEY`. En la app, Configuración → "Email donde llegan los pedidos nuevos" con ese mismo mail. (Con dominio propio verificado en Resend se puede mandar a cualquier dirección y definir `MAIL_FROM`.)
5. **Primer usuario = administrador**: el primero que se registra en la web queda como admin. Después, desde *Equipo y clientes* se dan de alta los trabajadores.

## Cómo se calcula el trabajo

Ejemplo: pedido de 100 *Alpaca · Cincelada* (hay 20 en stock) + 200 *Acero · Lisa*, entrega 1/12.

1. Se usan las 20 en stock → se fabrican 80 + 200.
2. Procesos del producto, hacia atrás desde la entrega: Armado (1 día) el 1/12, Cincelado del palo (2 días, sólo variante cincelada) el 30/11.
3. Partes necesarias (antes del primer proceso del producto): 280 palos (− stock), 80 picos de alpaca, 200 de acero, 280 filtros.
4. Cada parte sigue su ruta (ej. Palo: Corte 2 días → Pulido 1 día), con el responsable fijo de cada paso.
5. Si una parte no tiene procesos definidos, se crea una tarea "Fabricación" **sin asignar** para que el dueño la vea.

Cuando todas las tareas de un pedido se terminan, el pedido pasa solo a **Listo**. Cancelar un pedido devuelve el stock usado y borra sus tareas.

## Pendiente / ideas

- Traslado de piezas entre Pergamino y Rosario (logística).
- Capacidad semanal por trabajador y alertas de sobrecarga.
- Avisos por WhatsApp; aviso al cliente cuando cambia el estado.
- Producción para stock (sin pedido) y que lo terminado sume al stock.
