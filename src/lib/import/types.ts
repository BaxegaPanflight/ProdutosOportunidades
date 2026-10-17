export type Cell = string | number | boolean | Date | null;

export interface SheetData {
  sheetName: string;
  headers: string[];
  rows: Cell[][];
  /** número da linha no Excel para cada item de rows */
  rowNumbers: number[];
  /** fotos ancoradas nas linhas; o conteúdo só é lido do arquivo ao chamar load() */
  images: { rowIndex: number; ext: string; size?: number; load: () => Promise<Uint8Array> }[];
}

export type DemandOrigin = "cliente" | "pesquisa_interna" | "mercado";
export type DemandKind = "solicitacao" | "cotacao" | "amostra" | "pesquisa" | "mencao";
export type CodeType = "principal" | "oem" | "equivalente" | "substituto" | "similar" | "cliente" | "interno";
export type ProductStatus =
  | "cadastrado"
  | "em_pesquisa"
  | "em_analise"
  | "aprovado"
  | "rejeitado"
  | "em_desenvolvimento"
  | "concluido";

export interface ImportCode {
  code: string;
  type: CodeType;
  source?: string;
}

export interface ImportDemand {
  hash: string;
  origin: DemandOrigin;
  kind: DemandKind;
  customer?: string | null;
  requested_at?: string | null;
  quantity?: number | null;
  quantity_period?: string | null;
  source: string;
  description_at_source?: string | null;
  notes?: string | null;
  raw: Record<string, unknown>;
  /** linha do Excel (só para a tela de revisão) */
  row: number;
}

export interface ImportMarket {
  source: string;
  period_start: number;
  period_end: number;
  country?: string | null;
  quantity?: number | null;
  avg_unit_value_usd?: number | null;
  total_value_usd?: number | null;
  first_world_share?: number | null;
  verified?: boolean | null;
  notes?: string | null;
}

export interface ImportPrice {
  hash: string;
  kind: "dealer" | "cotacao" | "compra_cliente" | "site" | "importacao" | "outro";
  value: number | null;
  currency: string;
  source?: string | null;
  reference_date?: string | null;
  customer?: string | null;
  raw_text: string;
}

export interface ImportSample {
  hash: string;
  quantity: number | null;
  location: string | null;
  supplier_name: string | null;
  notes: string | null;
}

export interface ImportEvaluation {
  hash: string;
  evaluator: string | null;
  opinion: string | null;
  recommendation: "sim" | "nao" | "avaliar" | "em_andamento" | "feito" | null;
  board_score: number | null;
  technical_ease: number | null;
}

export interface ImportGroup {
  key: string;
  main_code: string;
  description: string | null;
  /** todas as descrições diferentes encontradas (para revisão) */
  descriptions: string[];
  manufacturer: string | null;
  status: ProductStatus;
  notes: string | null;
  codes: ImportCode[];
  segments: string[];
  technologies: string[];
  demands: ImportDemand[];
  market: ImportMarket[];
  prices: ImportPrice[];
  samples: ImportSample[];
  evaluations: ImportEvaluation[];
  /** índices das imagens (SheetData.images) deste produto */
  imageIndexes: number[];
  rows: number[];
}

export interface ImportSource {
  name: string;
  origin: DemandOrigin;
  rows: number;
}

export interface ParseResult {
  groups: ImportGroup[];
  sources: ImportSource[];
  recognizedColumns: string[];
  ignoredColumns: string[];
  warnings: string[];
  stats: { rows: number; skippedRows: number; groups: number; mergedRows: number; images: number };
}
