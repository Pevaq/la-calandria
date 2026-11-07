# Manual del dueño

Con la app recibís los pedidos de los clientes, los cobrás, y el trabajo se reparte solo entre el equipo según cómo se fabrica cada producto. Este manual recorre cada pantalla en el orden en que se usan.

## Cómo funciona todo

Un pedido sigue siempre este camino:

1. **El cliente pide** desde la web (o lo cargás vos si te llegó por WhatsApp). Queda en **Recibido**.
2. **El cliente paga** y sube el comprobante, o registrás vos el pago. Pasa a **Pago confirmado** (aunque sea una seña).
3. **Vos lo confirmás** con una fecha de entrega. La app usa el stock que haya y reparte las tareas a cada persona, con su fecha. Pasa a **En producción**.
4. **El equipo carga el avance** desde el celular.
5. Cuando todas las tareas están hechas, pasa solo a **Listo**.
6. **Lo entregás** y lo marcás **Entregado**.

En cada paso la app te ofrece avisarle al cliente por WhatsApp con el mensaje ya escrito.

Para que el reparto funcione, cada producto tiene que tener cargadas sus **partes** (qué lleva) y sus **procesos** (qué se le hace y quién lo hace). Eso se carga una vez y sirve para todos los pedidos.

## Moverse por la app

En el celular, la barra de abajo tiene:

| Botón | Para qué |
| --- | --- |
| **Pedidos** | Todos los pedidos. El número sobre el ícono son los pedidos nuevos por confirmar. |
| **Plan** | Qué tiene que hacer cada persona esta semana. |
| **Productos** | Catálogo: productos, variantes, precios, partes y procesos. |
| **Tareas** | Tus propias tareas (por ejemplo, el armado). |
| **Más** | Reportes, Partes y stock, Equipo y clientes, Configuración, Ver tienda, Cerrar sesión. |

## Pedidos

Arriba ves cuatro números: pedidos **por confirmar**, **en producción**, **listos** y tareas **sin asignar** (si hay alguna, conviene revisarla). Si un cliente subió un comprobante, aparece un aviso y el pedido tiene el ícono 🧾.

- **Buscar:** escribí el nombre del cliente, la ciudad o el número de pedido.
- **Filtros:** Activos, Nuevos, Pago confirmado, En producción, Listos, Para stock, Entregados, Cancelados, Todos.
- **+ Cargar:** para un pedido que te llegó por WhatsApp o teléfono. Elegís el cliente, las cantidades y la fecha. Los precios y descuentos se calculan solos.
- **Producir:** para fabricar para stock, sin un cliente (ver más abajo).

Una entrega en **rojo** significa que el pedido está atrasado.

## Un pedido por dentro

Al abrir un pedido ves, de arriba hacia abajo: qué hay que hacer ahora, los pagos, el cliente, los productos y el trabajo.

### Confirmar y generar el trabajo

1. Tocá **Confirmar y generar trabajo**.
2. Elegí la **fecha de entrega**. Viene propuesta la que pidió el cliente (o hoy + los días por defecto de Configuración).
3. Dejá marcado **Usar stock disponible** si querés que primero se use lo que ya hay hecho.
4. Tocá **Confirmar**.

La app genera las tareas con fechas calculadas **hacia atrás** desde la entrega: si el armado lleva 1 día y la entrega es el viernes, las piezas tienen que estar el jueves, y así con cada paso. Al terminar te ofrece avisarle al cliente.

### Pagos (seña, saldo, comprobantes)

La tarjeta **Pagos** muestra cuánto se pagó, cuánto falta y la lista de pagos.

- **Comprobante del cliente:** aparece como **En revisión**. Tocá **Ver comprobante**, controlá que haya entrado la plata y tocá **Confirmar** (o **Rechazar** si no corresponde).
- **Registrar pago:** para un pago que te hicieron por fuera de la app (efectivo, transferencia sin comprobante, cheque). Poné el monto (viene propuesto el saldo), la forma de pago y una nota si querés.
- **Borrar un pago:** con el tachito, si lo cargaste por error.

Con el primer pago confirmado el pedido pasa a **Pago confirmado**. Cuando se cubre el total, figura **Pagado ✓**.

### Avisarle al cliente

Después de confirmar, cobrar, marcar listo o entregado aparece **¿Le avisás a…?** con el botón **Avisar por WhatsApp**: abre WhatsApp con el mensaje escrito (incluye la fecha de entrega o el monto). Solo tenés que tocar enviar. El botón **WhatsApp** de la tarjeta del cliente también arma un mensaje según el estado del pedido.

### Editar un pedido

Tocá **Editar pedido** (arriba a la derecha) para cambiar cantidades, agregar o quitar productos, o poner un precio especial. Si dejás el precio vacío, se usa el de lista con los descuentos.

