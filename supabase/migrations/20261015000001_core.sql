-- =============================================================================
-- PANFLIGHT · Gestão de Oportunidades de Desenvolvimento
-- Migration 1: estrutura principal (tabelas, enums, funções utilitárias)
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
grant usage on schema extensions to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('diretoria', 'supervisao', 'operacao');

-- Funil de avaliação
create type public.product_status as enum (
  'cadastrado', 'em_pesquisa', 'em_analise', 'aprovado',
  'rejeitado', 'em_desenvolvimento', 'concluido'
);

create type public.code_type as enum (
  'principal',    -- código usado como referência do produto
  'oem',          -- código do fabricante original
  'equivalente',  -- outro código para a mesma peça
  'substituto',   -- código que substitui / é substituído
  'similar',      -- peça parecida, não idêntica
  'cliente',      -- código usado por um cliente específico
  'interno'       -- código interno Panflight
);

-- Separação exigida: demanda real x pesquisa interna x mercado
create type public.demand_origin as enum ('cliente', 'pesquisa_interna', 'mercado');

create type public.demand_kind as enum (
  'solicitacao', 'cotacao', 'amostra', 'pesquisa', 'mencao'
);

create type public.sample_status as enum (
  'recebida', 'em_estoque', 'em_analise', 'devolvida', 'descartada'
);

create type public.price_kind as enum (
  'dealer', 'cotacao', 'compra_cliente', 'site', 'importacao', 'outro'
);

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------

-- Normaliza códigos: "241-8368" -> "2418368", " ah 221249 " -> "AH221249"
create or replace function public.norm_code(t text)
returns text language sql immutable parallel safe
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(t, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- Normaliza texto para busca: minúsculas e sem acento
create or replace function public.norm_text(t text)
returns text language sql stable parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent(coalesce(t, '')))
$$;

create or replace function public.tg_set_updated()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Usuários e perfis
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        public.app_role not null default 'operacao',
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
comment on table public.profiles is
  'Perfil de cada usuário. Novos usuários entram inativos até a Diretoria aprovar; o primeiro usuário vira Diretoria.';

-- -----------------------------------------------------------------------------
-- Cadastros auxiliares
-- -----------------------------------------------------------------------------
create table public.manufacturers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  notes       text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create unique index manufacturers_name_key on public.manufacturers (lower(btrim(name)));

create table public.segments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create unique index segments_name_key on public.segments (lower(btrim(name)));

create table public.technologies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null default 'sensor' check (category in ('sensor', 'processo')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create unique index technologies_name_key on public.technologies (lower(btrim(name)));

create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  region      text,           -- ex.: Centro-Oeste, Sul, Exterior
  state       text,           -- UF
  city        text,
  country     text default 'Brasil',
  segment_id  uuid references public.segments (id) on delete set null,
  importance  smallint check (importance between 1 and 5),
  notes       text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create unique index customers_name_key on public.customers (lower(btrim(name)));

create table public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  file_name   text not null,
  stats       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

-- -----------------------------------------------------------------------------
-- Produto (registro único) e códigos
-- -----------------------------------------------------------------------------
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  main_code        text not null,
  description      text,
  manufacturer_id  uuid references public.manufacturers (id) on delete set null,
  application      text,   -- aplicação / função
  equipment        text,   -- equipamentos e modelos onde é usado
  status           public.product_status not null default 'cadastrado',
  notes            text,
  search_doc       text not null default '',   -- mantido por trigger; não editar
  import_batch_id  uuid references public.import_batches (id) on delete set null,
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
create index products_search_doc_trgm on public.products using gin (search_doc extensions.gin_trgm_ops);
create index products_manufacturer_idx on public.products (manufacturer_id);
create index products_status_idx on public.products (status);

create table public.product_codes (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  code        text not null,
  code_norm   text generated always as (public.norm_code(code)) stored,
  type        public.code_type not null default 'equivalente',
  source      text,
  notes       text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  constraint product_codes_code_not_empty check (public.norm_code(code) <> '')
);
-- Um código pertence a um único produto: é a base da deduplicação.
create unique index product_codes_code_norm_key on public.product_codes (code_norm);
create index product_codes_product_idx on public.product_codes (product_id);
create index product_codes_code_norm_trgm on public.product_codes using gin (code_norm extensions.gin_trgm_ops);

create table public.product_segments (
  product_id  uuid not null references public.products (id) on delete cascade,
  segment_id  uuid not null references public.segments (id) on delete cascade,
  primary key (product_id, segment_id)
);

create table public.product_technologies (
  product_id     uuid not null references public.products (id) on delete cascade,
  technology_id  uuid not null references public.technologies (id) on delete cascade,
  primary key (product_id, technology_id)
);

create table public.product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  storage_path  text not null unique,
  sha256        text,
  caption       text,
  source        text,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  unique (product_id, sha256)
);

