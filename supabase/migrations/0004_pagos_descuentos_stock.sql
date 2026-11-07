-- =====================================================================
-- La Calandria · pagos parciales, comprobantes, descuentos,
-- producción para stock, edición de pedidos y duplicar productos
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.profiles add column discount_pct numeric(5,2) not null default 0
  check (discount_pct >= 0 and discount_pct <= 90);

alter table public.settings add column notify_clients boolean not null default false;

alter table public.orders add column kind text not null default 'cliente' check (kind in ('cliente', 'stock'));
alter table public.orders add column paid_amount numeric(14,2) not null default 0;

alter table public.order_items add column part_id uuid references public.parts(id) on delete set null;
alter table public.order_items add column list_price numeric(12,2);
alter table public.order_items add column discount_pct numeric(5,2) not null default 0;
create index on public.order_items (part_id);

-- descuentos por cantidad: "desde min_qty unidades del producto, pct % menos"
create table public.product_discounts (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  min_qty     int not null check (min_qty > 1),
  pct         numeric(5,2) not null check (pct > 0 and pct <= 90),
  unique (product_id, min_qty)
);

-- pagos (seña, saldo, etc.). El cliente puede "informar" uno con comprobante;
-- el dueño lo confirma o rechaza, o registra pagos directamente.
create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  amount        numeric(14,2) not null check (amount > 0),
  status        text not null default 'informado' check (status in ('informado', 'confirmado', 'rechazado')),
  method        text not null default 'transferencia',
  note          text check (char_length(note) <= 500),
  receipt_path  text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index on public.payments (order_id);
create index on public.payments (created_by);

-- ---------------------------------------------------------------------
-- Perfil: el descuento tampoco lo puede tocar el propio cliente
-- ---------------------------------------------------------------------
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.approved is distinct from old.approved
       or new.active is distinct from old.active
       or new.email is distinct from old.email
       or new.discount_pct is distinct from old.discount_pct then
      raise exception 'No autorizado';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Pagos: el pedido lleva el total cobrado (sólo pagos confirmados)
