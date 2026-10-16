-- =============================================================================
-- Migration 2: regras automáticas, perfis de acesso (RLS) e auditoria
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Papéis do usuário atual
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function public.has_role(variadic roles public.app_role[])
returns boolean language sql stable security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = any (roles), false)
$$;

-- Usuário ativo com qualquer perfil
create or replace function public.is_member()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select public.current_app_role() is not null
$$;

-- Atalho: pode ver dados financeiros/estratégicos
create or replace function public.can_see_strategic()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select public.has_role('diretoria', 'supervisao')
$$;

-- -----------------------------------------------------------------------------
-- Controle de updated_at / updated_by (ignora mudanças só no índice de busca)
-- -----------------------------------------------------------------------------
create or replace function public.tg_set_updated()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'search_doc' - 'updated_at' - 'updated_by')
     = (to_jsonb(old) - 'search_doc' - 'updated_at' - 'updated_by') then
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
  else
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','manufacturers','customers','products','demands',
                           'market_data','price_references','samples','evaluations']
  loop
    execute format(
      'create trigger set_updated before update on public.%I for each row execute function public.tg_set_updated()', t);
  end loop;
end $$;

-- Remove espaços extras de nomes
create or replace function public.tg_trim_name()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  if new.name = '' then
    raise exception 'O nome não pode ficar vazio';
  end if;
  return new;
end $$;

create trigger trim_name before insert or update of name on public.manufacturers
  for each row execute function public.tg_trim_name();
create trigger trim_name before insert or update of name on public.customers
  for each row execute function public.tg_trim_name();
create trigger trim_name before insert or update of name on public.segments
  for each row execute function public.tg_trim_name();
create trigger trim_name before insert or update of name on public.technologies
  for each row execute function public.tg_trim_name();

-- -----------------------------------------------------------------------------
-- Índice de busca do produto (código, equivalentes, descrição, fabricante…)
-- -----------------------------------------------------------------------------
create or replace function public.product_search_text(p public.products)
returns text language sql stable
set search_path = ''
as $$
  select public.norm_text(concat_ws(' ',
    p.main_code, public.norm_code(p.main_code),
    p.description, p.application, p.equipment, p.notes,
    (select m.name from public.manufacturers m where m.id = p.manufacturer_id),
    (select string_agg(c.code || ' ' || c.code_norm, ' ')
       from public.product_codes c where c.product_id = p.id),
    -- como o produto foi descrito em cada demanda e quem pediu
    (select string_agg(distinct concat_ws(' ', d.description_at_source, cu.name), ' ')
       from public.demands d
       left join public.customers cu on cu.id = d.customer_id
      where d.product_id = p.id)
  ))
$$;

create or replace function public.tg_products_search()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.main_code := btrim(new.main_code);
  if public.norm_code(new.main_code) = '' then
    raise exception 'Informe o código do produto';
  end if;
  new.search_doc := public.product_search_text(new);
  return new;
end $$;

create trigger products_search before insert or update on public.products
  for each row execute function public.tg_products_search();

-- Garante que o código principal exista em product_codes e não pertença a outro produto
create or replace function public.tg_products_main_code()
returns trigger language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid;
  owner_code text;
begin
  select c.product_id into owner_id
    from public.product_codes c
   where c.code_norm = public.norm_code(new.main_code);

  if owner_id is not null and owner_id <> new.id then
    select p.main_code into owner_code from public.products p where p.id = owner_id;
    raise exception 'O código % já está cadastrado no produto %', new.main_code, owner_code
      using errcode = '23505', hint = owner_id::text;
  end if;

  if tg_op = 'UPDATE' then
    update public.product_codes
       set type = 'equivalente'
     where product_id = new.id and type = 'principal'
       and code_norm <> public.norm_code(new.main_code);
  end if;

  if owner_id is null then
    insert into public.product_codes (product_id, code, type, source)
    values (new.id, new.main_code, 'principal', 'cadastro');
  else
    update public.product_codes set type = 'principal'
     where code_norm = public.norm_code(new.main_code) and type <> 'principal';
  end if;
  return null;
end $$;

create trigger products_main_code after insert or update of main_code on public.products
  for each row execute function public.tg_products_main_code();

-- Códigos/demandas alterados -> recalcula o índice de busca do produto
create or replace function public.tg_codes_refresh_product()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.products p set search_doc = public.product_search_text(p) where p.id = new.product_id;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    update public.products p set search_doc = public.product_search_text(p) where p.id = old.product_id;
  end if;
  return null;
end $$;

create trigger codes_refresh_product after insert or update or delete on public.product_codes
  for each row execute function public.tg_codes_refresh_product();

-- Demandas também alimentam a busca (descrição na origem e nome do cliente)
create trigger demands_refresh_product after insert or delete or update of description_at_source, customer_id, product_id
  on public.demands
  for each row execute function public.tg_codes_refresh_product();

create or replace function public.tg_customer_refresh_products()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  update public.products p set search_doc = public.product_search_text(p)
   where p.id in (select d.product_id from public.demands d where d.customer_id = new.id);
  return null;
end $$;

create trigger customer_refresh_products after update of name on public.customers
  for each row execute function public.tg_customer_refresh_products();

-- Não permite apagar o código principal
create or replace function public.tg_codes_protect_main()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if old.type = 'principal' and exists (
       select 1 from public.products p
        where p.id = old.product_id and public.norm_code(p.main_code) = old.code_norm) then
    raise exception 'Não é possível remover o código principal. Troque o código principal do produto antes.';
  end if;
  return old;
end $$;

create trigger codes_protect_main before delete on public.product_codes
  for each row when (pg_trigger_depth() = 0)
  execute function public.tg_codes_protect_main();