-- -----------------------------------------------------------------------------
-- Eventos ligados ao produto
-- -----------------------------------------------------------------------------

-- Cada solicitação / cotação / menção que aponta interesse no produto
create table public.demands (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid not null references public.products (id) on delete cascade,
  origin                 public.demand_origin not null,
  kind                   public.demand_kind not null default 'solicitacao',
  customer_id            uuid references public.customers (id) on delete set null,
  requested_at           date,
  quantity               numeric,
  quantity_period        text,   -- ex.: 'pedido', 'ano'
  region                 text,
  source                 text,   -- planilha, visita, e-mail, site…
  description_at_source  text,   -- como o produto foi descrito na origem
  notes                  text,
  raw                    jsonb,  -- linha original importada (rastreabilidade)
  source_hash            text unique,
  import_batch_id        uuid references public.import_batches (id) on delete set null,
  created_at             timestamptz not null default now(),
  created_by             uuid default auth.uid(),
  updated_at             timestamptz not null default now(),
  updated_by             uuid
);
create index demands_product_idx on public.demands (product_id);
create index demands_customer_idx on public.demands (customer_id);
create index demands_requested_idx on public.demands (requested_at);

-- Dados gerais de mercado (Receita Federal / Siscori, TendData…) — RESTRITO
create table public.market_data (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products (id) on delete cascade,
  source              text not null,
  period_start        int not null,
  period_end          int not null,
  country             text,      -- null = total do período
  quantity            numeric,
  avg_unit_value_usd  numeric,
  total_value_usd     numeric,
  first_world_share   numeric,   -- 0..1
  verified            boolean,
  notes               text,
  import_batch_id     uuid references public.import_batches (id) on delete set null,
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  constraint market_data_period_chk check (period_end >= period_start),
  constraint market_data_key unique nulls not distinct (product_id, source, period_start, period_end, country)
);
create index market_data_product_idx on public.market_data (product_id);

-- Preços de referência (dealer, cotações, compra do cliente…) — RESTRITO
create table public.price_references (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete cascade,
  kind             public.price_kind not null default 'outro',
  value            numeric,
  currency         text not null default 'BRL',
  source           text,
  reference_date   date,
  url              text,
  customer_id      uuid references public.customers (id) on delete set null,
  raw_text         text,
  notes            text,
  source_hash      text unique,
  import_batch_id  uuid references public.import_batches (id) on delete set null,
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
create index price_references_product_idx on public.price_references (product_id);

-- Amostras físicas
create table public.samples (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references public.products (id) on delete cascade,
  quantity              int,
  location              text,     -- Armário_Prateleira_Caixa
  status                public.sample_status not null default 'em_estoque',
  supplier_customer_id  uuid references public.customers (id) on delete set null,
  supplier_name         text,
  received_by           text,
  received_at           date,
  invoice_number        text,
  must_return           boolean not null default false,
  return_due            date,
  notes                 text,
  source_hash           text unique,
  import_batch_id       uuid references public.import_batches (id) on delete set null,
  created_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);
create index samples_product_idx on public.samples (product_id);

-- Pareceres e notas de avaliação — RESTRITO
create table public.evaluations (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete cascade,
  evaluator        text,             -- nome livre (ex.: Alex, Marcus)
  opinion          text,
  recommendation   text check (recommendation in ('sim', 'nao', 'avaliar', 'em_andamento', 'feito')),
  board_score      numeric,          -- "Análise Board"
  technical_ease   numeric,          -- "Facilidade Técnica"
  source_hash      text unique,
  import_batch_id  uuid references public.import_batches (id) on delete set null,
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
create index evaluations_product_idx on public.evaluations (product_id);

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id              bigint generated always as identity primary key,
  table_name      text not null,
  record_id       uuid,
  product_id      uuid,
  action          text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by      uuid,
  changed_at      timestamptz not null default now(),
  changed_fields  text[],
  old_data        jsonb,
  new_data        jsonb
);
create index audit_log_product_idx on public.audit_log (product_id, changed_at desc);
create index audit_log_table_record_idx on public.audit_log (table_name, record_id);

-- -----------------------------------------------------------------------------
-- Dados de referência iniciais (vindos das colunas da planilha atual)
-- -----------------------------------------------------------------------------
insert into public.segments (name, sort_order) values
  ('Cana', 1), ('Grãos', 2), ('Infra', 3), ('Trator', 4), ('Empilhadeira', 5), ('Florestal', 6);

insert into public.technologies (name, category, sort_order) values
  ('Hall', 'sensor', 1), ('Indutivo', 'sensor', 2), ('Resistivo', 'sensor', 3),
  ('Usinagem', 'processo', 10), ('Usinagem + Injeção', 'processo', 11), ('Injeção', 'processo', 12);
