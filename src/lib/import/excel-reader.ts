import type ExcelJSType from "exceljs";
import type { Cell, SheetData } from "./types";

/** Converte o valor de uma célula ExcelJS para um valor simples. */
function toCell(v: ExcelJSType.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    if ("error" in v) return null; // #REF!, #N/A…
    if ("result" in v) return toCell((v as ExcelJSType.CellFormulaValue).result as ExcelJSType.CellValue);
    if ("richText" in v) return (v as ExcelJSType.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return String((v as ExcelJSType.CellHyperlinkValue).text);
  }
  return String(v);
}

export function listSheets(wb: ExcelJSType.Workbook): string[] {
  return wb.worksheets.map((w) => w.name);
}

/**
 * Lê uma aba: primeira linha = cabeçalho. Também extrai as imagens ancoradas
 * nas linhas (a planilha atual guarda a foto do produto na coluna "Imagem").
 */
export function readSheet(wb: ExcelJSType.Workbook, sheetName?: string): SheetData {
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!ws) throw new Error("Aba não encontrada na planilha");

  const colCount = ws.columnCount;
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  for (let c = 1; c <= colCount; c++) {
    const h = toCell(headerRow.getCell(c).value);
    headers.push(h === null ? "" : String(h).trim());
  }

  const rows: Cell[][] = [];
  const rowNumbers: number[] = [];
  const rowIndexByNumber = new Map<number, number>();
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: Cell[] = [];
    let any = false;
    for (let c = 1; c <= colCount; c++) {
      const v = toCell(row.getCell(c).value);
      if (v !== null && v !== "") any = true;
      values.push(v);
    }
    if (!any) continue;
    rowIndexByNumber.set(r, rows.length);
    rows.push(values);
    rowNumbers.push(r);
  }

  const images: SheetData["images"] = [];
  for (const img of ws.getImages()) {
    const excelRow = Math.floor(img.range.tl.nativeRow) + 1;
    const idx = rowIndexByNumber.get(excelRow);
    if (idx === undefined) continue;
    const media = wb.getImage(Number(img.imageId)) as unknown as { buffer?: ArrayBuffer | Uint8Array; extension?: string };
    if (!media?.buffer) continue;
    const data = media.buffer instanceof Uint8Array ? media.buffer : new Uint8Array(media.buffer);
    images.push({ rowIndex: idx, ext: (media.extension || "png").toLowerCase(), data });
  }

  return { sheetName: ws.name, headers, rows, rowNumbers, images };
}
