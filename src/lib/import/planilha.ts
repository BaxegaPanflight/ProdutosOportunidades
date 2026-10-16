/**
 * Interpreta a planilha atual de "Filtro de Demandas" e transforma cada linha em
 * dados estruturados, agrupando linhas do mesmo produto (mesmo código ou códigos
 * ligados pela coluna "Códigos SUBS").
 *
 * Regra geral: nada é descartado. O que não se encaixa num campo estruturado
 * fica em "observações" e a linha original inteira vai em demands.raw.
 */
import { normCode, normText } from "../codes";
import type {
  Cell,
  DemandKind,
  DemandOrigin,
  ImportDemand,
  ImportEvaluation,
  ImportGroup,
  ImportMarket,
  ImportPrice,
  ImportSample,
  ParseResult,
  ProductStatus,
  SheetData,
} from "./types";

// ---------------------------------------------------------------------------
// Mapeamento de colunas
// ---------------------------------------------------------------------------
type ColKey =
  | "code" | "description" | "manufacturer" | "image"
  | "mk21_qty" | "mk21_avg" | "mk21_total" | "mk21_share"
  | "mk1620_qty" | "mk1620_avg" | "mk1620_total" | "mk1620_share"
  | "similar_codes" | "subs" | "increase" | "siscori_ok" | "source_table" | "obs"
  | "customer_query" | "customer_comment" | "sample_qty" | "sample_location" | "cod_petro"
  | "develop" | "board" | "ease" | "dealer";

const headerKey = (h: string) => normText(h).replace(/[^a-z0-9]/g, "");

const COLUMN_RULES: [RegExp, ColKey][] = [
  [/^codigo$/, "code"],
  [/^descricao$/, "description"],
  [/^(marca|fabricante)$/, "manufacturer"],
  [/^imagem$/, "image"],
  [/^quantidade2021$/, "mk21_qty"],
  [/^valormedio.*2021/, "mk21_avg"],
  [/^valortotal.*21us/, "mk21_total"],
  [/^proporcaoprimeiromundo202\d?$/, "mk21_share"],
  [/^quantidade(2016|206|16)a2020$/, "mk1620_qty"],
  [/^valormedio.*2016a2020/, "mk1620_avg"],
  [/^valortotal.*16a2/, "mk1620_total"],
  [/^proporcaoprimeiromundo(2016|206|16)a2020$/, "mk1620_share"],
  [/^codigossimilares$/, "similar_codes"],
  [/^codigossubs?$/, "subs"],
  [/^aumento$/, "increase"],
  [/^resultadosiscori/, "siscori_ok"],
  [/^outrastabelas$/, "source_table"],
  [/^(obs|observacao|observacoes)$/, "obs"],
  [/^consultacliente$/, "customer_query"],
  [/^clientecomentario$/, "customer_comment"],
  [/^temosamostra$/, "sample_qty"],
  [/^posicaoestoque/, "sample_location"],
  [/^codpetro$/, "cod_petro"],
  [/^desenvolve$/, "develop"],
  [/^analiseboard$/, "board"],
  [/^facilidadetecnica$/, "ease"],
  [/^valordealer/, "dealer"],
];

const SEGMENT_HEADERS: Record<string, string> = {
  cana: "Cana", graos: "Grãos", infra: "Infra", trator: "Trator",
  empilhadeira: "Empilhadeira", florestal: "Florestal",
};
const TECH_HEADERS: Record<string, string> = {
  hall: "Hall", indutivo: "Indutivo", resistivo: "Resistivo", usinagem: "Usinagem",
  usinageminjecao: "Usinagem + Injeção", injecao: "Injeção",
};

export const MARKET_SOURCE = "Receita Federal (Siscori)";
export const MARKET_COUNTRY_NOTE =
  "Quantidade por país vinda da planilha; período não informado na planilha (assumido 2021 — confirmar).";

interface ColumnMap {
  byKey: Partial<Record<ColKey, number>>;
  segments: { col: number; name: string }[];
  technologies: { col: number; name: string }[];
  countries: { col: number; name: string }[];
  recognized: string[];
  ignored: string[];
}

