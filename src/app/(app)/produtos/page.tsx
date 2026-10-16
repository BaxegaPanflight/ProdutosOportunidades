import clsx from "clsx";
import { ImageOff, Search } from "lucide-react";
import Link from "next/link";
import { AutoSubmitSelect } from "@/components/forms";
import { Badge, btn, Card, Empty, Input, LinkButton, PageHeader, Table } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtNum } from "@/lib/format";
import { ORIGIN, STATUS, STATUS_ORDER } from "@/lib/labels";
import { signedUrls } from "@/lib/storage";
import type { ProductStatus } from "@/lib/import/types";

export const metadata = { title: "Produtos" };

type SP = Record<string, string | undefined>;

interface Row {
  id: string;
  main_code: string;
  description: string | null;
  manufacturer: string | null;
  status: ProductStatus;
  demand_count: number;
  customer_demand_count: number;
  customer_count: number;
  last_demand_at: string | null;
  market_qty: number | null;
  market_period: string | null;
  sample_qty: number | null;
  pending: string[];
  image_path: string | null;
  total_count: number;
}

const PAGE_SIZE = 50;
const one = <T,>(v: string | undefined, f: (s: string) => T = (s) => s as T): T[] | null => (v ? [f(v)] : null);

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, can } = await requireMember();
  const page = Math.max(1, Number(sp.pagina ?? 1) || 1);

  const [rowsRes, mans, segs, techs, custs, regions, counts] = await Promise.all([
    supabase.rpc("search_products", {
      q: sp.q || null,
      manufacturer_ids: one(sp.fab),
      statuses: one(sp.status),
      segment_ids: one(sp.seg),
      technology_ids: one(sp.tec),
      customer_ids: one(sp.cli),
      origins: one(sp.origem),
      regions: one(sp.regiao),
      date_from: sp.de || null,
      date_to: sp.ate || null,
      only_pending: sp.pend === "1",
      with_sample: sp.amostra === "sim" ? true : sp.amostra === "nao" ? false : null,
      sort: sp.ordem || (sp.q ? "relevancia" : "demandas"),
      page_size: PAGE_SIZE,
      page,
    }),
    supabase.from("manufacturers").select("id, name").order("name"),
    supabase.from("segments").select("id, name").order("sort_order").order("name"),
    supabase.from("technologies").select("id, name").order("sort_order").order("name"),
    supabase.from("customers").select("id, name").order("name"),
    supabase.rpc("distinct_regions"),
    supabase.rpc("product_status_counts"),
  ]);

  const rows = (rowsRes.data ?? []) as Row[];
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const urls = await signedUrls(supabase, rows.map((r) => r.image_path));
  const countBy = new Map<string, number>(
    ((counts.data ?? []) as { status: string; total: number }[]).map((c) => [c.status, Number(c.total)]),
  );
  const allCount = [...countBy.values()].reduce((a, b) => a + b, 0);

  const qs = (patch: SP) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/produtos?${s}` : "/produtos";
  };
  const activeFilters = ["fab", "seg", "tec", "cli", "origem", "regiao", "de", "ate", "pend", "amostra"].filter((k) => sp[k]);

  return (
    <>
      <PageHeader
        title="Produtos"
        subtitle={`${fmtNum(total, 0)} produto(s) encontrados`}
        actions={<LinkButton href="/produtos/novo">Novo produto</LinkButton>}
      />

      {/* Funil: atalhos por status */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={qs({ status: undefined, pagina: undefined })}
          className={clsx(
            "rounded-full border px-3 py-1 text-xs",
            !sp.status ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white text-ink-soft hover:border-ink-faint",
          )}
        >
          Todos · {fmtNum(allCount, 0)}
        </Link>
        {STATUS_ORDER.map((s) => (
          <Link
            key={s}
            href={qs({ status: s, pagina: undefined })}
            className={clsx(
              "rounded-full border px-3 py-1 text-xs",
              sp.status === s ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white text-ink-soft hover:border-ink-faint",
            )}
          >
            {STATUS[s].label} · {fmtNum(countBy.get(s) ?? 0, 0)}
          </Link>
        ))}
      </div>

      <form method="get" action="/produtos" className="mb-4 rounded-lg border border-line bg-white p-4">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-ink-faint" aria-hidden />
            <Input
              name="q"
              defaultValue={sp.q}
              placeholder="Buscar por código, equivalente, descrição, fabricante, aplicação, cliente…"
              className="pl-9"
              autoFocus={!sp.q}
            />
          </div>
          <button className={btn("primary")}>Buscar</button>
        </div>
        <details className="mt-3" open={activeFilters.length > 0}>
          <summary className="cursor-pointer text-sm text-brand-700">
            Filtros{activeFilters.length ? ` (${activeFilters.length} ativos)` : ""}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect name="fab" label="Fabricante" value={sp.fab} options={(mans.data ?? []).map((m) => [m.id, m.name])} />
            <FilterSelect name="seg" label="Segmento" value={sp.seg} options={(segs.data ?? []).map((m) => [m.id, m.name])} />
            <FilterSelect name="tec" label="Tecnologia" value={sp.tec} options={(techs.data ?? []).map((m) => [m.id, m.name])} />
            <FilterSelect name="cli" label="Cliente" value={sp.cli} options={(custs.data ?? []).map((m) => [m.id, m.name])} />
            <FilterSelect
              name="origem"
              label="Origem da demanda"
              value={sp.origem}
              options={Object.entries(ORIGIN).map(([k, v]) => [k, v.label])}
            />
            <FilterSelect
              name="regiao"
              label="Região / UF"
              value={sp.regiao}
              options={((regions.data ?? []) as { region: string }[]).map((r) => [r.region, r.region])}
            />
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">Demanda a partir de</span>
              <Input type="date" name="de" defaultValue={sp.de} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">Demanda até</span>
              <Input type="date" name="ate" defaultValue={sp.ate} />
            </label>
            <FilterSelect
              name="amostra"
              label="Amostra"
              value={sp.amostra}
              options={[
                ["sim", "Com amostra"],
                ["nao", "Sem amostra"],
              ]}
            />
            <FilterSelect
              name="pend"
              label="Cadastro"
              value={sp.pend}
              options={[["1", "Somente com pendências"]]}
              emptyLabel="Todos"
            />
            <FilterSelect
              name="ordem"
              label="Ordenar por"
              value={sp.ordem}
              emptyLabel={sp.q ? "Relevância" : "Mais demandados"}
              options={[
                ["relevancia", "Relevância da busca"],
                ["demandas", "Mais demandados por clientes"],
                ...(can.strategic ? ([["mercado", "Maior volume de mercado"]] as [string, string][]) : []),
                ["recentes", "Alterados recentemente"],
                ["codigo", "Código"],
              ]}
            />
            <div className="flex items-end gap-2">
              <button className={btn("secondary")}>Aplicar</button>
              {activeFilters.length > 0 && (
                <Link href={qs(Object.fromEntries(activeFilters.map((k) => [k, undefined])))} className={btn("ghost")}>
                  Limpar
                </Link>
              )}
            </div>
          </div>
        </details>
      </form>

      <Card bodyClassName="p-0">
        {rowsRes.error ? (
          <p className="p-4 text-sm text-red-700">Erro na busca: {rowsRes.error.message}</p>
        ) : rows.length === 0 ? (
          <Empty>Nenhum produto encontrado.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th className="w-14"></th>
                <th>Código</th>
                <th>Descrição</th>
                <th>Fabricante</th>
                <th>Status</th>
                <th className="text-right" title="Demandas de clientes / total de registros">
                  Demandas
                </th>
                <th className="text-right">Clientes</th>
                <th>Última</th>
                {can.strategic && <th className="text-right">Mercado (qtd)</th>}
                <th className="text-right">Amostra</th>
                <th>Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface/60">
                  <td>
                    {r.image_path && urls.get(r.image_path) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urls.get(r.image_path)} alt="" className="size-10 rounded border border-line object-contain" />
                    ) : (
                      <div className="flex size-10 items-center justify-center rounded border border-dashed border-line text-ink-faint">
                        <ImageOff className="size-4" aria-hidden />
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/produtos/${r.id}`} className="font-semibold text-brand-700 hover:underline">
                      {r.main_code}
                    </Link>
                  </td>
                  <td className="max-w-md">
                    <Link href={`/produtos/${r.id}`} className="line-clamp-2 hover:underline">
                      {r.description ?? <span className="text-ink-faint">sem descrição</span>}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{r.manufacturer ?? "—"}</td>
                  <td>
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    <span className="font-semibold">{r.customer_demand_count}</span>
                    <span className="text-ink-faint"> / {r.demand_count}</span>
                  </td>
                  <td className="text-right tabular-nums">{r.customer_count || "—"}</td>
                  <td className="whitespace-nowrap">{fmtDate(r.last_demand_at)}</td>
                  {can.strategic && (
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {fmtNum(r.market_qty, 0)}
                      {r.market_period && <span className="ml-1 text-xs text-ink-faint">({r.market_period})</span>}
                    </td>
                  )}
                  <td className="text-right tabular-nums">{r.sample_qty ?? "—"}</td>
                  <td>
                    {r.pending.length > 0 ? (
                      <span title={`Falta: ${r.pending.join(", ")}`}>
                        <Badge tone="amber">{r.pending.length} pendente{r.pending.length > 1 ? "s" : ""}</Badge>
                      </span>
                    ) : (
                      <Badge tone="green">completo</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-soft">
            Página {page} de {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link className={btn("secondary", "sm")} href={qs({ pagina: String(page - 1) })}>
                Anterior
              </Link>
            )}
            {page < pages && (
              <Link className={btn("secondary", "sm")} href={qs({ pagina: String(page + 1) })}>
                Próxima
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
  emptyLabel = "Todos",
}: {
  name: string;
  label: string;
  value?: string;
  options: [string, string][];
  emptyLabel?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      <AutoSubmitSelect
        name={name}
        defaultValue={value ?? ""}
        className="h-9 w-full rounded-md border border-line bg-white px-3 text-sm focus:border-brand-600 focus:outline-none"
      >
        <option value="">{emptyLabel}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </AutoSubmitSelect>
    </label>
  );
}
