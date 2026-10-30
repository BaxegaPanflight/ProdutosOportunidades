import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadPhotos } from "./photos";
import type { ImportGroup, SheetData } from "./types";

function sheetWith(n: number): SheetData {
  return {
    sheetName: "DATA",
    headers: [],
    rows: [],
    rowNumbers: [],
    images: Array.from({ length: n }, (_, i) => ({
      rowIndex: i,
      ext: i === n - 1 ? "emf" : "png",
      load: async () => new Uint8Array([i % 5, 1, 2, 3]), // 5 conteúdos diferentes
    })),
  };
}

const group = (code: string, imageIndexes: number[]) => ({ key: code, main_code: code, imageIndexes }) as ImportGroup;

/** Supabase falso: guarda o que foi enviado e falha conforme `fail`. */
function fakeSupabase(fail: (path: string, attempt: number) => string | null, existing: { product_id: string; sha256: string }[] = []) {
  const uploaded = new Set<string>();
  const rows: unknown[] = [];
  const attempts = new Map<string, number>();
  const client = {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          const n = (attempts.get(path) ?? 0) + 1;
          attempts.set(path, n);
          const msg = fail(path, n);
          if (msg) return { error: { message: msg } };
          if (uploaded.has(path)) return { error: { message: "The resource already exists" } };
          uploaded.add(path);
          return { error: null };
        },
      }),
    },
    from: () => ({
      select: () => ({ in: async () => ({ data: existing, error: null }) }),
      upsert: async (row: unknown) => {
        rows.push(row);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, uploaded, rows };
}

test("envia as fotos, pula repetidas, formatos não suportados e produtos sem cadastro", async () => {
  const sheet = sheetWith(12);
  const groups = [group("A", [0, 1, 2, 5]), group("B", [3, 4, 11]), group("SEM", [6, 7])];
  const fake = fakeSupabase(() => null);
  const r = await uploadPhotos(fake.client, sheet, groups, (g) => (g.key === "SEM" ? undefined : `pid-${g.key}`), "teste", () => {});
  // A: conteúdos 0,1,2,0 → 3 fotos (a 4ª é igual à 1ª); B: 3,4 → 2 fotos; índice 11 é .emf
  assert.equal(r.sent, 5);
  assert.equal(r.alreadyThere, 1);
  assert.equal(r.unsupported, 1);
  assert.equal(r.noProduct, 2);
  assert.equal(r.failed.length, 0);
  assert.equal(fake.uploaded.size, 5);
  assert.equal(fake.rows.length, 5);
});

test("não reenvia fotos que já estão no sistema", async () => {
  const sheet = sheetWith(3);
  const sha = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([0, 1, 2, 3]))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const fake = fakeSupabase(() => null, [{ product_id: "pid-A", sha256: sha }]);
  const r = await uploadPhotos(fake.client, sheet, [group("A", [0, 1])], () => "pid-A", "teste", () => {});
  assert.equal(r.alreadyThere, 1);
  assert.equal(r.sent, 1);
});

test("para cedo e explica quando o armazenamento não existe", async () => {
  const sheet = sheetWith(60);
  const groups = Array.from({ length: 59 }, (_, i) => group(`P${i}`, [i]));
  const fake = fakeSupabase(() => "Bucket not found");
  const r = await uploadPhotos(fake.client, sheet, groups, (g) => g.key, "teste", () => {});
  assert.match(r.stoppedBy ?? "", /product-images.*não existe/);
  assert.ok(r.failed.length < 20, `parou cedo (${r.failed.length} tentativas)`);
});

test("tenta de novo em falha de rede e continua quando uma foto falha", async () => {
  const sheet = sheetWith(6);
  const groups = [group("A", [0]), group("B", [1]), group("C", [2]), group("D", [3])];
  // A: falha de rede só na 1ª tentativa; C: erro permanente
  const fake = fakeSupabase((path, attempt) =>
    path.includes("pid-A") && attempt === 1 ? "fetch failed" : path.includes("pid-C") ? "invalid mime type" : null,
  );
  const r = await uploadPhotos(fake.client, sheet, groups, (g) => `pid-${g.key}`, "teste", () => {});
  assert.equal(r.sent, 3);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].code, "C");
  assert.equal(r.stoppedBy, undefined);
});