-- ---------------------------------------------------------------------
create or replace function public.refresh_order_payment(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_paid numeric;
begin
  select coalesce(sum(amount), 0) into v_paid
    from public.payments where order_id = p_order_id and status = 'confirmado';
  update public.orders
     set paid_amount = v_paid,
         payment_received = (v_paid > 0 and v_paid >= total),
         status = case when status = 'recibido' and v_paid > 0 then 'pago_confirmado'::public.order_status
                       when status = 'pago_confirmado' and v_paid = 0 and confirmed_at is null then 'recibido'::public.order_status
                       else status end,
         updated_at = now()
   where id = p_order_id;
end $$;

create or replace function public.payments_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_order_payment(coalesce(new.order_id, old.order_id));
  return null;
end $$;

create trigger payments_changed after insert or update or delete on public.payments
  for each row execute function public.payments_changed();

-- pagos ya marcados con el sistema anterior → un pago confirmado por el total
insert into public.payments (order_id, amount, status, method, note, created_by, created_at, reviewed_at)
select o.id, o.total, 'confirmado', 'transferencia', 'Registrado antes de los pagos parciales',
       (select id from public.profiles where role = 'admin' order by created_at limit 1), o.updated_at, o.updated_at
  from public.orders o
 where o.payment_received and o.total > 0;

-- ---------------------------------------------------------------------
-- Precio unitario con descuentos (por cantidad del producto y por cliente)
-- ---------------------------------------------------------------------
create or replace function public.calc_unit_price(p_variant uuid, p_product_qty int, p_client uuid,
                                                  out list_price numeric, out discount_pct numeric, out unit_price numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tier numeric;
  v_client numeric;
begin
  if not (public.is_admin() or (p_client = (select auth.uid()) and public.can_buy())) then
    raise exception 'No autorizado';
  end if;
  select v.price into list_price from public.variants v where v.id = p_variant;
  select coalesce(max(d.pct), 0) into v_tier
    from public.product_discounts d join public.variants v on v.product_id = d.product_id
   where v.id = p_variant and d.min_qty <= p_product_qty;
  select coalesce(pf.discount_pct, 0) into v_client from public.profiles pf where pf.id = p_client;
  discount_pct := round(100 * (1 - (1 - v_tier / 100) * (1 - coalesce(v_client, 0) / 100)), 2);
  unit_price := round(list_price * (1 - discount_pct / 100), 2);
end $$;

-- ---------------------------------------------------------------------
-- Pedido nuevo (ahora con descuentos)
-- ---------------------------------------------------------------------
create or replace function public.place_order(
  p_items jsonb, p_requested_date date default null, p_notes text default null, p_client_id uuid default null
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_client uuid := (select auth.uid());
  v_admin  boolean := public.is_admin();
  v_order  public.orders;
  v_bad    text;
  v_n_req  int;
  v_n_ok   int;
  r        record;
  pr       record;
begin
  if v_client is null then raise exception 'Tenés que ingresar para hacer un pedido'; end if;
  if p_client_id is not null and v_admin then
    v_client := p_client_id;
  elsif not public.can_buy() then
    raise exception 'Tu cuenta todavía no fue habilitada';
  end if;
  if char_length(coalesce(p_notes, '')) > 1000 then raise exception 'La nota es demasiado larga'; end if;

  create temp table if not exists _req (variant_id uuid, product_id uuid, product_name text, label text, qty int) on commit drop;
  delete from _req where true;

  select count(*) into v_n_req from jsonb_array_elements(coalesce(p_items, '[]')) x where (x->>'quantity')::int > 0;
  if v_n_req = 0 then raise exception 'El pedido está vacío'; end if;

  insert into _req
  select v.id, p.id, p.name, v.label, sum((x->>'quantity')::int)
    from jsonb_array_elements(p_items) x
    join public.variants v on v.id = (x->>'variant_id')::uuid
    join public.products p on p.id = v.product_id
   where (x->>'quantity')::int > 0 and v.active and (p.published or v_admin)
   group by v.id, p.id, p.name, v.label;
  select count(*) into v_n_ok from _req;
  select count(distinct (x->>'variant_id')) into v_n_req from jsonb_array_elements(p_items) x where (x->>'quantity')::int > 0;
  if v_n_ok < v_n_req then raise exception 'Hay un producto que ya no está disponible'; end if;

  -- cantidad mínima por producto
  select p.name into v_bad
    from _req q join public.products p on p.id = q.product_id
   group by p.id, p.name, p.min_qty having sum(q.qty) < p.min_qty limit 1;
  if v_bad is not null then raise exception 'No se llega a la cantidad mínima de %', v_bad; end if;

  insert into public.orders (client_id, requested_date, notes)
  values (v_client, p_requested_date, nullif(trim(p_notes), ''))
  returning * into v_order;

  for r in select q.*, (select sum(q2.qty) from _req q2 where q2.product_id = q.product_id) as product_qty from _req q loop
    select * into pr from public.calc_unit_price(r.variant_id, r.product_qty::int, v_client);
    insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price, list_price, discount_pct, quantity)
    values (v_order.id, r.variant_id, r.product_name, r.label, pr.unit_price, pr.list_price, pr.discount_pct, r.qty);
  end loop;

  update public.orders set total = (select sum(unit_price * quantity) from public.order_items where order_id = v_order.id)
   where id = v_order.id returning * into v_order;
  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- Pedido de producción para stock: lo terminado suma al stock
-- ---------------------------------------------------------------------
create or replace function public.finalize_stock_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  it record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.kind <> 'stock' or v_order.status = 'entregado' then return; end if;
  -- sólo suma al stock si todas las tareas están hechas (o no hubo nada que fabricar)
  if v_order.confirmed_at is null
     or exists (select 1 from public.tasks where order_id = p_order_id and status <> 'hecha') then
    return;
  end if;
  for it in select * from public.order_items where order_id = p_order_id loop
    if it.part_id is not null then
      update public.parts set stock = stock + it.quantity where id = it.part_id;
      insert into public.stock_movements (part_id, delta, reason, order_id, created_by)
      values (it.part_id, it.quantity, 'Producción #' || v_order.number, p_order_id, (select auth.uid()));
    elsif it.variant_id is not null then
      update public.variants set stock = stock + it.quantity where id = it.variant_id;
      insert into public.stock_movements (variant_id, delta, reason, order_id, created_by)
      values (it.variant_id, it.quantity, 'Producción #' || v_order.number, p_order_id, (select auth.uid()));
    end if;
  end loop;
  update public.orders set status = 'entregado', updated_at = now() where id = p_order_id;
end $$;

-- ---------------------------------------------------------------------
-- Confirmar pedido: ahora también entiende ítems que son partes sueltas
-- y pedidos para stock (que no usan stock de producto terminado)
-- ---------------------------------------------------------------------
create or replace function public.confirm_order(
  p_order_id uuid, p_due_date date, p_use_stock boolean default true
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_order     public.orders;
  v_item      record;
  v_opts      uuid[];
  v_take      int;
  v_make      int;
  v_cur       date;
  v_step      record;
  v_need      record;
  v_tasks     int := 0;
  v_n         int;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido inexistente'; end if;
  if v_order.confirmed_at is not null then raise exception 'El pedido ya fue confirmado'; end if;
  if v_order.status = 'cancelado' then raise exception 'El pedido está cancelado'; end if;
  if p_due_date is null then raise exception 'Falta la fecha de entrega'; end if;

  -- need: lo que piden los productos (puede salir de stock); direct: partes pedidas sueltas (se fabrican)
  create temp table if not exists _part_needs (
    part_id uuid primary key, need int not null default 0, direct int not null default 0, due date not null
  ) on commit drop;
  delete from _part_needs where true;

  -- partes pedidas directamente (pedido para stock de partes)
  insert into _part_needs (part_id, direct, due)
  select part_id, sum(quantity), p_due_date from public.order_items
   where order_id = p_order_id and part_id is not null group by part_id;

  for v_item in
    select oi.*, v.product_id, v.stock as variant_stock, p.name as pname
      from public.order_items oi
      join public.variants v on v.id = oi.variant_id
      join public.products p on p.id = v.product_id
     where oi.order_id = p_order_id
  loop
    -- 1) producto terminado en stock (no aplica a producción para stock)
    v_take := 0;
    if p_use_stock and v_order.kind = 'cliente' and v_item.variant_stock > 0 then
      v_take := least(v_item.variant_stock, v_item.quantity);
      update public.variants set stock = stock - v_take where id = v_item.variant_id;
      insert into public.stock_movements (variant_id, delta, reason, order_id, created_by)
      values (v_item.variant_id, -v_take, 'Pedido #' || v_order.number, p_order_id, (select auth.uid()));
      update public.order_items set qty_from_stock = v_take where id = v_item.id;
    end if;
    v_make := v_item.quantity - v_take;
    continue when v_make <= 0;

    select coalesce(array_agg(option_id), '{}') into v_opts
      from public.variant_options where variant_id = v_item.variant_id;

    -- 2) procesos del producto, hacia atrás desde la entrega
    v_cur := p_due_date;
    for v_step in
      select step_order, max(lead_days) as lead
        from public.product_processes
       where product_id = v_item.product_id
         and (condition_option_id is null or condition_option_id = any(v_opts))
       group by step_order
       order by step_order desc
    loop
      insert into public.tasks (order_id, order_item_id, assignee_id, kind, part_id, process_name,
                                description, quantity, due_date, step_order)
      select p_order_id, v_item.id, pp.assignee_id, 'product', pp.part_id, pp.name,
             v_item.pname
               || case when v_item.variant_label <> '' then ' (' || v_item.variant_label || ')' else '' end
               || case when pa.name is not null then ' · ' || pa.name else '' end,
             ceil(v_make * coalesce((select sum(bom.quantity) from public.product_parts bom
                                     where bom.product_id = v_item.product_id and bom.part_id = pp.part_id
                                       and (bom.condition_option_id is null or bom.condition_option_id = any(v_opts))), 1))::int,
             v_cur, pp.step_order
        from public.product_processes pp
        left join public.parts pa on pa.id = pp.part_id
       where pp.product_id = v_item.product_id
         and pp.step_order = v_step.step_order
         and (pp.condition_option_id is null or pp.condition_option_id = any(v_opts));
      get diagnostics v_n = row_count;
      v_tasks := v_tasks + v_n;
      v_cur := v_cur - v_step.lead;
    end loop;

    -- 3) partes necesarias
    insert into _part_needs (part_id, need, due)
    select bom.part_id, ceil(v_make * sum(bom.quantity))::int, v_cur
      from public.product_parts bom
     where bom.product_id = v_item.product_id
       and (bom.condition_option_id is null or bom.condition_option_id = any(v_opts))
     group by bom.part_id
    on conflict (part_id) do update
      set need = _part_needs.need + excluded.need,
          due  = least(_part_needs.due, excluded.due);
  end loop;

  -- 4) partes: stock y ruta de fabricación
  for v_need in
    select n.*, pa.name as pname, pa.stock
      from _part_needs n join public.parts pa on pa.id = n.part_id
  loop
    v_take := 0;
    if p_use_stock and v_need.need > 0 and v_need.stock > 0 then
      v_take := least(v_need.stock, v_need.need);
      update public.parts set stock = stock - v_take where id = v_need.part_id;
      insert into public.stock_movements (part_id, delta, reason, order_id, created_by)
      values (v_need.part_id, -v_take, 'Pedido #' || v_order.number, p_order_id, (select auth.uid()));
    end if;
    v_make := v_need.need - v_take + v_need.direct;
    continue when v_make <= 0;

    if not exists (select 1 from public.part_processes where part_id = v_need.part_id) then
      insert into public.tasks (order_id, kind, part_id, process_name, description, quantity, due_date)
      values (p_order_id, 'part', v_need.part_id, 'Fabricación', v_need.pname, v_make, v_need.due);
      v_tasks := v_tasks + 1;
      continue;
    end if;

    v_cur := v_need.due;
    for v_step in
      select step_order, max(lead_days) as lead
        from public.part_processes where part_id = v_need.part_id
       group by step_order order by step_order desc
    loop
      insert into public.tasks (order_id, assignee_id, kind, part_id, process_name, description,
                                quantity, due_date, step_order)
      select p_order_id, pp.assignee_id, 'part', pp.part_id, pp.name, v_need.pname,
             v_make, v_cur, pp.step_order
        from public.part_processes pp
       where pp.part_id = v_need.part_id and pp.step_order = v_step.step_order;
      get diagnostics v_n = row_count;
      v_tasks := v_tasks + v_n;
      v_cur := v_cur - v_step.lead;
    end loop;
  end loop;

  update public.orders
     set status = case when v_tasks = 0 then 'listo'::public.order_status else 'en_produccion'::public.order_status end,
         due_date = p_due_date, confirmed_at = now(), updated_at = now()
   where id = p_order_id;
  if v_tasks = 0 and v_order.kind = 'stock' then
    perform public.finalize_stock_order(p_order_id);
  end if;
  return v_tasks;