export function mapColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = { byKey: {}, segments: [], technologies: [], countries: [], recognized: [], ignored: [] };
  headers.forEach((h, col) => {
    if (!h) return;
    const k = headerKey(h);
    const rule = COLUMN_RULES.find(([re]) => re.test(k));
    if (rule && map.byKey[rule[1]] === undefined) {
      map.byKey[rule[1]] = col;
      map.recognized.push(h);
      return;
    }
    if (SEGMENT_HEADERS[k]) {
      map.segments.push({ col, name: SEGMENT_HEADERS[k] });
      map.recognized.push(h);
      return;
    }
    if (TECH_HEADERS[k]) {
      map.technologies.push({ col, name: TECH_HEADERS[k] });
      map.recognized.push(h);
      return;
    }
    const country = h.match(/^\s*(?:qt|at)\.?\s+(.+?)\s*\??\s*$/i);
    if (country) {
      map.countries.push({ col, name: country[1].trim() });
      map.recognized.push(h);
      return;
    }
    map.ignored.push(h);
  });
  return map;
}

// ---------------------------------------------------------------------------
// Utilitários de valores
// ---------------------------------------------------------------------------
function str(v: Cell | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s || s.startsWith("#")) return null; // #REF!, #N/A
  return s;
}

function num(v: Cell | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  return parseLocaleNumber(v);
}

/** "3.197,32" -> 3197.32 · "50.00" -> 50 · "20.613,70" -> 20613.7 · "1180,10" -> 1180.1 */
export function parseLocaleNumber(s: string): number | null {
  const t = s.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(t)) return null;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  let n: string;
  if (lastComma > lastDot) n = t.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) n = t.replace(/,/g, "");
  else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, ""); // 3.197 (milhar)
  else n = t;
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

function isX(v: Cell | undefined): boolean {
  const s = str(v);
  return !!s && /^(x|sim|s|1|true)$/i.test(s);
}

function toDate(v: Cell | undefined): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = str(v);
  const m = s?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return ddmmyyyy(m[1], m[2], m[3]);
  return null;
}

function ddmmyyyy(d: string, m: string, y: string): string | null {
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Hash determinístico (não criptográfico) usado para evitar duplicar registros ao reimportar. */
export function stableHash(...parts: unknown[]): string {
  const s = JSON.stringify(parts);
  const h = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  };
  return h(1) + h(2);
}

