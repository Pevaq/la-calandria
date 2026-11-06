-- =====================================================================
-- La Calandria · esquema inicial
-- Catálogo (productos, atributos, variantes), partes, procesos,
-- pedidos, tareas de producción y movimientos de stock.
-- =====================================================================

create type public.user_role    as enum ('admin', 'worker', 'client');
create type public.order_status as enum ('recibido', 'pago_confirmado', 'en_produccion', 'listo', 'entregado', 'cancelado');
create type public.task_status  as enum ('pendiente', 'en_curso', 'hecha');

-- ---------------------------------------------------------------------
-- Perfiles y configuración
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  role        public.user_role not null default 'client',
  full_name   text,
  company     text,
  phone       text,
  cuit        text,
  city        text,
  address     text,
  approved    boolean not null default false,  -- clientes: el dueño los habilita
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.settings (
  id                   int primary key default 1 check (id = 1),
  business_name        text not null default 'La Calandria',
  bank_alias           text,
  bank_cbu             text,
  bank_holder          text,
  bank_name            text,
  receipt_email        text,          -- a dónde el cliente manda el comprobante
  receipt_whatsapp     text,
  notify_email         text,          -- a dónde llega el aviso de pedido nuevo
  payment_instructions text,
  default_lead_days    int not null default 14,
  updated_at           timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  category    text,
  published   boolean not null default false,
  min_qty     int not null default 1,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  path        text not null,           -- ruta en el bucket product-images
  sort        int not null default 0
);

create table public.product_attributes (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null,           -- ej: Material, Terminación
  sort        int not null default 0
);

create table public.attribute_options (
  id            uuid primary key default gen_random_uuid(),
  attribute_id  uuid not null references public.product_attributes(id) on delete cascade,
  value         text not null,         -- ej: Alpaca, Cincelada
  sort          int not null default 0
);

create table public.variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  sku         text,
  label       text not null default '',  -- ej: "Alpaca · Cincelada"
  price       numeric(12,2) not null default 0,
  stock       int not null default 0,     -- producto terminado
  active      boolean not null default true,
  image_path  text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.variant_options (
  variant_id  uuid not null references public.variants(id) on delete cascade,
  option_id   uuid not null references public.attribute_options(id) on delete cascade,
  primary key (variant_id, option_id)
);

-- ---------------------------------------------------------------------
-- Partes y procesos
-- ---------------------------------------------------------------------
create table public.parts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  unit        text not null default 'u',
  stock       int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Ruta de fabricación de una parte (corte → pulido ...). Común a todos
-- los productos que usan la parte.
create table public.part_processes (
  id           uuid primary key default gen_random_uuid(),
  part_id      uuid not null references public.parts(id) on delete cascade,
  name         text not null,
  step_order   int not null default 1,
  assignee_id  uuid references public.profiles(id) on delete set null,
  lead_days    int not null default 1,
  notes        text
);

-- Qué partes lleva cada producto. Si condition_option_id no es null,
-- la parte sólo aplica a variantes que tienen esa opción.
create table public.product_parts (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references public.products(id) on delete cascade,
  part_id              uuid not null references public.parts(id) on delete restrict,
  quantity             numeric(10,3) not null default 1,
  condition_option_id  uuid references public.attribute_options(id) on delete cascade
);

-- Procesos sobre el producto (armado, cincelado, grabado...). Pueden
-- trabajar el conjunto (part_id null) o una parte puntual del producto
-- (part_id), y pueden depender de una opción de variante.
create table public.product_processes (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references public.products(id) on delete cascade,
  name                 text not null,
  part_id              uuid references public.parts(id) on delete set null,
  condition_option_id  uuid references public.attribute_options(id) on delete cascade,
  step_order           int not null default 1,
  assignee_id          uuid references public.profiles(id) on delete set null,
  lead_days            int not null default 1,
  notes                text
);

-- ---------------------------------------------------------------------
-- Pedidos y producción
-- ---------------------------------------------------------------------
create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  number          bigint generated always as identity (start with 1001) unique,
  client_id       uuid not null references public.profiles(id),
  status          public.order_status not null default 'recibido',
  requested_date  date,
  due_date        date,
  notes           text,
  admin_notes     text,
  total           numeric(14,2) not null default 0,
  payment_received boolean not null default false,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  updated_at      timestamptz not null default now()
);

create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  variant_id      uuid references public.variants(id) on delete set null,
  product_name    text not null,
  variant_label   text not null default '',
  unit_price      numeric(12,2) not null,
  quantity        int not null check (quantity > 0),
  qty_from_stock  int not null default 0
);

create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  order_item_id  uuid references public.order_items(id) on delete cascade,
  assignee_id    uuid references public.profiles(id) on delete set null,
  kind           text not null check (kind in ('part', 'product')),
  part_id        uuid references public.parts(id) on delete set null,
  process_name   text not null,
  description    text not null,        -- ej: "Pico · Pulido" o "Bombilla Pico de loro (Alpaca) · Armado"
  quantity       int not null,
  done_qty       int not null default 0,
  due_date       date,
  step_order     int not null default 1,
  status         public.task_status not null default 'pendiente',
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create table public.stock_movements (
  id          uuid primary key default gen_random_uuid(),
  part_id     uuid references public.parts(id) on delete cascade,
  variant_id  uuid references public.variants(id) on delete cascade,
  delta       int not null,
  reason      text not null,
  order_id    uuid references public.orders(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  check ((part_id is null) <> (variant_id is null))
);

create index on public.product_images (product_id);
create index on public.product_attributes (product_id);
create index on public.attribute_options (attribute_id);
create index on public.variants (product_id);
create index on public.variant_options (option_id);
create index on public.part_processes (part_id);
create index on public.part_processes (assignee_id);
create index on public.product_parts (product_id);
create index on public.product_parts (part_id);
create index on public.product_parts (condition_option_id);
create index on public.product_processes (product_id);
create index on public.product_processes (part_id);
create index on public.product_processes (assignee_id);
create index on public.product_processes (condition_option_id);
create index on public.orders (client_id);
create index on public.order_items (order_id);
create index on public.order_items (variant_id);
create index on public.tasks (order_id);
create index on public.tasks (order_item_id);
create index on public.tasks (assignee_id, due_date);
create index on public.tasks (part_id);
create index on public.stock_movements (part_id);
create index on public.stock_movements (variant_id);
create index on public.stock_movements (order_id);
create index on public.stock_movements (created_by);
