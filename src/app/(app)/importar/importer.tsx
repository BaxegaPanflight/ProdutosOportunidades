"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, btn, Card, Input, Select, Table } from "@/components/ui";
import { normCode } from "@/lib/codes";
import { openXlsx, type XlsxWorkbook } from "@/lib/import/xlsx-stream";
import { parsePlanilha, toPayload } from "@/lib/import/planilha";
import type { DemandOrigin, ImportGroup, ParseResult, SheetData } from "@/lib/import/types";
import { ORIGIN, STATUS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { IMAGE_BUCKET } from "@/lib/storage";

type Phase = "idle" | "reading" | "ready" | "importing" | "done";
type Existing = Map<string, { productId: string; mainCode: string }>;

const CHUNK = 100;
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

async function sha256(data: Uint8Array) {
  const h = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function Importer() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<XlsxWorkbook | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [overrides, setOverrides] = useState<Record<string, DemandOrigin>>({});
  const [existing, setExisting] = useState<Existing>(new Map());
  const [filter, setFilter] = useState("");
  const [progress, setProgress] = useState("");
  const [summary, setSummary] = useState<Record<string, number> | null>(null);

  const result: ParseResult | null = useMemo(() => {
    if (!sheet) return null;
    try {
      return parsePlanilha(sheet, { originOverrides: overrides });
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [sheet, overrides]);

  async function loadSheet(wb: XlsxWorkbook, name?: string) {
    setError(null);
    setPhase("reading");
    setProgress("Lendo a aba…");
    const data = await wb.readSheet(name, (f) => setProgress(`Lendo a aba… ${Math.round(f * 100)}%`));
    setProgress("Conferindo códigos já cadastrados…");
    const parsed = parsePlanilha(data);
    setSheet(data);
    setOverrides({});
    // quais códigos já existem no sistema?
    const supabase = createClient();
    const norms = [...new Set(parsed.groups.flatMap((g) => g.codes.map((c) => normCode(c.code))))];
    const found: Existing = new Map();
    for (let i = 0; i < norms.length; i += 200) {
      const { data: rows, error: e } = await supabase
        .from("product_codes")
        .select("code_norm, product_id, products(main_code)")
        .in("code_norm", norms.slice(i, i + 200));
      if (e) throw e;
      for (const r of rows ?? []) {
        found.set(r.code_norm as string, {
          productId: r.product_id as string,
          mainCode: (r.products as unknown as { main_code: string } | null)?.main_code ?? "",
        });
      }
    }
    setExisting(found);
    setProgress("");
    setPhase("ready");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setPhase("reading");
    setError(null);
    setSummary(null);
    setFileName(file.name);
    try {
      const wb = await openXlsx(file);
      setWorkbook(wb);
      setSheets(wb.sheetNames);
      await loadSheet(wb, wb.sheetNames[0]);
    } catch (e) {
      setError(`Não foi possível ler a planilha: ${(e as Error).message}`);
      setProgress("");
      setPhase("idle");
    }
  }

  const matchOf = (g: ImportGroup) => {
    for (const c of g.codes) {
      const hit = existing.get(normCode(c.code));
      if (hit) return hit;
    }
    return null;
  };

  async function runImport() {
    if (!result || !sheet) return;
    setPhase("importing");
    setError(null);
    const supabase = createClient();
    const totals: Record<string, number> = {};
    const productByKey = new Map<string, string>();
    try {
      for (let i = 0; i < result.groups.length; i += CHUNK) {
        const chunk = result.groups.slice(i, i + CHUNK);
        setProgress(`Gravando produtos ${i + 1}–${i + chunk.length} de ${result.groups.length}…`);
        const { data, error: e } = await supabase.rpc("import_planilha", {
          payload: toPayload(fileName, chunk),
        });
        if (e) throw new Error(e.message);
        const res = data as { stats: Record<string, number>; products: { key: string; product_id: string }[] };
        for (const [k, v] of Object.entries(res.stats)) totals[k] = (totals[k] ?? 0) + v;
        for (const p of res.products) productByKey.set(p.key, p.product_id);
      }

      // fotos
      let sent = 0;
      let skipped = 0;
      const withImages = result.groups.filter((g) => g.imageIndexes.length);
      for (const [gi, g] of withImages.entries()) {
        const pid = productByKey.get(g.key);
        if (!pid) continue;
        setProgress(`Enviando fotos: produto ${gi + 1} de ${withImages.length}…`);
        const seen = new Set<string>();
        for (const idx of g.imageIndexes) {
          const img = sheet.images[idx];
          const mime = MIME[img.ext];
          if (!mime) {
            skipped++;
            continue;
          }
          const data = await img.load();
          const sha = await sha256(data);
          if (seen.has(sha)) continue;
          seen.add(sha);
          const path = `products/${pid}/${sha.slice(0, 32)}.${img.ext === "jpeg" ? "jpg" : img.ext}`;
          const { error: upErr } = await supabase.storage
            .from(IMAGE_BUCKET)
            .upload(path, data, { contentType: mime, upsert: false });
          if (upErr && !/exists|duplicate/i.test(upErr.message)) throw new Error(`Foto de ${g.main_code}: ${upErr.message}`);
          const { error: e2 } = await supabase
            .from("product_images")
            .upsert(
              { product_id: pid, storage_path: path, sha256: sha, source: `planilha ${fileName}` },
              { onConflict: "storage_path", ignoreDuplicates: true },
            );
          if (e2) throw new Error(e2.message);
          sent++;
        }
      }
      totals.fotos = sent;
      if (skipped) totals.fotos_ignoradas = skipped;
      setSummary(totals);
      setPhase("done");
    } catch (e) {
      setError(
        `A importação parou: ${(e as Error).message}. O que já foi gravado fica salvo; pode importar o mesmo arquivo de novo sem duplicar.`,
      );
      setPhase("ready");
    } finally {
      setProgress("");
    }
  }

  const groups = result?.groups ?? [];
  const visible = filter
    ? groups.filter((g) =>
        `${g.main_code} ${g.description ?? ""} ${g.manufacturer ?? ""} ${g.codes.map((c) => c.code).join(" ")}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
      )
    : groups;
  const existingCount = groups.filter((g) => matchOf(g)).length;

  return (
    <div className="flex flex-col gap-4">
      <Card title="1. Arquivo">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file"
            accept=".xlsx,.xlsm"
            className="h-auto max-w-md py-1.5"
            disabled={phase === "reading" || phase === "importing"}
            onChange={(e) => onFile(e.currentTarget.files?.[0])}
          />
          {sheets.length > 1 && workbook && (
            <Select
              className="w-56"
              value={sheet?.sheetName}
              onChange={(e) =>
                loadSheet(workbook, e.currentTarget.value).catch((er) => {
                  setError(`Não foi possível ler a aba: ${(er as Error).message}`);
                  setPhase("idle");
                })
              }
            >
              {sheets.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          )}
          {phase === "reading" && <span className="text-sm text-ink-soft">{progress || "Lendo planilha…"}</span>}
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {workbook?.warnings.map((w) => (
          <p key={w} className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {w}
          </p>
        ))}
      </Card>

      {result && phase !== "idle" && phase !== "reading" && (
        <>
          <Card title="2. O que foi encontrado">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Linhas com código", result.stats.rows],
                ["Produtos (após unir repetidos)", result.stats.groups],
                ["Linhas unificadas", result.stats.mergedRows],
                ["Já existem no sistema", existingCount],
                ["Produtos novos", result.stats.groups - existingCount],
                ["Fotos na planilha", result.stats.images],
              ].map(([l, v]) => (
                <div key={l as string}>
                  <dt className="text-xs text-ink-soft">{l}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            {result.warnings.map((w) => (
              <p key={w} className="mt-3 text-sm text-amber-800">
                {w}
              </p>
            ))}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-brand-700">
                Colunas: {result.recognizedColumns.length} reconhecidas
                {result.ignoredColumns.length ? `, ${result.ignoredColumns.length} ignoradas` : ""}
              </summary>
              <p className="mt-2 text-ink-soft">{result.recognizedColumns.join(" · ")}</p>
              {result.ignoredColumns.length > 0 && (
                <p className="mt-2 text-amber-800">Ignoradas: {result.ignoredColumns.join(" · ")}</p>
              )}
            </details>
          </Card>

          <Card title="3. Confira a origem de cada fonte" bodyClassName="p-0">
            <p className="px-4 pt-3 text-sm text-ink-soft">
              Define se cada fonte representa <b>demanda real de cliente</b>, <b>pesquisa interna</b> ou{" "}
              <b>dado de mercado</b>. Linhas com cliente identificado (“solicitado pela…”, “cotou…”) contam sempre como
              demanda de cliente.
            </p>
            <Table className="mt-2">
              <thead>
                <tr>
                  <th>Fonte (coluna “Outras Tabelas” ou OBS)</th>
                  <th className="text-right">Linhas</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {result.sources.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td className="text-right tabular-nums">{s.rows}</td>
                    <td>
                      <Select
                        className="h-8 w-52"
                        value={s.origin}
                        disabled={phase === "importing"}
                        onChange={(e) =>
                          setOverrides((o) => ({ ...o, [s.name]: e.currentTarget.value as DemandOrigin }))
                        }
                      >
                        {Object.entries(ORIGIN).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card
            title={`4. Produtos (${groups.length})`}
            actions={
              <Input
                placeholder="Filtrar…"
                value={filter}
                onChange={(e) => setFilter(e.currentTarget.value)}
                className="h-8 w-56"
              />
            }
            bodyClassName="p-0"
          >
            <Table className="max-h-[32rem] overflow-y-auto">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th>Código</th>
                  <th>Descrição escolhida</th>
                  <th>Fabricante</th>
                  <th>Status</th>
                  <th>Outros códigos</th>
                  <th className="text-right">Linhas</th>
                  <th className="text-right">Demandas (cliente)</th>
                  <th className="text-right">Fotos</th>
                  <th>No sistema</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 300).map((g) => {
                  const hit = matchOf(g);
                  return (
                    <tr key={g.key}>
                      <td className="font-mono text-xs font-semibold">{g.main_code}</td>
                      <td className="max-w-sm">
                        {g.description ?? <span className="text-ink-faint">sem descrição</span>}
                        {g.descriptions.length > 1 && (
                          <details className="text-xs text-ink-soft">
                            <summary className="cursor-pointer">+{g.descriptions.length - 1} outras descrições</summary>
                            <ul className="mt-1 list-disc pl-4">
                              {g.descriptions
                                .filter((d) => d !== g.description)
                                .map((d) => (
                                  <li key={d}>{d}</li>
                                ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td>{g.manufacturer ?? "—"}</td>
                      <td>
                        <Badge tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Badge>
                      </td>
                      <td className="font-mono text-xs">
                        {g.codes
                          .filter((c) => c.type !== "principal")
                          .map((c) => c.code)
                          .join(", ") || "—"}
                      </td>
                      <td className="text-right tabular-nums" title={`Linhas do Excel: ${g.rows.join(", ")}`}>
                        {g.rows.length}
                      </td>
                      <td className="text-right tabular-nums">
                        {g.demands.length} ({g.demands.filter((d) => d.origin === "cliente").length})
                      </td>
                      <td className="text-right tabular-nums">{g.imageIndexes.length || "—"}</td>
                      <td>
                        {hit ? (
                          <Link href={`/produtos/${hit.productId}`} target="_blank">
                            <Badge tone="blue">existe · {hit.mainCode}</Badge>
                          </Link>
                        ) : (
                          <Badge tone="green">novo</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {visible.length > 300 && (
              <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">
                Mostrando 300 de {visible.length}. Use o filtro para ver outros.
              </p>
            )}
          </Card>

          <Card title="5. Importar">
            {phase === "done" && summary ? (
              <div className="text-sm">
                <p className="font-medium text-emerald-800">Importação concluída.</p>
                <p className="mt-1 text-ink-soft">
                  {summary.produtos_novos} produtos novos · {summary.produtos_existentes} atualizados (só campos
                  vazios) · {summary.codigos} códigos · {summary.demandas} demandas · {summary.amostras} amostras ·{" "}
                  {summary.precos} preços · {summary.pareceres} pareceres · {summary.fotos} fotos
                  {summary.conflitos ? ` · ${summary.conflitos} produto(s) com códigos em mais de um cadastro` : ""}
                </p>
                <Link href="/produtos" className={`${btn("primary")} mt-3`}>
                  Ver produtos
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button className={btn("primary")} disabled={phase === "importing"} onClick={runImport}>
                  {phase === "importing" ? "Importando…" : `Importar ${groups.length} produtos`}
                </button>
                <span className="text-sm text-ink-soft">
                  {progress ||
                    "Produtos existentes não são sobrescritos: só campos vazios são completados. Reimportar o mesmo arquivo não duplica registros."}
                </span>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
