import type { SupabaseClient } from "@supabase/supabase-js";
import { IMAGE_BUCKET } from "@/lib/storage";
import type { ImportGroup, SheetData } from "./types";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** fotos enviadas ao mesmo tempo */
const PARALLEL = 4;
/** se as primeiras fotos falharem todas pelo mesmo motivo, para e mostra o motivo */
const EARLY_STOP = 8;

export interface PhotoReport {
  total: number;
  sent: number;
  alreadyThere: number;
  unsupported: number;
  noProduct: number;
  failed: { code: string; message: string }[];
  /** motivo, quando o envio foi interrompido por um erro que afeta todas as fotos */
  stoppedBy?: string;
}

async function sha256(data: Uint8Array) {
  const h = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mensagem em português para os erros mais comuns do armazenamento. */
export function explainStorageError(message: string) {
  if (/bucket not found/i.test(message))
    return (
      'O armazenamento de fotos ("product-images") não existe no Supabase. Rode a migração ' +
      "supabase/migrations/20261015000005_storage.sql no SQL Editor e tente de novo."
    );
  if (/row-level security|unauthorized|not allowed|403/i.test(message))
    return "Seu usuário não tem permissão para enviar fotos (políticas do armazenamento no Supabase).";
  if (/mime|content type/i.test(message)) return `Formato de imagem não aceito pelo armazenamento: ${message}`;
  if (/maximum allowed size|too large|413/i.test(message)) return `Foto maior que o limite do armazenamento: ${message}`;
  return message;
}

/**
 * Envia as fotos dos produtos: várias ao mesmo tempo, sem parar por causa de
 * uma foto com problema, e pulando as que já estão no sistema (dá para repetir
 * o envio quantas vezes for preciso).
 */
export async function uploadPhotos(
  supabase: SupabaseClient,
  sheet: SheetData,
  groups: ImportGroup[],
  productIdOf: (g: ImportGroup) => string | undefined,
  source: string,
  onProgress: (done: number, total: number, report: PhotoReport) => void,
): Promise<PhotoReport> {
  const jobs: { g: ImportGroup; pid: string; idx: number }[] = [];
  const report: PhotoReport = { total: 0, sent: 0, alreadyThere: 0, unsupported: 0, noProduct: 0, failed: [] };
  for (const g of groups) {
    if (!g.imageIndexes.length) continue;
    const pid = productIdOf(g);
    if (!pid) {
      report.noProduct += g.imageIndexes.length;
      continue;
    }
    for (const idx of g.imageIndexes) jobs.push({ g, pid, idx });
  }
  report.total = jobs.length;

  // fotos que já estão no sistema (para não enviar de novo)
  const known = new Set<string>();
  const pids = [...new Set(jobs.map((j) => j.pid))];
  for (let i = 0; i < pids.length; i += 200) {
    const { data, error } = await supabase
      .from("product_images")
      .select("product_id, sha256")
      .in("product_id", pids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) known.add(`${r.product_id}:${r.sha256}`);
  }

  let done = 0;
  let next = 0;
  const firstErrors: string[] = [];

  async function one(job: (typeof jobs)[number]) {
    const img = sheet.images[job.idx];
    const mime = MIME[img.ext];
    if (!mime) {
      report.unsupported++;
      return;
    }
    const data = await img.load();
    const sha = await sha256(data);
    const key = `${job.pid}:${sha}`;
    if (known.has(key)) {
      report.alreadyThere++;
      return;
    }
    known.add(key); // a mesma foto repetida no mesmo produto vai uma vez só
    const path = `products/${job.pid}/${sha.slice(0, 32)}.${img.ext === "jpeg" ? "jpg" : img.ext}`;

    let upErr: { message: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      ({ error: upErr } = await supabase.storage.from(IMAGE_BUCKET).upload(path, data, { contentType: mime, upsert: false }));
      if (!upErr || /exists|duplicate/i.test(upErr.message)) {
        upErr = null;
        break;
      }
      // falha de rede: tenta de novo; erro de configuração: não adianta repetir
      if (!/fetch|network|timeout|50\d|429/i.test(upErr.message)) break;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
    if (upErr) throw new Error(explainStorageError(upErr.message));

    const { error: dbErr } = await supabase
      .from("product_images")
      .upsert(
        { product_id: job.pid, storage_path: path, sha256: sha, source },
        { onConflict: "storage_path", ignoreDuplicates: true },
      );
    if (dbErr && !/duplicate key/i.test(dbErr.message)) throw new Error(dbErr.message);
    report.sent++;
  }

  async function worker() {
    while (next < jobs.length && !report.stoppedBy) {
      const job = jobs[next++];
      try {
        await one(job);
      } catch (e) {
        const message = (e as Error).message;
        report.failed.push({ code: job.g.main_code, message });
        if (report.sent === 0 && report.alreadyThere === 0) {
          firstErrors.push(message);
          if (firstErrors.length >= EARLY_STOP && new Set(firstErrors).size === 1) report.stoppedBy = message;
        }
      }
      done++;
      onProgress(done, jobs.length, report);
    }
  }

  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return report;
}
