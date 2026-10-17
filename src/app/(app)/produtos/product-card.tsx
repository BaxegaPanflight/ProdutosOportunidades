import { ImageOff } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { fmtDate, fmtNum } from "@/lib/format";
import type { ProductStatus } from "@/lib/import/types";
import { STATUS } from "@/lib/labels";

export interface ProductRow {
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

export function PendingBadge({ pending }: { pending: string[] }) {
  return pending.length > 0 ? (
    <span title={`Falta: ${pending.join(", ")}`}>
      <Badge tone="amber">
        {pending.length} pendente{pending.length > 1 ? "s" : ""}
      </Badge>
    </span>
  ) : (
    <Badge tone="green">completo</Badge>
  );
}

export function ProductCard({ row: r, image, strategic }: { row: ProductRow; image?: string; strategic: boolean }) {
  return (
    <Link
      href={`/produtos/${r.id}`}
      // celular: foto à esquerda, para caber mais produtos na tela; telas maiores: foto em cima
      className="group flex h-full overflow-hidden rounded-lg border border-line bg-panel transition hover:border-brand-600 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-600 min-[480px]:flex-col"
    >
      <div className="relative flex w-28 shrink-0 items-center justify-center border-r border-line bg-white min-[480px]:aspect-[4/3] min-[480px]:w-auto min-[480px]:border-b min-[480px]:border-r-0">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" loading="lazy" className="size-full object-contain p-2 min-[480px]:p-3" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 bg-surface text-ink-faint">
            <ImageOff className="size-6" aria-hidden />
            <span className="text-xs">sem foto</span>
          </div>
        )}
        {/* fundo sólido: no tema escuro a etiqueta é translúcida e ficaria apagada sobre a foto */}
        <div className="absolute left-2 top-2 hidden rounded bg-panel min-[480px]:block">
          <Badge tone={STATUS[r.status].tone} className="shadow-sm">
            {STATUS[r.status].label}
          </Badge>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex flex-wrap gap-1 min-[480px]:hidden">
          <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
          <PendingBadge pending={r.pending} />
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-sm font-semibold text-brand-700 group-hover:underline">{r.main_code}</span>
          {r.manufacturer && <span className="shrink-0 truncate text-xs text-ink-soft">{r.manufacturer}</span>}
        </div>
        <p className="line-clamp-2 text-sm text-ink">{r.description ?? <span className="text-ink-faint">sem descrição</span>}</p>

        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-2 text-xs">
          <div title="Demandas de clientes / total de registros">
            <dt className="text-ink-faint">Demandas</dt>
            <dd className="tabular-nums">
              <span className="font-semibold text-ink">{r.customer_demand_count}</span>
              <span className="text-ink-faint"> / {r.demand_count}</span>
            </dd>
          </div>
          <div>
            <dt className="text-ink-faint">Clientes</dt>
            <dd className="font-semibold tabular-nums text-ink">{r.customer_count || "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Última</dt>
            <dd className="text-ink">{fmtDate(r.last_demand_at)}</dd>
          </div>
          {strategic && (
            <div className="col-span-2 hidden min-[480px]:block">
              <dt className="text-ink-faint">Mercado (qtd)</dt>
              <dd className="tabular-nums text-ink">
                {fmtNum(r.market_qty, 0)}
                {r.market_period && <span className="ml-1 text-ink-faint">({r.market_period})</span>}
              </dd>
            </div>
          )}
          <div className="hidden min-[480px]:block">
            <dt className="text-ink-faint">Amostra</dt>
            <dd className="tabular-nums text-ink">{r.sample_qty ?? "—"}</dd>
          </div>
        </dl>
        <div className="hidden pt-1 min-[480px]:block">
          <PendingBadge pending={r.pending} />
        </div>
      </div>
    </Link>
  );
}
