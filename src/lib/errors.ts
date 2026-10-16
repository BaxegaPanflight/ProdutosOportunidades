interface PgError {
  code?: string;
  message?: string;
  details?: string;
}

/** Mensagem amigável para erros do Supabase/Postgres. */
export function friendlyError(e: PgError | null | undefined): string {
  if (!e) return "Erro desconhecido";
  const msg = e.message ?? "";
  if (e.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return "Seu perfil não tem permissão para esta ação.";
  }
  if (e.code === "23505") {
    if (/já está cadastrado/.test(msg)) return msg;
    if (/product_codes_code_norm_key/.test(msg)) return "Este código já está cadastrado em outro produto.";
    if (/name_key/.test(msg)) return "Já existe um cadastro com esse nome.";
    return "Registro duplicado.";
  }
  if (e.code === "23503") return "Não é possível excluir: existem registros ligados a este item.";
  if (e.code === "22P02" || e.code === "22007" || e.code === "22008") return "Valor inválido em algum campo.";
  if (e.code === "P0001") return msg; // mensagens das regras do banco (já em português)
  return msg || "Erro ao salvar";
}

export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  link?: { href: string; label: string };
} | null;
