-- Supabase bloquea DELETE sin WHERE desde la API (pg_safeupdate)
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
