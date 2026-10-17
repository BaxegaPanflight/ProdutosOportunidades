import type { Cell, SheetData } from "./types";

/**
 * Leitor de .xlsx/.xlsm que não carrega o arquivo inteiro na memória.
 *
 * Um .xlsx é um ZIP. Em vez de descompactar tudo (o que trava o navegador com
 * planilhas de centenas de MB, quase sempre por causa das fotos), lemos o índice
 * do ZIP no fim do arquivo e descompactamos só as partes necessárias, aos poucos:
 * textos, estilos e a aba escolhida. As fotos ficam no arquivo e só são lidas,
 * uma a uma, na hora do envio (`images[i].load()`).
 */

type Entry = { name: string; method: number; compSize: number; size: number; offset: number };

export interface XlsxWorkbook {
  sheetNames: string[];
  readSheet(sheetName?: string, options?: ReadSheetOptions): Promise<SheetData>;
  /** avisos gerais do arquivo (ex.: fotos em formato não suportado) */
  warnings: string[];
}

export interface ReadSheetOptions {
  onProgress?: (fraction: number) => void;
  /**
   * Reconhece a linha de cabeçalho (procurada nas primeiras 50 linhas com dados).
   * Linhas acima dela, como critérios de filtro, são ignoradas.
   * Sem isso, o cabeçalho é a primeira linha com dados.
   */
  isHeader?: (cells: string[]) => boolean;
}

const HEADER_SEARCH_ROWS = 50;

// ---------------------------------------------------------------- ZIP

async function bytes(file: Blob, start: number, end: number) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

async function readEntries(file: Blob): Promise<Map<string, Entry>> {
  // fim do arquivo: registro EOCD (22 bytes + comentário de até 64 KB)
  const tailStart = Math.max(0, file.size - 22 - 0xffff - 20);
  const tail = await bytes(file, tailStart, file.size);
  const dv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("o arquivo não é uma planilha .xlsx/.xlsm válida");

  let count = dv.getUint16(eocd + 10, true);
  let cdSize = dv.getUint32(eocd + 12, true);
  let cdOffset = dv.getUint32(eocd + 16, true);
  // ZIP64 (arquivos muito grandes ou com muitas partes)
  if (eocd >= 20 && dv.getUint32(eocd - 20, true) === 0x07064b50) {
    const z64 = Number(dv.getBigUint64(eocd - 20 + 8, true));
    const rec = await bytes(file, z64, z64 + 56);
    const rv = new DataView(rec.buffer);
    if (rv.getUint32(0, true) === 0x06064b50) {
      count = Number(rv.getBigUint64(32, true));
      cdSize = Number(rv.getBigUint64(40, true));
      cdOffset = Number(rv.getBigUint64(48, true));
    }
  }

  const cd = await bytes(file, cdOffset, cdOffset + cdSize);
  const cv = new DataView(cd.buffer);
  const utf8 = new TextDecoder();
  const entries = new Map<string, Entry>();
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.length; n++) {
    if (cv.getUint32(p, true) !== 0x02014b50) break;
    const method = cv.getUint16(p + 10, true);
    let compSize = cv.getUint32(p + 20, true);
    let size = cv.getUint32(p + 24, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const commentLen = cv.getUint16(p + 32, true);
    let offset = cv.getUint32(p + 42, true);
    const name = utf8.decode(cd.subarray(p + 46, p + 46 + nameLen));
    // campos ZIP64 no "extra"
    let e = p + 46 + nameLen;
    const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = cv.getUint16(e, true);
      const len = cv.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) {
          size = Number(cv.getBigUint64(q, true));
          q += 8;
        }
        if (compSize === 0xffffffff) {
          compSize = Number(cv.getBigUint64(q, true));
          q += 8;
        }
        if (offset === 0xffffffff) offset = Number(cv.getBigUint64(q, true));
      }
      e += 4 + len;
    }
    entries.set(name.replace(/\\/g, "/").replace(/^\//, ""), { name, method, compSize, size, offset });
    p = eEnd + commentLen;
  }
  return entries;
}