/** Extrai códigos de um texto como "ACW0585400; 730050" ou "Substituido por AXE96980". */
export function extractCodes(text: string | null): string[] {
  if (!text) return [];
  const tokens = text.split(/[;,/\n|]+|\s+e\s+|\s+/i);
  const out: string[] = [];
  for (const t of tokens) {
    const c = t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (c.length >= 4 && /\d/.test(c) && /^[A-Za-z0-9.\-]+$/.test(c)) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Origem da demanda (real x pesquisa interna x mercado)
// ---------------------------------------------------------------------------
const CUSTOMER_SOURCE_HINTS =
  /(orcad|cotou|cotac|valtra|agricase|fort agr|aquino|jd desenvolver|desenvolvimento internacional|solicita|cliente)/;
const INTERNAL_SOURCE_HINTS =
  /(pesquisa|busca|site|lista|tabela|desenvolvimento eng|amostras disp|receita federal)/;

export function classifySource(source: string): DemandOrigin {
  const s = normText(source);
  if (CUSTOMER_SOURCE_HINTS.test(s)) return "cliente";
  if (INTERNAL_SOURCE_HINTS.test(s)) return "pesquisa_interna";
  return "pesquisa_interna";
}

// ---------------------------------------------------------------------------
// Preços (coluna "Valor Dealer")
// ---------------------------------------------------------------------------
const PRICE_RE =
  /(?:\((\d{1,2})\/(\d{1,2})\/(\d{2,4})\)\s*)?([^:()]*?)\s*:\s*((?:R\$\s*)+|US\$|U\$|\$)\s*([\d.,]+)/gi;

export function parsePrices(text: string | null, code: string): ImportPrice[] {
  if (!text) return [];
  const out: ImportPrice[] = [];
  for (const m of text.matchAll(PRICE_RE)) {
    const [, d, mo, y, src, cur, val] = m;
    const value = parseLocaleNumber(val.replace(/[.,]$/, ""));
    if (value === null) continue;
    const currency = /R\$/i.test(cur) ? "BRL" : "USD";
    const source = src.replace(/^[\s.;,-]+/, "").replace(/^\d[\d.,]*\.?\s*/, "").trim() || null;
    const ns = normText(source);
    const kind: ImportPrice["kind"] = /dealer|maqnelson/.test(ns) ? "dealer" : /site/.test(ns) ? "site" : "outro";
    const reference_date = d ? ddmmyyyy(d, mo, y) : null;
    out.push({
      hash: stableHash("price", normCode(code), source, currency, value, reference_date),
      kind, value, currency, source, reference_date, raw_text: m[0].trim(),
    });
  }
  if (out.length === 0 && /[a-z]/i.test(text)) {
    // sem valor identificável (ex.: "Contact Dealer For Price"): guarda o texto
    out.push({
      hash: stableHash("price", normCode(code), text),
      kind: "outro", value: null, currency: "BRL", source: null, reference_date: null, raw_text: text,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pareceres (coluna "Desenvolve?")
// ---------------------------------------------------------------------------
export function classifyOpinion(text: string): ImportEvaluation["recommendation"] {
  const t = normText(text);
  if (/sendo feito|fazendo|doing/.test(t)) return "em_andamento";
  if (/\bfeito\b/.test(t)) return "feito";
  if (/\bsim\b|\bbom\b|encarar/.test(t) && !/^\s*\w+\s+nao\b/.test(t)) return "sim";
  if (/\bnao\b/.test(t)) return "nao";
  if (/avaliar/.test(t)) return "avaliar";
  return null;
}

// ---------------------------------------------------------------------------
// União de linhas em produtos
// ---------------------------------------------------------------------------
class UnionFind {
  private p = new Map<string, string>();
  find(x: string): string {
    if (!this.p.has(x)) this.p.set(x, x);
    let r = x;
    while (this.p.get(r) !== r) r = this.p.get(r)!;
    let c = x;
    while (this.p.get(c) !== r) {
      const n = this.p.get(c)!;
      this.p.set(c, r);
      c = n;
    }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p.set(rb, ra);
  }
}

function mostFrequent<T>(items: T[], key: (t: T) => string = String as never): T | null {
  const counts = new Map<string, { item: T; n: number; first: number }>();
  items.forEach((it, i) => {
    const k = key(it);
    const c = counts.get(k);
    if (c) c.n++;
    else counts.set(k, { item: it, n: 1, first: i });
  });
  let best: { item: T; n: number; first: number } | null = null;
  for (const c of counts.values()) {
    if (!best || c.n > best.n || (c.n === best.n && c.first < best.first)) best = c;
  }
  return best ? best.item : null;
}

/** Descrições que não descrevem nada (só a marca, ou o código repetido) perdem prioridade. */
function descriptionScore(desc: string, manufacturer: string | null, freq: number): number {
  const d = normText(desc);
  let score = freq * 10 + Math.min(desc.length, 60) / 6;
  if (manufacturer && d === normText(manufacturer)) score -= 100;
  if (/^(john deere|cnh|cat|sensor|hall)$/.test(d)) score -= 100;
  if (/^[A-Z0-9 .,\-/]+$/.test(desc) && desc.length > 50) score -= 5; // texto da Receita em caixa alta
  return score;
}

interface RowInfo {
  idx: number;
  excelRow: number;
  code: string;
  codeNorm: string;
  get: (k: ColKey) => Cell | undefined;
  raw: Record<string, unknown>;
}

export interface ParseOptions {
  /** Força a origem de uma fonte específica (nome da fonte -> origem) */
  originOverrides?: Record<string, DemandOrigin>;
}

export function parsePlanilha(sheet: SheetData, options: ParseOptions = {}): ParseResult {
  const cols = mapColumns(sheet.headers);
  const warnings: string[] = [];
  if (cols.byKey.code === undefined) {
    throw new Error('A planilha precisa ter a coluna "Código".');
  }
  const at = (row: Cell[], k: ColKey) => {
    const c = cols.byKey[k];
    return c === undefined ? undefined : row[c];
  };

  // 1. linhas válidas
  const infos: RowInfo[] = [];
  let skipped = 0;
  sheet.rows.forEach((row, idx) => {
    const code = str(at(row, "code"));
    if (!code || !normCode(code)) {
      skipped++;
      return;
    }
    const raw: Record<string, unknown> = {};
    sheet.headers.forEach((h, c) => {
      const v = row[c];
      if (h && v !== null && v !== "" && headerKey(h) !== "imagem") raw[h] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
    });
    infos.push({ idx, excelRow: sheet.rowNumbers[idx], code, codeNorm: normCode(code), get: (k) => at(row, k), raw });
  });
  if (skipped) warnings.push(`${skipped} linha(s) sem código foram ignoradas.`);

  // 2. agrupar: mesmo código ou ligados por "Códigos SUBS"
  const uf = new UnionFind();
  const subsByRow = new Map<number, string[]>();
  for (const r of infos) {
    uf.find(r.codeNorm);
    const subs = extractCodes(str(r.get("subs")));
    subsByRow.set(r.idx, subs);
    for (const s of subs) uf.union(r.codeNorm, normCode(s));
  }
  const groupsByRoot = new Map<string, RowInfo[]>();
  for (const r of infos) {
    const root = uf.find(r.codeNorm);
    if (!groupsByRoot.has(root)) groupsByRoot.set(root, []);
    groupsByRoot.get(root)!.push(r);
  }

  const sourceCounts = new Map<string, number>();
  const groups: ImportGroup[] = [];
  const imagesByRow = new Map<number, number[]>();
  sheet.images.forEach((img, i) => {
    if (!imagesByRow.has(img.rowIndex)) imagesByRow.set(img.rowIndex, []);
    imagesByRow.get(img.rowIndex)!.push(i);
  });

  for (const rows of groupsByRoot.values()) {
    // código principal: o mais frequente na coluna Código (o primeiro em caso de empate)
    const mainNorm = mostFrequent(rows.map((r) => r.codeNorm))!;
    const mainCode =
      mostFrequent(rows.filter((r) => r.codeNorm === mainNorm).map((r) => r.code)) ?? rows[0].code;

    const manufacturers = rows
      .map((r) => str(r.get("manufacturer")))
      .filter((m): m is string => !!m && !/^desconhecid/i.test(m));
    const manufacturer = mostFrequent(manufacturers, (m) => normText(m));

    const descs = rows.map((r) => str(r.get("description"))).filter((d): d is string => !!d);
    const uniqueDescs = [...new Map(descs.map((d) => [normText(d), d])).values()];
    const description =
      uniqueDescs
        .map((d) => ({ d, s: descriptionScore(d, manufacturer, descs.filter((x) => normText(x) === normText(d)).length) }))
        .sort((a, b) => b.s - a.s)[0]?.d ?? null;

    // códigos
    const codes = new Map<string, ImportGroup["codes"][number]>();
    codes.set(mainNorm, { code: mainCode, type: "principal", source: "planilha" });
    for (const r of rows) {
      if (!codes.has(r.codeNorm)) codes.set(r.codeNorm, { code: r.code, type: "equivalente", source: "planilha" });
      for (const s of subsByRow.get(r.idx) ?? []) {
        const n = normCode(s);
        if (!codes.has(n)) codes.set(n, { code: s, type: "substituto", source: "Códigos SUBS" });
      }
      const petro = str(r.get("cod_petro"));
      if (petro && normCode(petro)) {
        const p = /^\d+$/.test(petro) ? petro.padStart(6, "0") : petro;
        const n = normCode(p);
        if (!codes.has(n)) codes.set(n, { code: p, type: "interno", source: "Cod PETRO" });
      }
    }

    // segmentos / tecnologias
    const segments = new Set<string>();
    const technologies = new Set<string>();
    for (const r of rows) {
      for (const s of cols.segments) if (isX(sheet.rows[r.idx][s.col])) segments.add(s.name);
      for (const t of cols.technologies) if (isX(sheet.rows[r.idx][t.col])) technologies.add(t.name);
      const obs = normText(str(r.get("obs"))).replace(/[.\s]+$/, "");
      for (const name of Object.values(TECH_HEADERS)) {
        if (obs === normText(name) || obs.startsWith(normText(name) + ".") || obs.endsWith(" " + normText(name))) {
          technologies.add(name);
        }
      }
    }

    // demandas (uma por linha; linhas idênticas viram uma só pelo hash)
    const demands = new Map<string, ImportDemand>();
    const similarNotes: string[] = [];
    for (const r of rows) {
      const obs = str(r.get("obs"));
      const table = str(r.get("source_table"));
      const query = str(r.get("customer_query"));
      const comment = r.get("customer_comment");
      const similar = str(r.get("similar_codes"));
      if (similar) similarNotes.push(similar);

      let customer: string | null = null;
      let quantity: number | null = null;
      let quantityPeriod: string | null = null;
      let kind: DemandKind = "mencao";
      let requestedAt: string | null = null;
      const notes: string[] = [];

      const solicit = obs?.match(/solicitad[oa]\s+pel[oa]\s+([^.;]+)/i);
      if (solicit) {
        customer = solicit[1].trim();
        kind = "solicitacao";
      }
      const annual = obs?.match(/^(.+?)\s+Qtd\.?\s*Anual\s+(\d+)/i);
      if (annual) {
        customer = annual[1].trim();
        quantity = Number(annual[2]);
        quantityPeriod = "ano";
        kind = "solicitacao";
      }
      const agri = obs?.match(/Pre[cç]o Compra\s+(\S+)\s+([\d.,]+)?\s*Demanda Ano\s+\S+\s+(\d+)?/i);
      if (agri) {
        customer = agri[1];
        if (agri[3]) {
          quantity = Number(agri[3]);
          quantityPeriod = "ano";
        }
        kind = "solicitacao";
      }
      const cotou = query?.match(/^(.+?)\s+cotou:?\s*(\d+)?/i);
      if (cotou) {
        customer = cotou[1].trim();
        if (cotou[2]) {
          quantity = Number(cotou[2]);
          quantityPeriod = "pedido";
        }
        kind = "cotacao";
        requestedAt = toDate(comment);
      } else if (query && !/amostra/i.test(query) && !/\d/.test(query) && query.length <= 40) {
        customer = customer ?? query;
        kind = kind === "mencao" ? "solicitacao" : kind;
      } else if (query && !/amostra/i.test(query)) {
        notes.push(`Consulta cliente: ${query}`);
      }
      if (!requestedAt) {
        const cdate = toDate(comment);
        if (cdate) requestedAt = cdate;
        else if (str(comment)) notes.push(`Comentário do cliente: ${str(comment)}`);
      }

      let source: string;
      if (table) source = table;
      else if (customer && solicit) source = "Solicitação de cliente";
      else if (obs && /^(pesquisa|planilha|busca|lista|c[oó]digos)/i.test(obs)) source = obs;
      else source = "Planilha (sem fonte informada)";

      if (obs && obs !== source) notes.push(obs);
      if (/amostras disp/i.test(source)) kind = "amostra";
      else if (/pesquisa|busca|site/i.test(normText(source)) && kind === "mencao") kind = "pesquisa";

      const origin =
        options.originOverrides?.[source] ?? (customer ? "cliente" : classifySource(source));

      const hash = stableHash("demand", mainNorm, r.codeNorm, source, customer, quantity, requestedAt,
        normText(str(r.get("description"))), normText(obs));
      if (demands.has(hash)) continue;
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
      demands.set(hash, {
        hash, origin, kind, customer, requested_at: requestedAt, quantity, quantity_period: quantityPeriod,
        source, description_at_source: str(r.get("description")), notes: notes.join(" · ") || null,
        raw: r.raw, row: r.excelRow,
      });
    }

    // mercado: primeiro valor preenchido de cada campo, considerando todas as linhas
    const first = (k: ColKey) => {
      for (const r of rows) {
        const v = num(r.get(k));
        if (v !== null) return v;
      }
      return null;
    };
    const siscori = rows.map((r) => str(r.get("siscori_ok"))).find((s) => !!s) ?? null;
    const verified = siscori ? (/^est[aá] certo/i.test(siscori) ? true : /^est[aá] errado/i.test(siscori) ? false : null) : null;
    const siscoriNote = siscori && !/^est[aá] (certo|errado)\s*$/i.test(siscori) ? siscori : null;
    const market: ImportMarket[] = [];
    const m21 = {
      quantity: first("mk21_qty"), avg_unit_value_usd: first("mk21_avg"),
      total_value_usd: first("mk21_total"), first_world_share: first("mk21_share"),
    };
    if (Object.values(m21).some((v) => v !== null)) {
      market.push({ source: MARKET_SOURCE, period_start: 2021, period_end: 2021, country: null, ...m21, verified, notes: siscoriNote });
    }
    const m1620 = {
      quantity: first("mk1620_qty"), avg_unit_value_usd: first("mk1620_avg"),
      total_value_usd: first("mk1620_total"), first_world_share: first("mk1620_share"),
    };
    if (Object.values(m1620).some((v) => v !== null)) {
      market.push({ source: MARKET_SOURCE, period_start: 2016, period_end: 2020, country: null, ...m1620, verified: null, notes: null });
    }
    for (const c of cols.countries) {
      let q: number | null = null;
      for (const r of rows) {
        const v = num(sheet.rows[r.idx][c.col]);
        if (v !== null) { q = v; break; }
      }
      if (q !== null && q > 0) {
        market.push({ source: MARKET_SOURCE, period_start: 2021, period_end: 2021, country: c.name, quantity: q, notes: MARKET_COUNTRY_NOTE });
      }
    }

    // preços
    const prices = new Map<string, ImportPrice>();
    for (const r of rows) {
      for (const p of parsePrices(str(r.get("dealer")), mainCode)) prices.set(p.hash, p);
      const obs = str(r.get("obs"));
      const agri = obs?.match(/Pre[cç]o Compra\s+(\S+)\s+([\d.,]+)/i);
      if (agri) {
        const value = parseLocaleNumber(agri[2]);
        if (value !== null) {
          const p: ImportPrice = {
            hash: stableHash("price", mainNorm, "compra", agri[1], value),
            kind: "compra_cliente", value, currency: "BRL", source: str(r.get("source_table")),
            customer: agri[1], raw_text: agri[0],
          };
          prices.set(p.hash, p);
        }
      }
    }

    // amostra (uma por produto, juntando o que aparecer nas linhas)
    let sampleQty: number | null = null;
    const sampleNotes = new Set<string>();
    const locations: string[] = [];
    let supplier: string | null = null;
    let hasSample = false;
    for (const r of rows) {
      const q = r.get("sample_qty");
      const qs = str(q);
      if (qs) {
        hasSample = true;
        const n = typeof q === "number" ? q : Number(qs.match(/^\d+/)?.[0] ?? NaN);
        if (Number.isFinite(n)) sampleQty = Math.max(sampleQty ?? 0, n);
        const rest = typeof q === "number" ? "" : qs.replace(/^\d+\s*/, "").replace(/^\((.*)\)$/, "$1");
        if (rest && !/^sim$/i.test(rest)) sampleNotes.add(rest);
      }
      const loc = str(r.get("sample_location"));
      if (loc) { hasSample = true; locations.push(loc); }
      const sup = str(r.get("customer_query"))?.match(/amostra\s+(?:cedida|fornecida)\s+por:?\s*(.+)/i);
      if (sup) { hasSample = true; supplier = supplier ?? sup[1].trim(); }
      if (/temos amostra/i.test(str(r.get("obs")) ?? "")) hasSample = true;
    }
    const samples: ImportSample[] = [];
    if (hasSample) {
      const location = mostFrequent(locations);
      samples.push({
        hash: stableHash("sample", mainNorm, location),
        quantity: sampleQty, location, supplier_name: supplier,
        notes: [...sampleNotes].join(" · ") || null,
      });
    }

    // pareceres
    const evaluations = new Map<string, ImportEvaluation>();
    for (const r of rows) {
      const op = str(r.get("develop"));
      if (op) {
        const e: ImportEvaluation = {
          hash: stableHash("eval", mainNorm, normText(op)),
          evaluator: null, opinion: op, recommendation: classifyOpinion(op), board_score: null, technical_ease: null,
        };
        evaluations.set(e.hash, e);
      }
      const board = num(r.get("board"));
      const ease = num(r.get("ease"));
      if (board !== null || ease !== null) {
        const e: ImportEvaluation = {
          hash: stableHash("eval-score", mainNorm, board, ease),
          evaluator: "Board", opinion: null, recommendation: null, board_score: board, technical_ease: ease,
        };
        evaluations.set(e.hash, e);
      }
    }

    // status no funil
    const recs = [...evaluations.values()].map((e) => e.recommendation);
    const engRows = rows.filter((r) => /desenvolvimento eng/i.test(str(r.get("source_table")) ?? ""));
    const engObs = engRows.map((r) => normText(str(r.get("obs"))));
    let status: ProductStatus = "cadastrado";
    if (recs.includes("feito") || engObs.some((o) => o.startsWith("conclu"))) status = "concluido";
    else if (recs.includes("em_andamento") || engObs.some((o) => o.startsWith("andamento"))) status = "em_desenvolvimento";
    else if (engObs.some((o) => o.startsWith("fila"))) status = "aprovado";
    else if (evaluations.size > 0) status = "em_analise";

    const imageIndexes = rows.flatMap((r) => imagesByRow.get(r.idx) ?? []);

    groups.push({
      key: mainNorm,
      main_code: mainCode,
      description,
      descriptions: uniqueDescs,
      manufacturer,
      status,
      codes: [...codes.values()],
      segments: [...segments],
      technologies: [...technologies],
      demands: [...demands.values()],
      market,
      prices: [...prices.values()],
      samples,
      evaluations: [...evaluations.values()],
      imageIndexes,
      rows: rows.map((r) => r.excelRow),
      notes: similarNotes.length ? `Códigos similares (planilha): ${[...new Set(similarNotes)].join("; ")}` : null,
    });
  }

  groups.sort((a, b) => a.rows[0] - b.rows[0]);

  const sources = [...sourceCounts.entries()]
    .map(([name, n]) => ({ name, rows: n, origin: options.originOverrides?.[name] ?? classifySource(name) }))
    .sort((a, b) => b.rows - a.rows);

  return {
    groups,
    sources,
    recognizedColumns: cols.recognized,
    ignoredColumns: cols.ignored,
    warnings,
    stats: {
      rows: infos.length,
      skippedRows: skipped,
      groups: groups.length,
      mergedRows: infos.length - groups.length,
      images: sheet.images.length,
    },
  };
}

/** Monta o payload enviado para public.import_planilha (sem dados só de revisão). */
export function toPayload(fileName: string, groups: ImportGroup[]) {
  return {
    file_name: fileName,
    groups: groups.map((g) => ({
      key: g.key,
      main_code: g.main_code,
      description: g.description,
      manufacturer: g.manufacturer,
      status: g.status,
      notes: g.notes,
      codes: g.codes,
      segments: g.segments,
      technologies: g.technologies,
      demands: g.demands.map((d) => {
        const { row, ...rest } = d;
        void row;
        return rest;
      }),
      market: g.market,
      prices: g.prices,
      samples: g.samples,
      evaluations: g.evaluations,
    })),
  };
}
