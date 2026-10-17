export type ProductView = "cards" | "lista";

export const PAGE_SIZES = [12, 24, 48, 96] as const;
export const DEFAULT_PAGE_SIZE = 24;

export const PREF_COOKIES = { view: "produtos_visao", perPage: "produtos_por" } as const;

export function parseView(...values: (string | undefined)[]): ProductView {
  const v = values.find((x) => x === "cards" || x === "lista");
  return (v as ProductView | undefined) ?? "cards";
}

export function parsePageSize(...values: (string | undefined)[]): number {
  for (const v of values) {
    const n = Number(v);
    if ((PAGE_SIZES as readonly number[]).includes(n)) return n;
  }
  return DEFAULT_PAGE_SIZE;
}
