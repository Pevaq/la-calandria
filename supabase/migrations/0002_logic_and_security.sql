-- =====================================================================
-- La Calandria · funciones, triggers y seguridad (RLS)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers de rol
-- ---------------------------------------------------------------------
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('admin', 'worker'), false)
$$;

-- Cliente habilitado (o personal): puede ver precios y pedir
create or replace function public.can_buy() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (approved or role in ('admin','worker')) and active
                   from public.profiles where id = (select auth.uid())), false)
$$;

-- ---------------------------------------------------------------------
-- Alta de usuarios: el primer usuario es el administrador.
-- Los demás entran como clientes sin habilitar. Los trabajadores se
-- crean desde el back office (edge function admin-users).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_first boolean;
begin
  select not exists (select 1 from public.profiles where role = 'admin') into v_first;
  insert into public.profiles (id, email, full_name, company, phone, cuit, city, address, role, approved)
  values (
    new.id, new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'company',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'cuit',
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'address',
    case when v_first then 'admin'::public.user_role else 'client'::public.user_role end,
    v_first
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nadie que no sea admin puede cambiarse rol / habilitación / estado
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.approved is distinct from old.approved
       or new.active is distinct from old.active
       or new.email is distinct from old.email then
      raise exception 'No autorizado';
    end if;
  end if;
  return new;
end $$;

create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

-- ---------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_part_id uuid, p_variant_id uuid, p_delta int, p_reason text, p_order_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  if p_delta = 0 then return; end if;
  if p_part_id is not null then
    update public.parts set stock = stock + p_delta where id = p_part_id;
  else
    update public.variants set stock = stock + p_delta where id = p_variant_id;
  end if;
  insert into public.stock_movements (part_id, variant_id, delta, reason, order_id, created_by)
  values (p_part_id, p_variant_id, p_delta, coalesce(p_reason, 'Ajuste manual'), p_order_id, (select auth.uid()));
end $$;

-- ---------------------------------------------------------------------
-- Pedido nuevo (cliente habilitado, o admin a nombre de un cliente)
-- p_items: [{"variant_id": "...", "quantity": 300}, ...]
-- ---------------------------------------------------------------------
create or replace function public.place_order(
  p_items jsonb, p_requested_date date default null, p_notes text default null, p_client_id uuid default null
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_client uuid := (select auth.uid());
  v_admin  boolean := public.is_admin();
  v_order  public.orders;
  v_item   jsonb;
  v_var    record;
  v_qty    int;
  v_total  numeric := 0;
  v_bad    text;
begin
  if v_client is null then raise exception 'Tenés que ingresar para hacer un pedido'; end if;
  if p_client_id is not null and v_admin then
    v_client := p_client_id;
  elsif not public.can_buy() then
    raise exception 'Tu cuenta todavía no fue habilitada';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido está vacío';
  end if;

  insert into public.orders (client_id, requested_date, notes)
  values (v_client, p_requested_date, nullif(trim(p_notes), ''))
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select v.id, v.label, v.price, p.name as product_name
      into v_var
      from public.variants v join public.products p on p.id = v.product_id
     where v.id = (v_item->>'variant_id')::uuid
       and v.active and (p.published or v_admin);
    if not found then raise exception 'Hay un producto que ya no está disponible'; end if;
    insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price, quantity)
    values (v_order.id, v_var.id, v_var.product_name, v_var.label, v_var.price, v_qty);
    v_total := v_total + v_var.price * v_qty;
  end loop;

  if not exists (select 1 from public.order_items where order_id = v_order.id) then
    raise exception 'El pedido está vacío';
  end if;

  -- cantidad mínima por producto
  select p.name into v_bad
    from public.order_items oi
    join public.variants v on v.id = oi.variant_id
    join public.products p on p.id = v.product_id
   where oi.order_id = v_order.id
   group by p.id, p.name, p.min_qty
  having sum(oi.quantity) < p.min_qty
   limit 1;
  if v_bad is not null then
    raise exception 'No se llega a la cantidad mínima de %', v_bad;
  end if;

  update public.orders set total = v_total where id = v_order.id returning * into v_order;
  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- Confirmar pedido: descuenta stock y genera las tareas de producción
-- con fechas calculadas hacia atrás desde la fecha de entrega.
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
  v_parts_due date;
  v_need      record;
  v_tasks     int := 0;
  v_mult      numeric;
  v_n         int;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido inexistente'; end if;
  if v_order.confirmed_at is not null then raise exception 'El pedido ya fue confirmado'; end if;
  if v_order.status = 'cancelado' then raise exception 'El pedido está cancelado'; end if;
  if p_due_date is null then raise exception 'Falta la fecha de entrega'; end if;

  create temp table if not exists _part_needs (
    part_id uuid primary key, need int not null, due date not null
  ) on commit drop;
  delete from _part_needs where true;

  for v_item in
    select oi.*, v.product_id, v.stock as variant_stock, p.name as pname
      from public.order_items oi
      join public.variants v on v.id = oi.variant_id
      join public.products p on p.id = v.product_id
     where oi.order_id = p_order_id
  loop
    -- 1) producto terminado en stock
    v_take := 0;
    if p_use_stock and v_item.variant_stock > 0 then
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

    -- 3) partes necesarias (tienen que estar antes del primer proceso del producto)
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

  -- 4) partes: stock y ruta de fabricación de cada parte
  for v_need in
    select n.*, pa.name as pname, pa.stock
      from _part_needs n join public.parts pa on pa.id = n.part_id
  loop
    v_take := 0;
    if p_use_stock and v_need.stock > 0 then
      v_take := least(v_need.stock, v_need.need);
      update public.parts set stock = stock - v_take where id = v_need.part_id;
      insert into public.stock_movements (part_id, delta, reason, order_id, created_by)
      values (v_need.part_id, -v_take, 'Pedido #' || v_order.number, p_order_id, (select auth.uid()));
    end if;
    v_make := v_need.need - v_take;
    continue when v_make <= 0;

    if not exists (select 1 from public.part_processes where part_id = v_need.part_id) then
      -- parte sin ruta definida: tarea sin asignar para que el dueño la vea
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
  return v_tasks;
