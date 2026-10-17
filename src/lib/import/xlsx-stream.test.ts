import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { openXlsx } from "./xlsx-stream";

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function sample() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Demandas");
  ws.addRow(["Código", "Descrição", "Qtd", "Data", "Ativo", "Total", "Obs"]);
  ws.addRow(["ABC-1", "Bomba & filtro <x>", 10, new Date(Date.UTC(2024, 2, 15)), true, { formula: "C2*2", result: 20 }]);
  ws.addRow([]); // linha vazia é ignorada
  ws.addRow([
    "ABC-2",
    { richText: [{ text: "Rico " }, { text: "texto", font: { bold: true } }] },
    2.5,
    null,
    false,
    { formula: "1/0", result: { error: "#DIV/0!" } },
    { text: "site", hyperlink: "https://exemplo.com" },
  ]);
  ws.getCell("D4").value = "sem data";
  ws.getCell("H5").value = "coluna sem cabeçalho";
  const img = wb.addImage({ buffer: Buffer.from(PNG) as unknown as ExcelJS.Buffer, extension: "png" });
  ws.addImage(img, { tl: { col: 6, row: 1 }, ext: { width: 10, height: 10 } }); // linha 2
  ws.addImage(img, { tl: { col: 6, row: 3.2 }, ext: { width: 10, height: 10 } }); // linha 4
  wb.addWorksheet("Outra").addRow(["x"]);
  return new Blob([await wb.xlsx.writeBuffer()]);
}

test("lê abas, células e fotos sem carregar o arquivo inteiro", async () => {
  const wb = await openXlsx(await sample());
  assert.deepEqual(wb.sheetNames, ["Demandas", "Outra"]);
  const s = await wb.readSheet();
  assert.equal(s.sheetName, "Demandas");
  assert.deepEqual(s.headers, ["Código", "Descrição", "Qtd", "Data", "Ativo", "Total", "Obs", ""]);
  assert.deepEqual(s.rowNumbers, [2, 4, 5]);
  assert.deepEqual(s.rows[0], ["ABC-1", "Bomba & filtro <x>", 10, new Date(Date.UTC(2024, 2, 15)), true, 20, null, null]);
  assert.deepEqual(s.rows[1], ["ABC-2", "Rico texto", 2.5, "sem data", false, null, "site", null]);
  assert.deepEqual(s.rows[2], [null, null, null, null, null, null, null, "coluna sem cabeçalho"]);

  assert.deepEqual(
    s.images.map((i) => [i.rowIndex, i.ext]),
    [
      [0, "png"],
      [1, "png"],
    ],
  );
  assert.deepEqual(await s.images[0].load(), PNG);

  const outra = await wb.readSheet("Outra");
  assert.deepEqual(outra.headers, ["x"]);
  assert.equal(outra.rows.length, 0);
});

test("acha o cabeçalho abaixo de linhas de filtro", async () => {
  const x = new ExcelJS.Workbook();
  const ws = x.addWorksheet("FILTER");
  ws.addRow(["CONTEM", "usinagem"]);
  ws.addRow(["N CONTEM", null, "OR"]);
  ws.addRow(["Código", "Descrição"]);
  ws.addRow(["RE51774", "Sensor"]);
  const wb = await openXlsx(new Blob([await x.xlsx.writeBuffer()]));
  const s = await wb.readSheet(undefined, { isHeader: (cells) => cells.includes("Código") });
  assert.deepEqual(s.headers, ["Código", "Descrição", ""]);
  assert.deepEqual(s.rowNumbers, [4]);
  assert.deepEqual(s.rows[0], ["RE51774", "Sensor", null]);
});

test("recusa arquivo que não é planilha", async () => {
  await assert.rejects(openXlsx(new Blob([new Uint8Array(100)])), /não é uma planilha/);
});
