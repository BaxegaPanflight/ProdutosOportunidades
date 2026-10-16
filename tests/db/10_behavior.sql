\set ON_ERROR_STOP 1
-- usuários: 1º vira diretoria ativo, demais operacao inativo
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-000000000001','dir@x'),('00000000-0000-0000-0000-000000000002','op@x'),('00000000-0000-0000-0000-000000000003','sup@x');
select email, role, active from public.profiles order by email;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false); $$;

-- inativo não vê nada
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
do $$ begin if (select count(*) from public.segments) <> 0 then raise exception 'inativo viu dados'; end if; end $$;
-- operador não consegue se ativar
update public.profiles set active = true, role='diretoria' where id = auth.uid();
reset role; select role, active from public.profiles where email='op@x';

-- diretoria aprova usuários
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
update public.profiles set active = true where email='op@x';
update public.profiles set active = true, role='supervisao' where email='sup@x';
do $$ begin
  begin update public.profiles set role='operacao' where id=auth.uid(); raise exception 'FALHOU';
  exception when others then if sqlerrm = 'FALHOU' then raise; end if; end;
end $$;

-- operador cadastra produto incompleto
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
insert into public.products (main_code, description) values ('AH-221249', 'Sensor de RPM JD');
select main_code, public.pending_fields(p) from public.products p;
select code, code_norm, type from public.product_codes;
-- código duplicado (formato diferente) é bloqueado
do $$ begin
  begin insert into public.products (main_code) values ('ah 221249'); raise exception 'FALHOU';
  exception when unique_violation then raise notice 'ok duplicidade bloqueada: %', sqlerrm; end;
end $$;
insert into public.product_codes (product_id, code, type) select id, 'AXE20081', 'similar' from public.products;
-- busca por equivalente, por texto sem acento e com hífen
select main_code from public.search_products(q => 'axe-20081');
select main_code from public.search_products(q => 'rpm jd');
-- operador não vê/insere mercado
do $$ begin
  begin insert into public.market_data (product_id, source, period_start, period_end, quantity)
        select id, 'Receita', 2021, 2021, 10 from public.products; raise exception 'FALHOU';
  exception when insufficient_privilege then raise notice 'ok operador bloqueado no mercado'; end;
end $$;
-- operador não exclui
delete from public.products; select count(*) as produtos_apos_delete_operador from public.products;

-- supervisão insere mercado; operador não enxerga na busca
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
insert into public.market_data (product_id, source, period_start, period_end, quantity) select id, 'Receita', 2021, 2021, 8462 from public.products;
select main_code, market_qty, pending from public.search_products();
-- não pode apagar código principal
do $$ begin
  begin delete from public.product_codes where type='principal'; raise exception 'FALHOU';
  exception when raise_exception then if sqlerrm='FALHOU' then raise; end if; raise notice 'ok: %', sqlerrm; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select main_code, market_qty from public.search_products();
-- trocar código principal
update public.products set main_code='AXE20081', description='Sensor RPM' ;
select code, type from public.product_codes order by code;
-- auditoria (supervisão lê)
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select table_name, action, changed_fields, (select email from public.profiles where id=changed_by) by_user from public.audit_log where table_name in ('products','product_codes','market_data') order by id;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select count(*) as audit_visivel_operador from public.audit_log;
reset role;
