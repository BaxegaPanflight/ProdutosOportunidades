-- =============================================================================
-- Migration 3: busca global e filtros combinados
-- =============================================================================

create or replace function public.search_products(
  q                 text default null,
  manufacturer_ids  uuid[] default null,
  statuses          public.product_status[] default null,
  segment_ids       uuid[] default null,
  technology_ids    uuid[] default null,
  customer_ids      uuid[] default null,
  origins           public.demand_origin[] default null,
  regions           text[] default null,
  date_from         date default null,
  date_to           date default null,
  only_pending      boolean default false,
  with_sample       boolean default null,
  sort              text default 'relevancia',
  page_size         int default 50,
  page              int default 1
)
returns table (
  id                     uuid,
  main_code              text,
  description            text,
  manufacturer           text,
  status                 public.product_status,
  demand_count           bigint,
  customer_demand_count  bigint,
  customer_count         bigint,
  last_demand_at         date,
  market_qty             numeric,
  market_period          text,
  sample_qty             bigint,
  pending                text[],
  image_path             text,
  updated_at             timestamptz,
  total_count            bigint
)
language sql stable
set search_path = ''
as $$
  with terms as (
    select t as term, public.norm_text(t) as txt, lower(public.norm_code(t)) as code
      from regexp_split_to_table(btrim(coalesce(q, '')), '\s+') t
     where t <> ''
  ),
  base as (
    select p.*
      from public.products p
     where
       -- todas as palavras precisam aparecer (código, equivalentes, descrição, fabricante…)
       not exists (
         select 1 from terms t
          where not (p.search_doc like '%' || t.txt || '%'
                     or (t.code <> '' and p.search_doc like '%' || t.code || '%'))
       )
       and (manufacturer_ids is null or p.manufacturer_id = any (manufacturer_ids))
       and (statuses is null or p.status = any (statuses))
       and (segment_ids is null or exists (
             select 1 from public.product_segments s
              where s.product_id = p.id and s.segment_id = any (segment_ids)))
       and (technology_ids is null or exists (
             select 1 from public.product_technologies pt
              where pt.product_id = p.id and pt.technology_id = any (technology_ids)))
       -- filtros de demanda são aplicados juntos sobre a mesma solicitação
       and ((customer_ids is null and origins is null and regions is null
             and date_from is null and date_to is null)
            or exists (
             select 1
               from public.demands d
               left join public.customers c on c.id = d.customer_id
              where d.product_id = p.id
                and (customer_ids is null or d.customer_id = any (customer_ids))
                and (origins is null or d.origin = any (origins))
                and (regions is null or coalesce(d.region, c.region, c.state) = any (regions))
                and (date_from is null or d.requested_at >= date_from)
                and (date_to is null or d.requested_at <= date_to)))
       and (with_sample is null
            or with_sample = exists (select 1 from public.samples sm
                                      where sm.product_id = p.id
                                        and sm.status not in ('devolvida', 'descartada')))
  ),
  enriched as (
    select
      b.id, b.main_code, b.description,
      m.name as manufacturer,
      b.status,
      d.demand_count, d.customer_demand_count, d.customer_count, d.last_demand_at,
      md.quantity as market_qty,
      case when md.period_start is null then null
           when md.period_start = md.period_end then md.period_start::text
           else md.period_start || '–' || md.period_end end as market_period,
      sm.sample_qty,
      public.pending_fields(b) as pending,
      img.storage_path as image_path,
      b.updated_at,
      -- relevância: código exato > começo do código > semelhança do texto
      case when q is null or btrim(q) = '' then 0
           when exists (select 1 from public.product_codes pc
                         where pc.product_id = b.id and pc.code_norm = public.norm_code(q)) then 3
           when exists (select 1 from public.product_codes pc
                         where pc.product_id = b.id and pc.code_norm like public.norm_code(q) || '%'
                           and public.norm_code(q) <> '') then 2
           else extensions.similarity(b.search_doc, public.norm_text(q)) end as rank
    from base b
    left join public.manufacturers m on m.id = b.manufacturer_id
    left join lateral (
      select count(*) as demand_count,
             count(*) filter (where dd.origin = 'cliente') as customer_demand_count,
             count(distinct dd.customer_id) as customer_count,
             max(dd.requested_at) as last_demand_at
        from public.demands dd where dd.product_id = b.id
    ) d on true
    left join lateral (
      -- RLS: para Operação esta junção volta vazia (dado restrito)
      select mk.quantity, mk.period_start, mk.period_end
        from public.market_data mk
       where mk.product_id = b.id and mk.country is null
       order by mk.period_end desc, (mk.period_end - mk.period_start) asc
       limit 1
    ) md on true
    left join lateral (
      select sum(coalesce(s.quantity, 1)) as sample_qty
        from public.samples s
       where s.product_id = b.id and s.status not in ('devolvida', 'descartada')
    ) sm on true
    left join lateral (
      select i.storage_path from public.product_images i
       where i.product_id = b.id order by i.created_at limit 1
    ) img on true
  ),
  filtered as (
    select e.* from enriched e
     where not only_pending or cardinality(e.pending) > 0
  )
  select
    f.id, f.main_code, f.description, f.manufacturer, f.status,
    f.demand_count, f.customer_demand_count, f.customer_count, f.last_demand_at,
    f.market_qty, f.market_period, f.sample_qty, f.pending, f.image_path, f.updated_at,
    count(*) over () as total_count
  from filtered f
  order by
    case when sort = 'relevancia' then f.rank end desc nulls last,
    case when sort = 'demandas' then f.customer_demand_count end desc nulls last,
    case when sort = 'mercado' then f.market_qty end desc nulls last,
    case when sort = 'recentes' then f.updated_at end desc nulls last,
    case when sort in ('relevancia', 'demandas', 'mercado') then f.customer_demand_count end desc nulls last,
    f.main_code
  limit greatest(1, least(page_size, 500))
  offset (greatest(page, 1) - 1) * greatest(1, least(page_size, 500))
$$;

-- Lista de regiões existentes (para o filtro)
create or replace function public.distinct_regions()
returns table (region text)
language sql stable
set search_path = ''
as $$
  select distinct r from (
    select region as r from public.customers
    union select state from public.customers
    union select region from public.demands
  ) x where r is not null and btrim(r) <> '' order by 1
$$;

-- Contagem por status do funil (para os atalhos da lista)
create or replace function public.product_status_counts()
returns table (status public.product_status, total bigint)
language sql stable
set search_path = ''
as $$
  select p.status, count(*) from public.products p group by p.status
$$;