-- Fabricante renomeado -> recalcula busca dos produtos dele
create or replace function public.tg_manufacturer_refresh_products()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  update public.products p set search_doc = public.product_search_text(p)
   where p.manufacturer_id = new.id;
  return null;
end $$;

create trigger manufacturer_refresh_products after update of name on public.manufacturers
  for each row execute function public.tg_manufacturer_refresh_products();

-- -----------------------------------------------------------------------------
-- Pendências do cadastro (campo calculado, disponível na API como "pending_fields")
-- -----------------------------------------------------------------------------
create or replace function public.pending_fields(p public.products)
returns text[] language sql stable
set search_path = ''
as $$
  select array_remove(array[
    case when coalesce(btrim(p.description), '') = '' then 'descrição' end,
    case when p.manufacturer_id is null then 'fabricante' end,
    case when coalesce(btrim(p.application), '') = '' then 'aplicação' end,
    case when not exists (select 1 from public.product_segments s where s.product_id = p.id) then 'segmento' end,
    case when not exists (select 1 from public.product_technologies t where t.product_id = p.id) then 'tecnologia' end,
    case when not exists (select 1 from public.product_images i where i.product_id = p.id) then 'imagem' end
  ], null)
$$;

-- -----------------------------------------------------------------------------
-- Novos usuários
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when first_user then 'diretoria'::public.app_role else 'operacao'::public.app_role end,
    first_user
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Só a Diretoria muda perfil/ativação; ninguém remove o próprio acesso de Diretoria
create or replace function public.tg_profiles_guard()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new; -- SQL editor / service role
  end if;
  if not public.has_role('diretoria') then
    new.role := old.role;
    new.active := old.active;
    new.email := old.email;
  elsif old.id = auth.uid() and (new.role <> 'diretoria' or not new.active) then
    raise exception 'Você não pode remover seu próprio acesso de Diretoria';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.tg_profiles_guard();

-- -----------------------------------------------------------------------------
-- Auditoria genérica: quem, quando, o quê (valores antes/depois)
-- -----------------------------------------------------------------------------
create or replace function public.tg_audit()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'search_doc' end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'search_doc' end;
  r jsonb := coalesce(n, o);
  fields text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into fields
      from jsonb_object_keys(n) k
     where k not in ('updated_at', 'updated_by')
       and (o -> k) is distinct from (n -> k);
    if fields is null then
      return null;
    end if;
  end if;

  insert into public.audit_log (table_name, record_id, product_id, action, changed_by, changed_fields, old_data, new_data)
  values (
    tg_table_name,
    coalesce(r ->> 'id', r ->> 'product_id')::uuid,
    case when tg_table_name = 'products' then (r ->> 'id')::uuid else (r ->> 'product_id')::uuid end,
    tg_op,
    auth.uid(),
    fields,
    o,
    n
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','manufacturers','customers','products','product_codes',
                           'product_segments','product_technologies','product_images','demands',
                           'market_data','price_references','samples','evaluations']
  loop
    execute format(
      'create trigger audit after insert or update or delete on public.%I for each row execute function public.tg_audit()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.manufacturers        enable row level security;
alter table public.segments             enable row level security;
alter table public.technologies         enable row level security;
alter table public.customers            enable row level security;
alter table public.import_batches       enable row level security;
alter table public.products             enable row level security;
alter table public.product_codes        enable row level security;
alter table public.product_segments     enable row level security;
alter table public.product_technologies enable row level security;
alter table public.product_images       enable row level security;
alter table public.demands              enable row level security;
alter table public.market_data          enable row level security;
alter table public.price_references     enable row level security;
alter table public.samples              enable row level security;
alter table public.evaluations          enable row level security;
alter table public.audit_log            enable row level security;

-- Perfis: todos os membros veem nomes; cada um vê o próprio (mesmo inativo)
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_member() or id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (public.has_role('diretoria') or id = auth.uid())
  with check (public.has_role('diretoria') or id = auth.uid());

-- Dados operacionais: todos os membros leem e cadastram; exclusão só Supervisão/Diretoria
do $$
declare t text;
begin
  foreach t in array array['manufacturers','customers','products','product_codes',
                           'product_images','demands','samples']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_member())', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.is_member())', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.has_role(''diretoria'', ''supervisao''))', t);
  end loop;
end $$;

-- Segmentos/tecnologias do produto: qualquer membro marca e desmarca
do $$
declare t text;
begin
  foreach t in array array['product_segments','product_technologies']
  loop
    execute format('create policy %1$s_all on public.%1$I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
  end loop;
end $$;

-- Listas de referência: todos leem; só Diretoria/Supervisão mantêm
do $$
declare t text;
begin
  foreach t in array array['segments','technologies']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_member())', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated using (public.has_role(''diretoria'', ''supervisao'')) with check (public.has_role(''diretoria'', ''supervisao''))', t);
  end loop;
end $$;

-- Dados financeiros e estratégicos: somente Diretoria e Supervisão
do $$
declare t text;
begin
  foreach t in array array['market_data','price_references','evaluations']
  loop
    execute format('create policy %1$s_all on public.%1$I for all to authenticated using (public.can_see_strategic()) with check (public.can_see_strategic())', t);
  end loop;
end $$;

create policy import_batches_select on public.import_batches for select to authenticated
  using (public.is_member());
create policy import_batches_insert on public.import_batches for insert to authenticated
  with check (public.can_see_strategic());
create policy import_batches_update on public.import_batches for update to authenticated
  using (public.can_see_strategic()) with check (public.can_see_strategic());

create policy audit_log_select on public.audit_log for select to authenticated
  using (public.can_see_strategic());

-- Ninguém escreve no log diretamente (só os triggers)
revoke insert, update, delete on public.audit_log from anon, authenticated;
-- Visitantes não autenticados não acessam nada
revoke all on all tables in schema public from anon;
