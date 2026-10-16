import type { CodeType, DemandKind, DemandOrigin, ProductStatus } from "@/lib/import/types";

export const STATUS: Record<ProductStatus, { label: string; tone: Tone }> = {
  cadastrado: { label: "Cadastrado", tone: "gray" },
  em_pesquisa: { label: "Em pesquisa", tone: "blue" },
  em_analise: { label: "Em análise", tone: "amber" },
  aprovado: { label: "Aprovado", tone: "green" },
  rejeitado: { label: "Rejeitado", tone: "red" },
  em_desenvolvimento: { label: "Em desenvolvimento", tone: "violet" },
  concluido: { label: "Concluído", tone: "teal" },
};
export const STATUS_ORDER = Object.keys(STATUS) as ProductStatus[];

export const ORIGIN: Record<DemandOrigin, { label: string; tone: Tone; hint: string }> = {
  cliente: { label: "Demanda de cliente", tone: "green", hint: "pedido, cotação ou interesse real de um cliente" },
  pesquisa_interna: { label: "Pesquisa interna", tone: "blue", hint: "levantamento feito pela equipe" },
  mercado: { label: "Mercado", tone: "gray", hint: "dados gerais de mercado / importações" },
};

export const KIND: Record<DemandKind, string> = {
  solicitacao: "Solicitação",
  cotacao: "Cotação",
  amostra: "Amostra",
  pesquisa: "Pesquisa",
  mencao: "Menção em lista",
};

export const CODE_TYPE: Record<CodeType, string> = {
  principal: "Principal",
  oem: "OEM",
  equivalente: "Equivalente",
  substituto: "Substituto",
  similar: "Similar",
  cliente: "Código do cliente",
  interno: "Interno",
};

export const ROLE = {
  diretoria: "Diretoria",
  supervisao: "Supervisão",
  operacao: "Operação",
} as const;

export const SAMPLE_STATUS = {
  recebida: "Recebida",
  em_estoque: "Em estoque",
  em_analise: "Em análise",
  devolvida: "Devolvida",
  descartada: "Descartada",
} as const;

export const PRICE_KIND = {
  dealer: "Dealer",
  cotacao: "Cotação",
  compra_cliente: "Compra do cliente",
  site: "Site",
  importacao: "Importação",
  outro: "Outro",
} as const;

export const RECOMMENDATION = {
  sim: "Sim",
  nao: "Não",
  avaliar: "Avaliar",
  em_andamento: "Em andamento",
  feito: "Feito",
} as const;

export type Tone = "gray" | "blue" | "amber" | "green" | "red" | "violet" | "teal";