end $$;

-- ---------------------------------------------------------------------
-- Avance: si termina un pedido para stock, el stock se suma solo
-- ---------------------------------------------------------------------
create or replace function public.report_progress(p_task_id uuid, p_done int) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
  v_kind text;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Tarea inexistente'; end if;
  if v_task.assignee_id is distinct from (select auth.uid()) and not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  select kind into v_kind from public.orders where id = v_task.order_id;
  if v_kind = 'stock' and exists (select 1 from public.orders where id = v_task.order_id and status = 'entregado') then
    raise exception 'Esa producción ya se sumó al stock';
  end if;
  p_done := greatest(0, least(coalesce(p_done, 0), v_task.quantity));
  update public.tasks
     set done_qty = p_done,
         status = case when p_done = 0 then 'pendiente'::public.task_status
                       when p_done >= quantity then 'hecha'::public.task_status
                       else 'en_curso'::public.task_status end,
         completed_at = case when p_done >= quantity then now() else null end
   where id = p_task_id
  returning * into v_task;

  if not exists (select 1 from public.tasks where order_id = v_task.order_id and status <> 'hecha') then
    if v_kind = 'stock' then
      perform public.finalize_stock_order(v_task.order_id);
    else
      update public.orders set status = 'listo', updated_at = now()
       where id = v_task.order_id and status = 'en_produccion';
    end if;
  elsif v_task.status <> 'hecha' then
    update public.orders set status = 'en_produccion', updated_at = now()
     where id = v_task.order_id and status = 'listo';
  end if;
  return v_task;
