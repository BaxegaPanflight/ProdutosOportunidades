-- =============================================================================
-- Migration 4: importação de planilhas (transacional e idempotente)
--   - agrupa por código: se qualquer código do grupo já existe, usa o produto existente
--   - só preenche campos vazios de produtos existentes (não sobrescreve)
--   - demandas/preços/amostras/pareceres têm source_hash: reimportar não duplica
-- =============================================================================

create or replace function public.ensure_manufacturer(p_name text)
returns uuid language plpgsql
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    return null;
  end if;
  select id into v_id from public.manufacturers where lower(btrim(name)) = lower(btrim(p_name));
  if v_id is null then
    insert into public.manufacturers (name) values (p_name)
    on conflict ((lower(btrim(name)))) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.manufacturers where lower(btrim(name)) = lower(btrim(p_name));
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.ensure_customer(p_name text)
returns uuid language plpgsql
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    return null;
  end if;
  select id into v_id from public.customers where lower(btrim(name)) = lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'));
  if v_id is null then
    insert into public.customers (name) values (p_name)
    on conflict ((lower(btrim(name)))) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.customers where lower(btrim(name)) = lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'));
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.import_planilha(payload jsonb)
returns jsonb language plpgsql
set search_path = ''
as $$
declare
  v_batch      uuid;
  g            jsonb;
  x            jsonb;
  v_pid        uuid;
  v_mid        uuid;
  v_matched    uuid[];
  v_created    boolean;
  v_rows       int;
  v_results    jsonb := '[]'::jsonb;
  s_products_new int := 0;
  s_products_upd int := 0;
  s_codes      int := 0;
  s_demands    int := 0;
  s_market     int := 0;
  s_prices     int := 0;
  s_samples    int := 0;
  s_evals      int := 0;
  s_conflicts  int := 0;
  v_stats      jsonb;