async function entryData(file: Blob, entry: Entry) {
  const head = await bytes(file, entry.offset, entry.offset + 30);
  const hv = new DataView(head.buffer);
  if (hv.getUint32(0, true) !== 0x04034b50) throw new Error(`parte corrompida na planilha: ${entry.name}`);
  const start = entry.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
  return file.slice(start, start + entry.compSize);
}

/** Conteúdo descompactado de uma parte, em pedaços. */
async function entryStream(file: Blob, entry: Entry): Promise<ReadableStream<Uint8Array>> {
  const data = await entryData(file, entry);
  if (entry.method === 0) return data.stream();
  if (entry.method === 8) return data.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  throw new Error(`compactação não suportada (${entry.method}) em ${entry.name}`);
}

async function entryBytes(file: Blob, entry: Entry): Promise<Uint8Array> {
  return new Uint8Array(await new Response(await entryStream(file, entry)).arrayBuffer());
}

async function entryText(file: Blob, entry: Entry) {
  return new TextDecoder().decode(await entryBytes(file, entry));
}

/**
 * Lê uma parte XML em pedaços e entrega blocos completos terminados em `closeTag`
 * (ex.: cada lote de `</row>`), sem nunca juntar o XML inteiro na memória.
 */
async function eachBlock(
  file: Blob,
  entry: Entry,
  closeTag: RegExp,
  onBlock: (xml: string) => void,
  onProgress?: (fraction: number) => void,
) {
  const reader = (await entryStream(file, entry)).getReader();
  const dec = new TextDecoder();
  let buf = "";
  // até onde o buffer já foi procurado (sem isso, abas sem fechamento de bloco
  // seriam varridas de novo a cada pedaço — lentidão quadrática)
  let scanned = 0;
  let read = 0;
  let lastYield = Date.now();
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      read += value.length;
      buf += dec.decode(value, { stream: true });
    } else if (done) buf += dec.decode();
    let last = -1;
    closeTag.lastIndex = Math.max(0, scanned - 64);
    for (let m = closeTag.exec(buf); m; m = closeTag.exec(buf)) last = m.index + m[0].length;
    if (last > 0) {
      onBlock(buf.slice(0, last));
      buf = buf.slice(last);
    }
    scanned = buf.length;
    if (done && buf) onBlock(buf);
    if (onProgress && entry.size) onProgress(Math.min(1, read / entry.size));
    if (done) break;
    // deixa a tela respirar em planilhas grandes
    if (Date.now() - lastYield > 50) {
      await new Promise((r) => setTimeout(r, 0));
      lastYield = Date.now();
    }
  }
}

// ---------------------------------------------------------------- XML

function decodeXml(s: string) {
  return s
    .replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) => {
      if (e === "lt") return "<";
      if (e === "gt") return ">";
      if (e === "amp") return "&";
      if (e === "quot") return '"';
      if (e === "apos") return "'";
      return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    })
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    const key = m[1];
    out[key] = decodeXml(m[3] ?? m[4] ?? "");
    // também sem prefixo ("r:id" fica acessível como "id")
    const local = key.split(":").pop()!;
    if (!(local in out)) out[local] = out[key];
  }
  return out;
}

/** Texto de um <si>/<is>: junta os <t>, ignorando a fonética (<rPh>). */
function richText(xml: string) {
  const clean = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) out += m[1] ?? "";
  return decodeXml(out);
}