end $$;

create or replace function public.create_stock_order(p_items jsonb, p_due_date date, p_notes text default null)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  x jsonb;
  v_q int;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  if p_due_date is null then raise exception 'Falta la fecha'; end if;
  insert into public.orders (client_id, kind, requested_date, notes)
  values ((select auth.uid()), 'stock', p_due_date, nullif(trim(p_notes), ''))
  returning * into v_order;
  for x in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    v_q := (x->>'quantity')::int;
    continue when v_q is null or v_q <= 0;
    if x ? 'part_id' and x->>'part_id' is not null then
      insert into public.order_items (order_id, part_id, product_name, variant_label, unit_price, quantity)
      select v_order.id, pa.id, pa.name, 'Parte', 0, v_q from public.parts pa where pa.id = (x->>'part_id')::uuid;
    else
      insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price, quantity)
      select v_order.id, v.id, p.name, v.label, 0, v_q
        from public.variants v join public.products p on p.id = v.product_id where v.id = (x->>'variant_id')::uuid;
    end if;
  end loop;
  if not exists (select 1 from public.order_items where order_id = v_order.id) then
    raise exception 'Cargá al menos una cantidad';
  end if;
  perform public.confirm_order(v_order.id, p_due_date, true);
  select * into v_order from public.orders where id = v_order.id;
  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- Editar un pedido de cliente. Si ya estaba confirmado, se re-planifica:
-- se devuelve el stock usado y se borran sus tareas (hay que volver a confirmar).
-- p_items: [{"variant_id": "...", "quantity": 10, "unit_price": 900 (opcional)}]
-- ---------------------------------------------------------------------
create or replace function public.update_order_items(p_order_id uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_done int := 0;
  v_replanned boolean := false;
  m record;
  r record;
  pr record;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido inexistente'; end if;
  if v_order.kind <> 'cliente' then raise exception 'Sólo se editan pedidos de clientes'; end if;
  if v_order.status in ('cancelado', 'entregado') then raise exception 'Ese pedido ya no se puede editar'; end if;

  create temp table if not exists _edit (variant_id uuid, product_id uuid, product_name text, label text, qty int, price numeric) on commit drop;
  delete from _edit where true;
  insert into _edit
  select v.id, p.id, p.name, v.label, sum((x->>'quantity')::int), max(nullif(x->>'unit_price', '')::numeric)
    from jsonb_array_elements(coalesce(p_items, '[]')) x
    join public.variants v on v.id = (x->>'variant_id')::uuid
    join public.products p on p.id = v.product_id
   where (x->>'quantity')::int > 0
   group by v.id, p.id, p.name, v.label;
  if not exists (select 1 from _edit) then raise exception 'El pedido no puede quedar vacío'; end if;

  -- re-planificar si ya estaba confirmado
  if v_order.confirmed_at is not null then
    select coalesce(sum(done_qty), 0) into v_done from public.tasks where order_id = p_order_id;
    for m in
      select part_id, variant_id, sum(delta) as total
        from public.stock_movements where order_id = p_order_id
       group by part_id, variant_id having sum(delta) <> 0
    loop
      perform public.adjust_stock(m.part_id, m.variant_id, -m.total::int,
                                  'Edición pedido #' || v_order.number, p_order_id);
    end loop;
    delete from public.tasks where order_id = p_order_id;
    update public.orders
       set confirmed_at = null, due_date = null,
           status = case when paid_amount > 0 then 'pago_confirmado'::public.order_status else 'recibido'::public.order_status end
     where id = p_order_id;
    v_replanned := true;
  end if;

  delete from public.order_items where order_id = p_order_id;
  for r in select e.*, (select sum(qty) from _edit e2 where e2.product_id = e.product_id) as product_qty from _edit e loop
    select * into pr from public.calc_unit_price(r.variant_id, r.product_qty::int, v_order.client_id);
    insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price, list_price, discount_pct, quantity)
    values (p_order_id, r.variant_id, r.product_name, r.label,
            coalesce(r.price, pr.unit_price), pr.list_price,
            case when r.price is null then pr.discount_pct
                 when pr.list_price > 0 then round(100 * (1 - r.price / pr.list_price), 2) else 0 end,
            r.qty);
  end loop;

  update public.orders set total = (select sum(unit_price * quantity) from public.order_items where order_id = p_order_id),
                           updated_at = now()
   where id = p_order_id;
  perform public.refresh_order_payment(p_order_id);
  return jsonb_build_object('replanned', v_replanned, 'lost_progress', v_done);