begin
  if not public.can_see_strategic() then
    raise exception 'Apenas Diretoria ou Supervisão podem importar planilhas';
  end if;

  insert into public.import_batches (file_name)
  values (coalesce(payload ->> 'file_name', 'planilha'))
  returning id into v_batch;

  for g in select * from jsonb_array_elements(coalesce(payload -> 'groups', '[]'::jsonb))
  loop
    -- 1. localizar produto existente por qualquer código do grupo
    select array_agg(pc.product_id order by p.created_at)
      into v_matched
      from (select distinct c.product_id
              from public.product_codes c
             where c.code_norm in (
               select public.norm_code(e ->> 'code') from jsonb_array_elements(g -> 'codes') e)) pc
      join public.products p on p.id = pc.product_id;

    v_mid := public.ensure_manufacturer(g ->> 'manufacturer');

    if v_matched is null then
      insert into public.products (main_code, description, manufacturer_id, application, equipment, status, notes, import_batch_id)
      values (
        g ->> 'main_code',
        nullif(g ->> 'description', ''),
        v_mid,
        nullif(g ->> 'application', ''),
        nullif(g ->> 'equipment', ''),
        coalesce(nullif(g ->> 'status', '')::public.product_status, 'cadastrado'),
        nullif(g ->> 'notes', ''),
        v_batch)
      returning id into v_pid;
      v_created := true;
      s_products_new := s_products_new + 1;
    else
      v_pid := v_matched[1];
      v_created := false;
      update public.products p set
        description     = coalesce(nullif(btrim(p.description), ''), nullif(g ->> 'description', '')),
        manufacturer_id = coalesce(p.manufacturer_id, v_mid),
        application     = coalesce(nullif(btrim(p.application), ''), nullif(g ->> 'application', '')),
        equipment       = coalesce(nullif(btrim(p.equipment), ''), nullif(g ->> 'equipment', '')),
        status          = case when p.status = 'cadastrado'
                               then coalesce(nullif(g ->> 'status', '')::public.product_status, p.status)
                               else p.status end
       where p.id = v_pid;
      s_products_upd := s_products_upd + 1;
      if cardinality(v_matched) > 1 then
        s_conflicts := s_conflicts + 1;
      end if;
    end if;

    -- 2. códigos
    for x in select * from jsonb_array_elements(coalesce(g -> 'codes', '[]'::jsonb))
    loop
      insert into public.product_codes (product_id, code, type, source, notes)
      values (v_pid, btrim(x ->> 'code'),
              coalesce(nullif(x ->> 'type', '')::public.code_type, 'equivalente'),
              nullif(x ->> 'source', ''), nullif(x ->> 'notes', ''))
      on conflict (code_norm) do nothing;
      get diagnostics v_rows = row_count;
      s_codes := s_codes + v_rows;
    end loop;

    -- 3. segmentos e tecnologias (cria se não existir)
    for x in select * from jsonb_array_elements(coalesce(g -> 'segments', '[]'::jsonb))
    loop
      insert into public.segments (name) values (x #>> '{}') on conflict ((lower(btrim(name)))) do nothing;
      insert into public.product_segments (product_id, segment_id)
      select v_pid, s.id from public.segments s where lower(btrim(s.name)) = lower(btrim(x #>> '{}'))
      on conflict do nothing;
    end loop;
    for x in select * from jsonb_array_elements(coalesce(g -> 'technologies', '[]'::jsonb))
    loop
      insert into public.technologies (name) values (x #>> '{}') on conflict ((lower(btrim(name)))) do nothing;
      insert into public.product_technologies (product_id, technology_id)
      select v_pid, t.id from public.technologies t where lower(btrim(t.name)) = lower(btrim(x #>> '{}'))
      on conflict do nothing;
    end loop;

    -- 4. demandas
    for x in select * from jsonb_array_elements(coalesce(g -> 'demands', '[]'::jsonb))
    loop
      insert into public.demands (product_id, origin, kind, customer_id, requested_at, quantity, quantity_period,
                                  region, source, description_at_source, notes, raw, source_hash, import_batch_id)
      values (
        v_pid,
        coalesce(nullif(x ->> 'origin', '')::public.demand_origin, 'pesquisa_interna'),
        coalesce(nullif(x ->> 'kind', '')::public.demand_kind, 'mencao'),
        public.ensure_customer(x ->> 'customer'),
        nullif(x ->> 'requested_at', '')::date,
        nullif(x ->> 'quantity', '')::numeric,
        nullif(x ->> 'quantity_period', ''),
        nullif(x ->> 'region', ''),
        nullif(x ->> 'source', ''),
        nullif(x ->> 'description_at_source', ''),
        nullif(x ->> 'notes', ''),
        x -> 'raw',
        x ->> 'hash',
        v_batch)
      on conflict (source_hash) do nothing;
      get diagnostics v_rows = row_count;
      s_demands := s_demands + v_rows;
    end loop;

    -- 5. dados de mercado (atualiza se o mesmo período/fonte/país já existir)
    for x in select * from jsonb_array_elements(coalesce(g -> 'market', '[]'::jsonb))
    loop
      insert into public.market_data (product_id, source, period_start, period_end, country, quantity,
                                      avg_unit_value_usd, total_value_usd, first_world_share, verified, notes, import_batch_id)
      values (
        v_pid, x ->> 'source', (x ->> 'period_start')::int, (x ->> 'period_end')::int,
        nullif(x ->> 'country', ''),
        nullif(x ->> 'quantity', '')::numeric,
        nullif(x ->> 'avg_unit_value_usd', '')::numeric,
        nullif(x ->> 'total_value_usd', '')::numeric,
        nullif(x ->> 'first_world_share', '')::numeric,
        nullif(x ->> 'verified', '')::boolean,
        nullif(x ->> 'notes', ''),
        v_batch)
      on conflict on constraint market_data_key do update set
        quantity           = coalesce(excluded.quantity, public.market_data.quantity),
        avg_unit_value_usd = coalesce(excluded.avg_unit_value_usd, public.market_data.avg_unit_value_usd),
        total_value_usd    = coalesce(excluded.total_value_usd, public.market_data.total_value_usd),
        first_world_share  = coalesce(excluded.first_world_share, public.market_data.first_world_share),
        verified           = coalesce(excluded.verified, public.market_data.verified),
        notes              = coalesce(excluded.notes, public.market_data.notes);
      s_market := s_market + 1;
    end loop;

    -- 6. preços de referência
    for x in select * from jsonb_array_elements(coalesce(g -> 'prices', '[]'::jsonb))
    loop
      insert into public.price_references (product_id, kind, value, currency, source, reference_date, url,
                                           customer_id, raw_text, notes, source_hash, import_batch_id)
      values (
        v_pid,
        coalesce(nullif(x ->> 'kind', '')::public.price_kind, 'outro'),
        nullif(x ->> 'value', '')::numeric,
        coalesce(nullif(x ->> 'currency', ''), 'BRL'),
        nullif(x ->> 'source', ''),
        nullif(x ->> 'reference_date', '')::date,
        nullif(x ->> 'url', ''),
        public.ensure_customer(x ->> 'customer'),
        nullif(x ->> 'raw_text', ''),
        nullif(x ->> 'notes', ''),
        x ->> 'hash',
        v_batch)
      on conflict (source_hash) do nothing;
      get diagnostics v_rows = row_count;
      s_prices := s_prices + v_rows;
    end loop;

    -- 7. amostras
    for x in select * from jsonb_array_elements(coalesce(g -> 'samples', '[]'::jsonb))
    loop
      insert into public.samples (product_id, quantity, location, status, supplier_customer_id, supplier_name,
                                  notes, source_hash, import_batch_id)
      values (
        v_pid,
        nullif(x ->> 'quantity', '')::int,
        nullif(x ->> 'location', ''),
        'em_estoque',
        public.ensure_customer(x ->> 'supplier_customer'),
        nullif(x ->> 'supplier_name', ''),
        nullif(x ->> 'notes', ''),
        x ->> 'hash',
        v_batch)
      on conflict (source_hash) do nothing;
      get diagnostics v_rows = row_count;
      s_samples := s_samples + v_rows;
    end loop;

    -- 8. pareceres / avaliações
    for x in select * from jsonb_array_elements(coalesce(g -> 'evaluations', '[]'::jsonb))
    loop
      insert into public.evaluations (product_id, evaluator, opinion, recommendation, board_score, technical_ease,
                                      source_hash, import_batch_id)
      values (
        v_pid,
        nullif(x ->> 'evaluator', ''),
        nullif(x ->> 'opinion', ''),
        nullif(x ->> 'recommendation', ''),
        nullif(x ->> 'board_score', '')::numeric,
        nullif(x ->> 'technical_ease', '')::numeric,
        x ->> 'hash',
        v_batch)
      on conflict (source_hash) do nothing;
      get diagnostics v_rows = row_count;
      s_evals := s_evals + v_rows;
    end loop;

    v_results := v_results || jsonb_build_object(
      'key', g ->> 'key',
      'product_id', v_pid,
      'created', v_created,
      'other_matches', coalesce(to_jsonb(v_matched[2:]), '[]'::jsonb));
  end loop;

  v_stats := jsonb_build_object(
    'produtos_novos', s_products_new,
    'produtos_existentes', s_products_upd,
    'codigos', s_codes,
    'demandas', s_demands,
    'mercado', s_market,
    'precos', s_prices,
    'amostras', s_samples,
    'pareceres', s_evals,
    'conflitos', s_conflicts);

  update public.import_batches set stats = v_stats where id = v_batch;

  return jsonb_build_object('batch_id', v_batch, 'stats', v_stats, 'products', v_results);
end $$;

comment on function public.import_planilha(jsonb) is
  'Importa grupos de produtos já normalizados pelo app (tela Importar). Idempotente via source_hash.';