Si el pedido ya estaba **en producción**, al editarlo se borran sus tareas (la app te avisa cuántas unidades ya se habían cargado como hechas), se devuelve el stock que había usado y hay que confirmarlo de nuevo.

### Listo, entregado y cancelar

- **Marcar listo:** lo hace solo cuando todas las tareas están hechas, pero lo podés marcar a mano.
- **Marcar entregado:** cuando el cliente lo recibió.
- **Cancelar pedido:** devuelve el stock usado y borra sus tareas. No se puede deshacer.

### Reasignar una tarea

En la sección **Trabajo** del pedido, cada tarea tiene un selector con el responsable. Cambialo y listo. Las tareas **Sin asignar** aparecen en amarillo.

### Notas internas

Solo las ves vos. Sirven para anotar acuerdos con el cliente, envíos, etc.

## Plan (planificación semanal)

Muestra, persona por persona, las tareas de la semana con su avance, y arriba las **Sin asignar**. Con las flechas pasás de semana; **Hoy** vuelve a la actual. Desde cada tarea podés cambiar el responsable o ir al pedido. Las atrasadas aparecen en rojo.

## Productos

### Crear un producto

1. **Productos** → **+ Nuevo producto** → escribí el nombre → **Crear y editar**.
2. Completá las pestañas que siguen y tocá **Publicar** cuando esté listo. Hasta entonces es un borrador que los clientes no ven.

**Duplicar** (arriba) copia el producto entero (variantes, partes, procesos y descuentos) como borrador sin stock: ideal para modelos parecidos.

### Datos

Nombre, categoría (por ejemplo Bombillas, Mates), descripción, **pedido mínimo** (suma de todas las variantes), orden en el catálogo y dirección web. Tocá **Guardar**.

### Fotos

Tocá el recuadro para subir fotos (JPG, PNG o WebP, hasta 5 MB). La primera es la principal; **Hacer principal** cambia cuál va primero.

### Variantes y precios

1. **Atributos:** lo que cambia entre versiones del producto (Material, Terminación, Largo…). Agregá el atributo y sus opciones (Alpaca, Acero…).
2. **Crear variantes:** la app arma todas las combinaciones que falten (Alpaca · Lisa, Alpaca · Cincelada…). Poné un precio inicial.
3. En cada variante podés cambiar el **precio**, el **código**, desactivarla o borrarla. **Stock · Ajustar** suma, resta o fija la cantidad de producto terminado.

**Descuentos por cantidad** (al final de la pestaña): "desde 100 u. → 10%". Se cuentan todas las variantes del producto en el pedido; gana el escalón más alto alcanzado.

### Partes

Qué lleva **una unidad** del producto y cuántas: palo ×1, pico ×1, filtro ×1. Si una parte solo va en algunas variantes, elegí **Cuándo**: por ejemplo, "Pico de alpaca" → *Solo si Material = Alpaca*. Cómo se fabrica cada parte se define en **Partes y stock**.

### Procesos

Lo que se hace al producto después de tener las partes: armado, cincelado, grabado, pulido final. Para cada uno:

| Campo | Qué es |
| --- | --- |
| **Sobre** | El conjunto (todo el producto) o una parte puntual ya en el producto (por ejemplo, cincelar el palo). |
| **Cuándo** | Siempre, o solo para ciertas variantes (por ejemplo, Cincelado solo si Terminación = Cincelada). |
| **Responsable** | Quién lo hace. Todas las tareas de ese proceso le llegan a esa persona. |
| **Paso n°** | El orden. Dos procesos con el mismo número se hacen en paralelo. |
| **Días** | Cuánto tarda. Se usa para calcular las fechas hacia atrás. |

## Partes y stock

**Partes:** cada pieza (palo, pico, filtro) con su stock y su **ruta de fabricación**: los procesos en orden (corte → pulido), cada uno con responsable y días. Tocá la parte para abrirla.

**Ajustar stock:** **Sumar / restar** (por ejemplo, +50 que se hicieron de más) o **Fijar cantidad** (cuando contás lo que hay). Poné un motivo.

**Movimientos de stock:** el historial de todo lo que entró y salió, con fecha y motivo (pedidos, ajustes, producción, cancelaciones).

## Producir para stock

Desde **Pedidos** → **Producir**. Elegí productos terminados o partes sueltas, las cantidades y para cuándo, y tocá **Generar producción**. Se crean las tareas como en un pedido (aparecen con el ícono de caja). Cuando el equipo las termina todas, lo producido **se suma solo al stock** y la producción queda como **Sumado al stock**.

## Equipo y clientes

### Equipo

