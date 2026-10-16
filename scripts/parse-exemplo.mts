// Uso: npx tsx scripts/parse-exemplo.mts <arquivo.xlsx> [saida.json]
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { readSheet } from "../src/lib/import/excel-reader";
import { parsePlanilha, toPayload } from "../src/lib/import/planilha";

const [file, out] = process.argv.slice(2);
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const sheet = readSheet(wb);
const res = parsePlanilha(sheet);
console.log(res.stats, res.warnings);
console.log("ignoradas:", res.ignoredColumns);
console.log("fontes:", res.sources);
for (const g of res.groups) {
  console.log(`${g.main_code.padEnd(14)} ${String(g.rows.length).padStart(2)} linhas | ${g.status.padEnd(18)} | ${g.manufacturer ?? "-"} | ${g.description} | codes=${g.codes.map(c=>c.code+":"+c.type).join(",")} | dem=${g.demands.length} cli=${g.demands.filter(d=>d.customer).map(d=>d.customer+(d.quantity?"("+d.quantity+")":"")).join(",")} | mk=${g.market.length} | pr=${g.prices.map(p=>p.currency+" "+p.value+" "+(p.source??"")+" "+(p.reference_date??"")).join(" / ")} | am=${g.samples.map(s=>s.quantity+"@"+s.location+" "+(s.supplier_name??"")).join()} | ev=${g.evaluations.map(e=>e.recommendation).join(",")} | seg=${g.segments} tec=${g.technologies} | img=${g.imageIndexes.length}`);
}
if (out) writeFileSync(out, JSON.stringify(toPayload("Exemplo.xlsx", res.groups)));
