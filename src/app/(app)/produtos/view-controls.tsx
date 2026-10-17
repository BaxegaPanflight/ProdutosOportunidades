"use client";

import clsx from "clsx";
import { LayoutGrid, List } from "lucide-react";
import { useRouter } from "next/navigation";
import { PAGE_SIZES, PREF_COOKIES, type ProductView } from "./prefs";

function remember(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/** Alterna cards/lista e a quantidade por página; a escolha fica salva no navegador. */
export function ViewControls({
  view,
  perPage,
  params,
}: {
  view: ProductView;
  perPage: number;
  /** filtros atuais da busca (mantidos ao trocar a exibição) */
  params: Record<string, string | undefined>;
}) {
  const router = useRouter();

  function go(patch: Record<string, string>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v && k !== "pagina") p.set(k, v);
    router.push(`/produtos?${p.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-xs text-ink-soft">
        <span className="hidden sm:inline">Por página</span>
        <select
          aria-label="Registros por página"
          value={perPage}
          onChange={(e) => {
            remember(PREF_COOKIES.perPage, e.currentTarget.value);
            go({ por: e.currentTarget.value });
          }}
          className="h-8 rounded-md border border-line bg-panel px-2 text-sm text-ink focus:border-brand-600 focus:outline-none"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div role="radiogroup" aria-label="Exibição" className="inline-flex rounded-md border border-line bg-panel p-0.5">
        {(
          [
            ["cards", "Cards", LayoutGrid],
            ["lista", "Lista", List],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={view === value}
            title={label}
            onClick={() => {
              remember(PREF_COOKIES.view, value);
              go({ visao: value });
            }}
            className={clsx(
              "flex h-7 items-center gap-1.5 rounded px-2 text-xs transition-colors",
              view === value ? "bg-brand-700 text-white" : "text-ink-soft hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