end $$;

-- ---------------------------------------------------------------------
-- Cancelar pedido: devuelve el stock tomado y borra sus tareas
-- ---------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  m record;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido inexistente'; end if;
  if v_order.status = 'cancelado' then return; end if;
  for m in
    select part_id, variant_id, sum(delta) as total
      from public.stock_movements where order_id = p_order_id
     group by part_id, variant_id having sum(delta) <> 0
  loop
    perform public.adjust_stock(m.part_id, m.variant_id, -m.total::int,
                                'Cancelación pedido #' || v_order.number, p_order_id);
  end loop;
  delete from public.tasks where order_id = p_order_id;
  update public.order_items set qty_from_stock = 0 where order_id = p_order_id;
  update public.orders set status = 'cancelado', updated_at = now() where id = p_order_id;
end $$;

-- ---------------------------------------------------------------------
-- Avance de una tarea (el trabajador asignado o el admin)
-- Si todas las tareas del pedido quedan hechas, el pedido pasa a "listo".
-- ---------------------------------------------------------------------
create or replace function public.report_progress(p_task_id uuid, p_done int) returns public.tasks
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Tarea inexistente'; end if;
  if v_task.assignee_id is distinct from (select auth.uid()) and not public.is_admin() then
    raise exception 'No autorizado';
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
    update public.orders set status = 'listo', updated_at = now()
     where id = v_task.order_id and status = 'en_produccion';
  elsif v_task.status <> 'hecha' then
    update public.orders set status = 'en_produccion', updated_at = now()
     where id = v_task.order_id and status = 'listo';
  end if;
  return v_task;
end $$;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function public.adjust_stock(uuid, uuid, int, text, uuid) from public, anon;
revoke execute on function public.place_order(jsonb, date, text, uuid) from public, anon;
revoke execute on function public.confirm_order(uuid, date, boolean) from public, anon;
revoke execute on function public.cancel_order(uuid) from public, anon;
revoke execute on function public.report_progress(uuid, int) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile() from public, anon, authenticated;
grant execute on function public.adjust_stock(uuid, uuid, int, text, uuid) to authenticated;
grant execute on function public.place_order(jsonb, date, text, uuid) to authenticated;
grant execute on function public.confirm_order(uuid, date, boolean) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.report_progress(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.settings           enable row level security;
alter table public.products           enable row level security;
alter table public.product_images     enable row level security;
alter table public.product_attributes enable row level security;
alter table public.attribute_options  enable row level security;
alter table public.variants           enable row level security;
alter table public.variant_options    enable row level security;
alter table public.parts              enable row level security;
alter table public.part_processes     enable row level security;
alter table public.product_parts      enable row level security;
alter table public.product_processes  enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.tasks              enable row level security;
alter table public.stock_movements    enable row level security;

-- perfiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- configuración: todos la leen (alias para transferir), el admin la edita
create policy settings_select on public.settings for select to anon, authenticated using (true);
create policy settings_update on public.settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- catálogo público (sin precios)
create policy products_select on public.products for select to anon, authenticated
  using (published or (select public.is_staff()));
create policy product_images_select on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and (p.published or (select public.is_staff()))));
create policy product_attributes_select on public.product_attributes for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and (p.published or (select public.is_staff()))));
create policy attribute_options_select on public.attribute_options for select to anon, authenticated
  using (exists (select 1 from public.product_attributes a join public.products p on p.id = a.product_id
                 where a.id = attribute_id and (p.published or (select public.is_staff()))));

-- variantes (precios y stock): sólo clientes habilitados y personal
create policy variants_select on public.variants for select to authenticated
  using ((select public.is_staff())
         or ((select public.can_buy()) and active
             and exists (select 1 from public.products p where p.id = product_id and p.published)));
create policy variant_options_select on public.variant_options for select to authenticated
  using (exists (select 1 from public.variants v where v.id = variant_id));

-- partes y procesos: personal
create policy parts_select on public.parts for select to authenticated using ((select public.is_staff()));
create policy part_processes_select on public.part_processes for select to authenticated using ((select public.is_staff()));
create policy product_parts_select on public.product_parts for select to authenticated using ((select public.is_staff()));
create policy product_processes_select on public.product_processes for select to authenticated using ((select public.is_staff()));

-- escritura del catálogo, partes y procesos: admin
do $$
declare t text;
begin
  foreach t in array array['products','product_images','product_attributes','attribute_options',
                           'variants','variant_options','parts','part_processes','product_parts',
                           'product_processes']
  loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t || '_delete', t);
  end loop;
end $$;

-- pedidos: el cliente ve los suyos, el personal ve todos, el admin edita
create policy orders_select on public.orders for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_staff()));
create policy orders_update on public.orders for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy orders_delete on public.orders for delete to authenticated
  using ((select public.is_admin()));

create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.client_id = (select auth.uid()) or (select public.is_staff()))));
create policy order_items_write on public.order_items for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- tareas: cada trabajador ve las suyas; el admin todas
create policy tasks_select on public.tasks for select to authenticated
  using (assignee_id = (select auth.uid()) or (select public.is_admin()));
create policy tasks_write on public.tasks for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- movimientos de stock: admin
create policy stock_movements_select on public.stock_movements for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- Storage: fotos de productos (lectura pública, escritura admin)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif']);

create policy product_images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
