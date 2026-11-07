-- =====================================================================
-- Documentos (manuales, ayuda, deuda técnica) en la base, por audiencia
-- y con versiones inmutables. El CONTENIDO no se versiona en el repo:
-- se carga como una versión nueva (insert) y queda el historial.
-- =====================================================================

create table public.docs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  audience    text not null check (audience in ('publico', 'equipo', 'admin')),
  title       text not null check (char_length(title) between 1 and 120),
  version     int  not null default 0,
  content     text not null check (char_length(content) between 1 and 200000),
  note        text check (char_length(note) <= 300),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (slug, version)
);
create index on public.docs (slug, version desc);
create index on public.docs (created_by);

-- numera la versión y fija autor; la audiencia de un documento no cambia
create or replace function public.docs_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prev public.docs;
begin
  select * into v_prev from public.docs where slug = new.slug order by version desc limit 1;
  if found and v_prev.audience <> new.audience then
    raise exception 'La audiencia de "%" es % y no se puede cambiar', new.slug, v_prev.audience;
  end if;
  new.version := coalesce(v_prev.version, 0) + 1;
  new.created_by := coalesce((select auth.uid()), new.created_by);
  new.created_at := now();
  return new;
end $$;

create trigger docs_before_insert before insert on public.docs
  for each row execute function public.docs_before_insert();

alter table public.docs enable row level security;

-- leer: público = cualquiera; equipo = trabajadores y dueño; admin = sólo dueño
create policy docs_select on public.docs for select to anon, authenticated
  using (audience = 'publico'
         or (audience = 'equipo' and (select public.is_staff()))
         or (audience = 'admin' and (select public.is_admin())));

-- publicar una versión nueva: sólo el dueño. Sin update ni delete: el historial no se toca.
create policy docs_insert on public.docs for insert to authenticated
  with check ((select public.is_admin()));

-- función interna del trigger: no se expone por la API
revoke execute on function public.docs_before_insert() from public, anon, authenticated;
