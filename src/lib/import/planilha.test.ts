import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOpinion, extractCodes, parseLocaleNumber, parsePlanilha, parsePrices } from "./planilha";
import type { SheetData } from "./types";

test("números em formato brasileiro e americano", () => {
  assert.equal(parseLocaleNumber("3.197,32"), 3197.32);
  assert.equal(parseLocaleNumber("20.613,70"), 20613.7);
  assert.equal(parseLocaleNumber("1180,10"), 1180.1);
  assert.equal(parseLocaleNumber("50.00"), 50);
  assert.equal(parseLocaleNumber("abc"), null);
});

test("extrai códigos da coluna SUBS", () => {
  assert.deepEqual(extractCodes("ACW0585400; 730050; ACW2230250"), ["ACW0585400", "730050", "ACW2230250"]);
  assert.deepEqual(extractCodes("Substituido por AXE96980"), ["AXE96980"]);
  assert.deepEqual(extractCodes(" "), []);
});

test("lê preços da coluna Valor Dealer", () => {
  const p = parsePrices("(01/06/23) Maqnelson: R$863,93. (12/06/23) No site da Abilene: $50.00", "AH221249");
  assert.equal(p.length, 2);
  assert.deepEqual([p[0].value, p[0].currency, p[0].reference_date, p[0].kind], [863.93, "BRL", "2023-06-01", "dealer"]);
  assert.deepEqual([p[1].value, p[1].currency, p[1].source, p[1].kind], [50, "USD", "No site da Abilene", "site"]);
  assert.equal(parsePrices("(22/06/23) Maqnelson: R$R$6.710,75", "x")[0].value, 6710.75);
  assert.equal(parsePrices("(22/06/23) Maqnelson: Contact Dealer For Price", "x")[0].value, null);
});

test("classifica pareceres", () => {
  assert.equal(classifyOpinion("Alex: sendo feito"), "em_andamento");
  assert.equal(classifyOpinion("Alex FEITO."), "feito");
  assert.equal(classifyOpinion("Alex não: solenoide"), "nao");
  assert.equal(classifyOpinion("Alex sim. Bom! Desafio tecnico Marcus"), "sim");
});

test("agrupa linhas do mesmo produto e ligadas por SUBS", () => {
  const headers = ["Código", "Descrição", "Marca", "Códigos SUBS", "OBS", "Consulta Cliente", "Cliente comentário", "Temos amostra?", "Grãos"];
  const sheet: SheetData = {
    sheetName: "t",
    headers,
    rows: [
      ["AH221249", "Sensor de RPM JD", "JD", null, "Item solicitado pela Scheffer", null, null, 4, "X"],
      ["AH-221249", "SENSOR, SPEED", "JD ", null, null, "AGROSINAI cotou: 1 peça", new Date("2023-07-19"), null, null],
      ["AXE20081", "Sensor", "JD", "AH221249", null, null, null, null, null],
      ["AH221249", "Sensor de RPM JD", "JD", null, "Item solicitado pela Scheffer", null, null, 4, "X"], // repetida
      [null, "sem código", null, null, null, null, null, null, null],
    ],
    rowNumbers: [2, 3, 4, 5, 6],
    images: [],
  };
  const r = parsePlanilha(sheet);
  assert.equal(r.groups.length, 1);
  const g = r.groups[0];
  assert.equal(g.main_code, "AH221249");
  assert.equal(g.manufacturer, "JD");
  assert.deepEqual(g.segments, ["Grãos"]);
  assert.equal(g.codes.length, 2);
  assert.equal(g.demands.length, 3, "linha repetida não duplica demanda");
  const cot = g.demands.find((d) => d.kind === "cotacao")!;
  assert.deepEqual([cot.customer, cot.quantity, cot.requested_at, cot.origin], ["AGROSINAI", 1, "2023-07-19", "cliente"]);
  assert.equal(g.demands.find((d) => d.customer === "Scheffer")?.origin, "cliente");
  assert.equal(g.samples[0].quantity, 4);
  assert.equal(r.stats.skippedRows, 1);
});

test("origem pode ser forçada por fonte", () => {
  const sheet: SheetData = {
    sheetName: "t",
    headers: ["Código", "Outras Tabelas"],
    rows: [["123456", "Lista Klabin"]],
    rowNumbers: [2],
    images: [],
  };
  assert.equal(parsePlanilha(sheet).groups[0].demands[0].origin, "pesquisa_interna");
  const forced = parsePlanilha(sheet, { originOverrides: { "Lista Klabin": "cliente" } });
  assert.equal(forced.groups[0].demands[0].origin, "cliente");
});
