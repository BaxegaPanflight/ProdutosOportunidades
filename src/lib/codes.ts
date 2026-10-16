/** Mesmo critério da função SQL public.norm_code: só letras e números, maiúsculas. */
export function normCode(code: string | null | undefined): string {
  return (code ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Texto em minúsculas, sem acentos e com espaços simples (para comparações). */
export function normText(t: string | null | undefined): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