end $$;

-- ---------------------------------------------------------------------
-- Duplicar producto (con atributos, variantes, partes, procesos y descuentos)
-- ---------------------------------------------------------------------
create or replace function public.duplicate_product(p_product_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_src public.products;
  v_new uuid;
  a record; o record; v record;
  v_attr uuid; v_opt uuid; v_var uuid;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  select * into v_src from public.products where id = p_product_id;
  if not found then raise exception 'Producto inexistente'; end if;

  create temp table if not exists _map (old_id uuid primary key, new_id uuid) on commit drop;
  delete from _map where true;

  insert into public.products (name, slug, description, category, published, min_qty, sort)
  values (v_src.name || ' (copia)', v_src.slug || '-copia-' || substr(md5(random()::text), 1, 4),
          v_src.description, v_src.category, false, v_src.min_qty, v_src.sort)
  returning id into v_new;

  for a in select * from public.product_attributes where product_id = p_product_id loop
    insert into public.product_attributes (product_id, name, sort) values (v_new, a.name, a.sort) returning id into v_attr;
    for o in select * from public.attribute_options where attribute_id = a.id loop
      insert into public.attribute_options (attribute_id, value, sort) values (v_attr, o.value, o.sort) returning id into v_opt;
      insert into _map values (o.id, v_opt);
    end loop;
  end loop;

  for v in select * from public.variants where product_id = p_product_id loop
    insert into public.variants (product_id, sku, label, price, stock, active, image_path, sort)
    values (v_new, null, v.label, v.price, 0, v.active, v.image_path, v.sort) returning id into v_var;
    insert into public.variant_options (variant_id, option_id)
    select v_var, m.new_id from public.variant_options vo join _map m on m.old_id = vo.option_id where vo.variant_id = v.id;
  end loop;

  insert into public.product_images (product_id, path, sort)
  select v_new, path, sort from public.product_images where product_id = p_product_id;

  insert into public.product_parts (product_id, part_id, quantity, condition_option_id)
  select v_new, pp.part_id, pp.quantity, m.new_id
    from public.product_parts pp left join _map m on m.old_id = pp.condition_option_id
   where pp.product_id = p_product_id;

  insert into public.product_processes (product_id, name, part_id, condition_option_id, step_order, assignee_id, lead_days, notes)
  select v_new, pp.name, pp.part_id, m.new_id, pp.step_order, pp.assignee_id, pp.lead_days, pp.notes
    from public.product_processes pp left join _map m on m.old_id = pp.condition_option_id
   where pp.product_id = p_product_id;

  insert into public.product_discounts (product_id, min_qty, pct)
  select v_new, min_qty, pct from public.product_discounts where product_id = p_product_id;

  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- RLS de las tablas nuevas
-- ---------------------------------------------------------------------
alter table public.product_discounts enable row level security;
alter table public.payments enable row level security;

create policy product_discounts_select on public.product_discounts for select to authenticated
  using ((select public.can_buy()));
create policy product_discounts_insert on public.product_discounts for insert to authenticated with check ((select public.is_admin()));
create policy product_discounts_update on public.product_discounts for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy product_discounts_delete on public.product_discounts for delete to authenticated using ((select public.is_admin()));

create policy payments_select on public.payments for select to authenticated
  using ((select public.is_admin())
         or exists (select 1 from public.orders o where o.id = order_id and o.client_id = (select auth.uid())));
-- el cliente sólo puede "informar" pagos de sus pedidos; el admin, lo que sea
create policy payments_insert on public.payments for insert to authenticated
  with check ((select public.is_admin())
              or (status = 'informado' and created_by = (select auth.uid())
                  and exists (select 1 from public.orders o where o.id = order_id and o.client_id = (select auth.uid())
                                                         and o.status not in ('cancelado'))));
create policy payments_update on public.payments for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy payments_delete on public.payments for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- Comprobantes (privados): carpeta = id del pedido
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);

create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (
    (select public.is_admin())
    or exists (select 1 from public.orders o
                where o.id::text = (storage.foldername(name))[1] and o.client_id = (select auth.uid()))));
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (
    (select public.is_admin())
    or exists (select 1 from public.orders o
                where o.id::text = (storage.foldername(name))[1] and o.client_id = (select auth.uid()))));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (select public.is_admin()));