- **+ Agregar trabajador:** nombre, email, contraseña inicial (pasásela por WhatsApp), teléfono y ciudad. Ya puede entrar.
- **Rol:** Trabajador, Administrador (ve todo, como vos) o Cliente.
- **Cambiar contraseña** si alguien se la olvidó.
- **Desactivar:** deja de poder entrar, sin perder su historial.

### Clientes

Los clientes se registran solos en la web y quedan **Pendientes** (en amarillo) hasta que los habilitás: así nadie de afuera ve tus precios mayoristas. Tocá **Habilitar**. **+ Alta manual** crea un cliente ya habilitado.

Tocá el nombre de un cliente para ver su **ficha**: pedidos, unidades, cuánto compró, **saldo pendiente**, contacto y su **descuento de cliente** (un porcentaje que se aplica a todos sus pedidos, además de los descuentos por cantidad).

## Reportes

En **Más → Reportes**, para este mes, los últimos 3 meses o el año:

- **Vendido, cobrado, saldo a cobrar y ticket promedio.**
- **Ventas por mes** de los últimos 6 meses (tocá una barra para ver el monto).
- **Productos más pedidos**, **clientes que más compraron** y **producción por persona** (unidades de tareas terminadas).

## Configuración

- **Datos para transferir:** alias, CBU/CVU, titular y banco. Es lo que ve el cliente al terminar el pedido y en las preguntas frecuentes.
- **Comprobantes:** el email y el WhatsApp donde te pueden mandar comprobantes por fuera de la app.
- **Email de pedidos nuevos:** a dónde te llega el aviso de cada pedido.
- **Avisar a los clientes por mail:** mails automáticos de confirmación, pago, listo y entregado (necesita la configuración de mails; mientras tanto, usá los avisos por WhatsApp).
- **Días de entrega por defecto:** la fecha que se propone al confirmar si el cliente no pidió una.

## Cómo compran los clientes (y qué decirles)

Los clientes tienen su propia ayuda en la web, en **Ayuda** (preguntas frecuentes y cómo comprar). Podés pasarles el link: https://pevaq.github.io/la-calandria/ayuda

El camino del cliente: se registra → lo habilitás → elige productos y cantidades → envía el pedido → transfiere y sube el comprobante → sigue el estado en **Mis pedidos**.

Mensajes listos para copiar y pegar:

**Invitar a un cliente a usar la web**

> ¡Hola! Ahora podés hacer tus pedidos de La Calandria desde la web: https://pevaq.github.io/la-calandria/ . Registrate con los datos de tu comercio y te habilitamos para que veas los precios. Si tenés dudas, en "Ayuda" está todo explicado.

**Avisar que lo habilitaste**

> ¡Listo! Ya habilitamos tu cuenta. Entrá a https://pevaq.github.io/la-calandria/ con tu email y vas a ver los precios mayoristas. Elegí cantidades, enviá el pedido y al final te mostramos los datos para transferir.

**Recordarle cómo mandar el comprobante**

> ¡Hola! Para el pedido #(número): entrá en "Mis pedidos", abrí el pedido y tocá "Ya pagué: subir comprobante". Podés sacarle una foto o subir el PDF del banco.

## Si algo no anda

<details><summary>Un pedido confirmado no generó tareas</summary>

Puede ser que todo haya salido del stock (en el pedido dice "de stock" en cada producto), o que el producto no tenga partes ni procesos cargados. Revisá el producto en **Productos**.
</details>

<details><summary>Aparecen tareas "Sin asignar"</summary>

Hay un proceso sin responsable, o una parte sin ruta de fabricación (en ese caso la tarea se llama "Fabricación"). Asignala desde el pedido o desde **Plan**, y cargá el responsable en el producto o en **Partes y stock** para que no vuelva a pasar.
</details>

<details><summary>Un cliente dice que no ve precios</summary>

Su cuenta está **Pendiente**. Habilitala en **Equipo y clientes → Clientes**.
</details>

<details><summary>Un trabajador no ve una tarea</summary>

Las tareas aparecen recién cuando confirmás el pedido. Si ya está confirmado, revisá en el pedido a quién quedó asignada.
</details>

<details><summary>Me equivoqué al confirmar (fecha, stock)</summary>

Tocá **Editar pedido** y guardalo sin cambios para que vuelva a "por confirmar", y confirmalo de nuevo. Se borra el avance que se haya cargado.
</details>

<details><summary>No llegan los mails</summary>

Los mails necesitan una configuración pendiente (cuenta de Resend). Mientras tanto, revisá los pedidos nuevos en la app y avisá a los clientes por WhatsApp desde cada pedido.
</details>

## Manual del equipo

Lo que ve y hace cada trabajador está en **Más → Ayuda → Manual del equipo**. Conviene leerlo para saber qué ven ellos.
