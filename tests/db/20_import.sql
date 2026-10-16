\set ON_ERROR_STOP 1
insert into auth.users (id,email) values ('00000000-0000-0000-0000-000000000001','dir@x'),('00000000-0000-0000-0000-000000000002','op@x');
update public.profiles set active=true;
\set payload `cat /tmp/payload.json`
set role authenticated;
-- operador não pode importar
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
  begin perform public.import_planilha('{"groups":[]}'); raise exception 'FALHOU';
  exception when raise_exception then if sqlerrm='FALHOU' then raise; end if; raise notice 'ok: %', sqlerrm; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.import_planilha(:'payload') -> 'stats' as primeira_importacao;
select public.import_planilha(:'payload') -> 'stats' as reimportacao;
select count(*) produtos, count(*) filter (where status<>'cadastrado') fora_cadastrado from public.products;
select origin, count(*) from public.demands group by 1;
select count(*) clientes from public.customers;
select main_code, description, manufacturer, customer_demand_count, customer_count, market_qty, market_period, sample_qty, pending
  from public.search_products(q => 'sensor rpm') limit 5;
select main_code from public.search_products(q => '241-8368');
select main_code from public.search_products(q => 'ACW2230250');
select main_code, customer_demand_count from public.search_products(sort => 'demandas', origins => '{cliente}') limit 5;
select count(*) from public.audit_log;
