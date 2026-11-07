-- Capa extra: las funciones internas no se pueden llamar desde la API.
-- (Cada función igual valida quién la llama.)
-- ---------------------------------------------------------------------
revoke execute on function public.refresh_order_payment(uuid) from public, anon, authenticated;
revoke execute on function public.payments_changed() from public, anon, authenticated;
revoke execute on function public.calc_unit_price(uuid, int, uuid) from public, anon, authenticated;
revoke execute on function public.finalize_stock_order(uuid) from public, anon, authenticated;
revoke execute on function public.create_stock_order(jsonb, date, text) from public, anon;
revoke execute on function public.update_order_items(uuid, jsonb) from public, anon;
revoke execute on function public.duplicate_product(uuid) from public, anon;
grant execute on function public.create_stock_order(jsonb, date, text) to authenticated;
grant execute on function public.update_order_items(uuid, jsonb) to authenticated;
grant execute on function public.duplicate_product(uuid) to authenticated;

