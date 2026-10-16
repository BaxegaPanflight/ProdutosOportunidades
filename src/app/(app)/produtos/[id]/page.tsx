import clsx from "clsx";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms";
import { Badge, Card, PageHeader, Select } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { STATUS, STATUS_ORDER } from "@/lib/labels";
import { signedUrls } from "@/lib/storage";
import type { ProductStatus } from "@/lib/import/types";
import { deleteProduct, setStatus } from "../actions";
import {
  CodesSection,
  DemandsSection,
  EvaluationsSection,
  HistorySection,
  MarketSection,
  OverviewSection,
  PricesSection,
  SamplesSection,
  type Ctx,
} from "./sections";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireMember();
  const { data } = await supabase.from("products").select("main_code").eq("id", id).maybeSingle();
  return { title: data?.main_code ?? "Produto" };
}

const TABS = [
  { key: "resumo", label: "Resumo e dados" },
  { key: "codigos", label: "Códigos" },
  { key: "demandas", label: "Demandas" },
  { key: "amostras", label: "Amostras" },
  { key: "mercado", label: "Mercado", strategic: true },
  { key: "precos", label: "Preços", strategic: true },
  { key: "pareceres", label: "Pareceres", strategic: true },
  { key: "historico", label: "Histórico", strategic: true },
] as const;

export default async function ProdutoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba = "resumo" } = await searchParams;
  const { supabase, can, profile } = await requireMember();

  const { data: product } = await supabase
    .from("products")
    .select("*, manufacturers(name), pending_fields")
    .eq("id", id)
    .maybeSingle();
  if (!product) notFound();

  const [codes, segLinks, techLinks, images, demands, samples, market, prices, evals, mans, segs, techs, custs] =
    await Promise.all([
      supabase.from("product_codes").select("*").eq("product_id", id).order("type").order("code"),
      supabase.from("product_segments").select("segment_id").eq("product_id", id),
      supabase.from("product_technologies").select("technology_id").eq("product_id", id),
      supabase.from("product_images").select("*").eq("product_id", id).order("created_at"),
      supabase
        .from("demands")
        .select("*, customers(name, region, state)")
        .eq("product_id", id)
        .order("requested_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase.from("samples").select("*").eq("product_id", id).order("created_at", { ascending: false }),
      can.strategic
        ? supabase.from("market_data").select("*").eq("product_id", id).order("period_end", { ascending: false })
        : Promise.resolve({ data: [] }),
      can.strategic
        ? supabase
            .from("price_references")
            .select("*, customers(name)")
            .eq("product_id", id)
            .order("reference_date", { ascending: false, nullsFirst: false })
        : Promise.resolve({ data: [] }),
      can.strategic
        ? supabase.from("evaluations").select("*").eq("product_id", id).order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase.from("manufacturers").select("id, name").order("name"),
      supabase.from("segments").select("id, name").order("sort_order").order("name"),
      supabase.from("technologies").select("id, name, category").order("sort_order").order("name"),
      supabase.from("customers").select("id, name").order("name"),
    ]);

  const imageUrls = await signedUrls(supabase, (images.data ?? []).map((i) => i.storage_path as string));

  const ctx: Ctx = {
    product: {
      ...product,
      manufacturer: (product.manufacturers as { name: string } | null)?.name ?? null,
    },
    can,
    profileName: profile.full_name,
    codes: codes.data ?? [],
    segmentIds: (segLinks.data ?? []).map((r) => r.segment_id as string),
    technologyIds: (techLinks.data ?? []).map((r) => r.technology_id as string),
    images: (images.data ?? []).map((i) => ({ ...i, url: imageUrls.get(i.storage_path as string) ?? null })),
    demands: demands.data ?? [],
    samples: samples.data ?? [],
    market: market.data ?? [],
    prices: prices.data ?? [],
    evaluations: evals.data ?? [],
    lookups: {
      manufacturers: mans.data ?? [],
      segments: segs.data ?? [],
      technologies: techs.data ?? [],
      customers: custs.data ?? [],
    },
  };

  const status = product.status as ProductStatus;
  const pending = (product.pending_fields ?? []) as string[];
  const tabs = TABS.filter((t) => !("strategic" in t) || can.strategic);
  const counts: Record<string, number> = {
    codigos: ctx.codes.length,
    demandas: ctx.demands.length,
    amostras: ctx.samples.length,
    mercado: ctx.market.length,
    precos: ctx.prices.length,
    pareceres: ctx.evaluations.length,
  };

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/produtos" className="text-brand-700 hover:underline">
          ← Produtos
        </Link>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{product.main_code}</span>
            <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
          </span>
        }
        subtitle={
          <>
            {product.description ?? "Sem descrição"}
            {ctx.product.manufacturer && <> · {ctx.product.manufacturer}</>}
            <span className="ml-2 text-xs text-ink-faint">atualizado em {fmtDate(product.updated_at, true)}</span>
          </>
        }
        actions={
          <>
            <ActionForm action={setStatus} resetOnSuccess={false} className="flex items-center gap-2">
              <input type="hidden" name="id" value={id} />
              <Select name="status" defaultValue={status} className="w-48" aria-label="Status no funil">
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s].label}
                  </option>
                ))}
              </Select>
              <SubmitButton variant="secondary">Mudar status</SubmitButton>
            </ActionForm>
            {can.delete && (
              <DeleteButton
                action={deleteProduct}
                fields={{ id }}
                label="Excluir produto"
                confirmText="Excluir este produto e TODO o histórico ligado a ele? Esta ação não pode ser desfeita."
              />
            )}
          </>
        }
      />

      {pending.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">Cadastro incompleto:</span>
          {pending.map((p) => (
            <Badge key={p} tone="amber">
              {p}
            </Badge>
          ))}
        </div>
      )}

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/produtos/${id}?aba=${t.key}`}
            className={clsx(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm",
              aba === t.key ? "border-brand-700 font-medium text-brand-800" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
            {counts[t.key] ? <span className="ml-1 text-xs text-ink-faint">{counts[t.key]}</span> : null}
          </Link>
        ))}
      </nav>

      {aba === "resumo" && <OverviewSection ctx={ctx} />}
      {aba === "codigos" && <CodesSection ctx={ctx} />}
      {aba === "demandas" && <DemandsSection ctx={ctx} />}
      {aba === "amostras" && <SamplesSection ctx={ctx} />}
      {aba === "mercado" && can.strategic && <MarketSection ctx={ctx} />}
      {aba === "precos" && can.strategic && <PricesSection ctx={ctx} />}
      {aba === "pareceres" && can.strategic && <EvaluationsSection ctx={ctx} />}
      {aba === "historico" && can.strategic && <HistorySection productId={id} />}
      {!tabs.some((t) => t.key === aba) && (
        <Card>
          <p className="text-sm text-ink-soft">Aba não disponível para o seu perfil.</p>
        </Card>
      )}
    </>
  );
}
