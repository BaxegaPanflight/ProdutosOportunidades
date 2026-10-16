const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function fmtNum(n: number | string | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || n === "") return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return decimals === 0 ? nf0.format(x) : nf.format(x);
}

export function fmtMoney(n: number | string | null | undefined, currency = "BRL"): string {
  if (n === null || n === undefined || n === "") return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(x);
  } catch {
    return `${currency} ${nf.format(x)}`;
  }
}

export function fmtPct(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  return `${nf0.format(Number(n) * 100)}%`;
}

/** Datas "AAAA-MM-DD" (sem fuso) ou timestamps. */
export function fmtDate(d: string | null | undefined, withTime = false): string {
  if (!d) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }
  const dt = new Date(d);
  return withTime
    ? dt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    : dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