function resolvePath(base: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function relsPath(part: string) {
  const i = part.lastIndexOf("/");
  return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`;
}

async function readRels(file: Blob, entries: Map<string, Entry>, part: string) {
  const e = entries.get(relsPath(part));
  const out = new Map<string, { target: string; type: string }>();
  if (!e) return out;
  for (const m of (await entryText(file, e)).matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]);
    if (a.Id && a.Target) {
      out.set(a.Id, {
        target: a.TargetMode === "External" ? a.Target : resolvePath(part, a.Target),
        type: a.Type ?? "",
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- células

const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function isDateFormat(code: string) {
  const c = code
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[(?:\$|<|>|=|Red|Black|Blue|Green|White|Yellow|Cyan|Magenta|Color)[^\]]*\]/gi, "");
  return /[dmyhs]/i.test(c) && !/^[#0.,%\s]*$/.test(c);
}

function colIndex(ref: string) {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n; // 1 = A
}

function serialToDate(v: number, date1904: boolean) {
  const days = date1904 ? v + 1462 : v;
  return new Date(Math.round((days - 25569) * 86400000));
}

// ---------------------------------------------------------------- planilha

export async function openXlsx(file: Blob): Promise<XlsxWorkbook> {
  const entries = await readEntries(file);
  const warnings: string[] = [];
  const wbPath = "xl/workbook.xml";
  const wbEntry = entries.get(wbPath);
  if (!wbEntry) throw new Error("o arquivo não é uma planilha do Excel (.xlsx/.xlsm)");
  const wbXml = await entryText(file, wbEntry);
  const date1904 = /<(?:\w+:)?workbookPr\b[^>]*date1904\s*=\s*["'](1|true)["']/.test(wbXml);
  const wbRels = await readRels(file, entries, wbPath);

  const sheets: { name: string; path: string }[] = [];
  for (const m of wbXml.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]);
    const rel = wbRels.get(a["r:id"] ?? a.id ?? "");
    if (a.name && rel && entries.has(rel.target)) sheets.push({ name: a.name, path: rel.target });
  }
  if (!sheets.length) throw new Error("nenhuma aba encontrada na planilha");

  if ([...entries.keys()].some((k) => k.startsWith("xl/richData/"))) {
    warnings.push(
      "A planilha tem fotos colocadas DENTRO da célula (recurso novo do Excel). Essas fotos não são importadas; " +
        "use fotos soltas sobre a célula (Inserir → Imagens → Colocar sobre as Células).",
    );
  }

  // textos compartilhados (lidos uma vez, servem para todas as abas)
  let shared: string[] | null = null;
  async function sharedStrings() {
    if (shared) return shared;
    shared = [];
    const path = [...wbRels.values()].find((r) => r.type.endsWith("/sharedStrings"))?.target ?? "xl/sharedStrings.xml";
    const e = entries.get(path);
    if (e) {
      const list = shared;
      await eachBlock(file, e, /<\/(?:\w+:)?si>|<(?:\w+:)?si\s*\/>/g, (xml) => {
        for (const m of xml.matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)) list.push(richText(m[1] ?? ""));
      });
    }
    return shared;
  }

  // estilos: quais formatos de célula são datas
  let dateStyles: boolean[] | null = null;
  async function styles() {
    if (dateStyles) return dateStyles;
    dateStyles = [];
    const path = [...wbRels.values()].find((r) => r.type.endsWith("/styles"))?.target ?? "xl/styles.xml";
    const e = entries.get(path);
    if (!e) return dateStyles;
    const xml = await entryText(file, e);
    const custom = new Map<number, string>();
    for (const m of xml.matchAll(/<(?:\w+:)?numFmt\b([^>]*)\/?>/g)) {
      const a = attrs(m[1]);
      custom.set(Number(a.numFmtId), a.formatCode ?? "");
    }
    const xfs = xml.match(/<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/)?.[1] ?? "";
    for (const m of xfs.matchAll(/<(?:\w+:)?xf\b([^>]*?)\/?>/g)) {
      const id = Number(attrs(m[1]).numFmtId ?? 0);
      const code = custom.get(id);
      dateStyles.push(code !== undefined ? isDateFormat(code) : DATE_FORMAT_IDS.has(id));
    }
    return dateStyles;
  }

  async function readSheet(sheetName?: string, options: ReadSheetOptions = {}): Promise<SheetData> {
    const sh = sheetName ? sheets.find((s) => s.name === sheetName) : sheets[0];
    if (!sh) throw new Error("Aba não encontrada na planilha");
    const [ss, ds] = [await sharedStrings(), await styles()];

    const toCell = (a: Record<string, string>, inner: string): Cell => {
      const t = a.t ?? "n";
      if (t === "inlineStr") {
        const is = inner.match(/<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/)?.[1];
        return is === undefined ? null : richText(is);
      }
      const raw = inner.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
      if (raw === undefined) return null;
      const v = decodeXml(raw);
      if (t === "s") return ss[Number(v)] ?? null;
      if (t === "str") return v;
      if (t === "b") return v === "1" || v === "true";
      if (t === "e") return null; // #REF!, #N/A…
      if (t === "d") return new Date(v);
      const n = Number(v);
      if (!Number.isFinite(n)) return v;
      return ds[Number(a.s ?? 0)] ? serialToDate(n, date1904) : n;
    };

    const byNumber = new Map<number, Cell[]>();
    let colCount = 0;
    let nextRow = 1;
    const sheetEntry = entries.get(sh.path)!;
    await eachBlock(
      file,
      sheetEntry,
      /<\/(?:\w+:)?row>|<(?:\w+:)?row\b[^>]*\/>/g,
      (xml) => {
        for (const rm of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
          const ra = attrs(rm[1]);
          const r = ra.r ? Number(ra.r) : nextRow;
          nextRow = r + 1;
          if (!rm[2]) continue;
          const values: Cell[] = [];
          let nextCol = 1;
          for (const cm of rm[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
            const ca = attrs(cm[1]);
            const c = ca.r ? colIndex(ca.r) : nextCol;
            nextCol = c + 1;
            const v = toCell(ca, cm[2] ?? "");
            if (v === null || v === "") continue;
            values[c - 1] = v;
            if (c > colCount) colCount = c;
          }
          if (values.length) byNumber.set(r, values);
        }
      },
      options.onProgress,
    );

    const numbers = [...byNumber.keys()].sort((a, b) => a - b);
    const asText = (cells: Cell[]) =>
      Array.from({ length: colCount }, (_, c) => (cells[c] == null ? "" : String(cells[c]).trim()));
    const isHeader = options.isHeader;
    const headerNumber =
      (isHeader && numbers.slice(0, HEADER_SEARCH_ROWS).find((r) => isHeader(asText(byNumber.get(r)!)))) ||
      numbers[0] ||
      1;
    const headerRow = byNumber.get(headerNumber) ?? [];
    const headers: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const h = headerRow[c];
      headers.push(h === null || h === undefined ? "" : String(h).trim());
    }

    const rows: Cell[][] = [];
    const rowNumbers: number[] = [];
    const rowIndexByNumber = new Map<number, number>();
    for (const r of numbers) {
      if (r <= headerNumber) continue;
      const src = byNumber.get(r)!;
      const values: Cell[] = [];
      for (let c = 0; c < colCount; c++) values.push(src[c] ?? null);
      rowIndexByNumber.set(r, rows.length);
      rows.push(values);
      rowNumbers.push(r);
    }
    byNumber.clear();

    // fotos ancoradas nas linhas (desenho da aba)
    const images: SheetData["images"] = [];
    const sheetRels = await readRels(file, entries, sh.path);
    for (const rel of sheetRels.values()) {
      if (!rel.type.endsWith("/drawing")) continue;
      const de = entries.get(rel.target);
      if (!de) continue;
      const drawRels = await readRels(file, entries, rel.target);
      const xml = await entryText(file, de);
      const anchors = xml.matchAll(
        /<(?:\w+:)?(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/(?:\w+:)?\1>/g,
      );
      for (const am of anchors) {
        const rowM = am[0].match(/<(?:\w+:)?from\b[^>]*>[\s\S]*?<(?:\w+:)?row>(\d+)<\/(?:\w+:)?row>/);
        if (!rowM) continue;
        const idx = rowIndexByNumber.get(Number(rowM[1]) + 1);
        if (idx === undefined) continue;
        for (const bm of am[0].matchAll(/<(?:\w+:)?blip\b([^>]*)\/?>/g)) {
          const ba = attrs(bm[1]);
          const media = drawRels.get(ba["r:embed"] ?? ba.embed ?? "");
          const me = media && entries.get(media.target);
          if (!me) continue;
          const ext = (me.name.split(".").pop() ?? "png").toLowerCase();
          images.push({ rowIndex: idx, ext, size: me.size, load: () => entryBytes(file, me) });
        }
      }
    }

    return { sheetName: sh.name, headers, rows, rowNumbers, images };
  }

  return { sheetNames: sheets.map((s) => s.name), readSheet, warnings };
}
