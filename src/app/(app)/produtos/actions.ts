"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { normCode } from "@/lib/codes";
import { friendlyError, type ActionState } from "@/lib/errors";
import { parseLocaleNumber } from "@/lib/import/planilha";
import { IMAGE_BUCKET } from "@/lib/storage";

// ---------------------------------------------------------------------------
// leitura do formulário
// ---------------------------------------------------------------------------
const s = (fd: FormData, k: string): string | null => {
  const v = fd.get(k);
  if (v === null || typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};
const n = (fd: FormData, k: string): number | null => {
  const v = s(fd, k);
  return v === null ? null : parseLocaleNumber(v);
};
const all = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(Boolean);
const splitCodes = (t: string | null) =>
  (t ?? "")
    .split(/[\n;,]+/)
    .map((c) => c.trim())
    .filter((c) => normCode(c));

function done(productId: string, message = "Salvo."): ActionState {
  revalidatePath(`/produtos/${productId}`);
  revalidatePath("/produtos");
  return { ok: true, message };
}

/** Verifica se algum código já pertence a outro produto. */
async function findCodeOwner(
  supabase: Awaited<ReturnType<typeof requireMember>>["supabase"],
  codes: string[],
  exceptProductId?: string,
) {
  const norms = [...new Set(codes.map(normCode).filter(Boolean))];
  if (!norms.length) return null;
  const { data } = await supabase
    .from("product_codes")
    .select("code, product_id, products(main_code)")
    .in("code_norm", norms);
  const hit = (data ?? []).find((r) => r.product_id !== exceptProductId);
  if (!hit) return null;
  const owner = hit.products as unknown as { main_code: string } | null;
  return { code: hit.code as string, productId: hit.product_id as string, ownerCode: owner?.main_code ?? "" };
}

async function syncLinks(
  supabase: Awaited<ReturnType<typeof requireMember>>["supabase"],
  table: "product_segments" | "product_technologies",
  col: "segment_id" | "technology_id",
  productId: string,
  ids: string[],
) {
  const { data: current } = await supabase.from(table).select(col).eq("product_id", productId);
  const have = new Set((current ?? []).map((r) => (r as Record<string, string>)[col]));
  const want = new Set(ids);
  const toDel = [...have].filter((id) => !want.has(id));
  const toAdd = [...want].filter((id) => !have.has(id));
  if (toDel.length) {
    const { error } = await supabase.from(table).delete().eq("product_id", productId).in(col, toDel);
    if (error) return error;
  }
  if (toAdd.length) {
    const { error } = await supabase.from(table).insert(toAdd.map((id) => ({ product_id: productId, [col]: id })));
    if (error) return error;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Produto
// ---------------------------------------------------------------------------
export async function createProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const mainCode = s(fd, "main_code");
  if (!mainCode || !normCode(mainCode)) return { error: "Informe o código do produto." };
  const extraCodes = splitCodes(s(fd, "other_codes")).filter((c) => normCode(c) !== normCode(mainCode));

  const owner = await findCodeOwner(supabase, [mainCode, ...extraCodes]);
  if (owner) {
    return {
      error: `O código ${owner.code} já está cadastrado no produto ${owner.ownerCode}.`,
      link: { href: `/produtos/${owner.productId}`, label: "Abrir produto existente" },
    };
  }

  let manufacturerId: string | null = null;
  const manName = s(fd, "manufacturer");
  if (manName) {
    const { data, error } = await supabase.rpc("ensure_manufacturer", { p_name: manName });
    if (error) return { error: friendlyError(error) };
    manufacturerId = data as string;
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      main_code: mainCode,
      description: s(fd, "description"),
      manufacturer_id: manufacturerId,
      application: s(fd, "application"),
      equipment: s(fd, "equipment"),
      status: s(fd, "status") ?? "cadastrado",
      notes: s(fd, "notes"),
    })
    .select("id")
    .single();
  if (error || !product) return { error: friendlyError(error) };
  const id = product.id as string;

  if (extraCodes.length) {
    const { error: e } = await supabase.from("product_codes").insert(
      extraCodes.map((code) => ({ product_id: id, code, type: s(fd, "other_codes_type") ?? "equivalente", source: "cadastro" })),
    );
    if (e) return { error: friendlyError(e) };
  }
  await syncLinks(supabase, "product_segments", "segment_id", id, all(fd, "segments"));
  await syncLinks(supabase, "product_technologies", "technology_id", id, all(fd, "technologies"));

  // primeira demanda (opcional) — ex.: registro feito durante uma visita
  const origin = s(fd, "d_origin");
  if (origin) {
    let customerId: string | null = null;
    const cust = s(fd, "d_customer");
    if (cust) {
      const { data } = await supabase.rpc("ensure_customer", { p_name: cust });
      customerId = data as string;
    }
    const { error: e } = await supabase.from("demands").insert({
      product_id: id,
      origin,
      kind: s(fd, "d_kind") ?? "solicitacao",
      customer_id: customerId,
      quantity: n(fd, "d_quantity"),
      requested_at: s(fd, "d_date"),
      source: s(fd, "d_source") ?? "Cadastro manual",
      description_at_source: s(fd, "description"),
      notes: s(fd, "d_notes"),
    });
    if (e) return { error: `Produto criado, mas a demanda não foi salva: ${friendlyError(e)}` };
  }

  // foto (opcional)
  const photo = fd.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const err = await storeImage(supabase, id, photo);
    if (err) return { error: `Produto criado, mas a foto não foi salva: ${err}` };
  }

  revalidatePath("/produtos");
  redirect(`/produtos/${id}`);
}

export async function updateProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const id = s(fd, "id")!;
  const mainCode = s(fd, "main_code");
  if (!mainCode) return { error: "Informe o código principal." };

  const owner = await findCodeOwner(supabase, [mainCode], id);
  if (owner) {
    return {
      error: `O código ${owner.code} já está cadastrado no produto ${owner.ownerCode}.`,
      link: { href: `/produtos/${owner.productId}`, label: "Abrir" },
    };
  }

  let manufacturerId: string | null = null;
  const manName = s(fd, "manufacturer");
  if (manName) {
    const { data, error } = await supabase.rpc("ensure_manufacturer", { p_name: manName });
    if (error) return { error: friendlyError(error) };
    manufacturerId = data as string;
  }

  const { error } = await supabase
    .from("products")
    .update({
      main_code: mainCode,
      description: s(fd, "description"),
      manufacturer_id: manufacturerId,
      application: s(fd, "application"),
      equipment: s(fd, "equipment"),
      notes: s(fd, "notes"),
    })
    .eq("id", id);
  if (error) return { error: friendlyError(error) };

  const e1 = await syncLinks(supabase, "product_segments", "segment_id", id, all(fd, "segments"));
  const e2 = await syncLinks(supabase, "product_technologies", "technology_id", id, all(fd, "technologies"));
  if (e1 || e2) return { error: friendlyError(e1 ?? e2) };
  return done(id, "Dados do produto salvos.");
}

export async function setStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const id = s(fd, "id")!;
  const { error } = await supabase.from("products").update({ status: s(fd, "status") }).eq("id", id);
  if (error) return { error: friendlyError(error) };
  return done(id, "Status atualizado.");
}

export async function deleteProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, can } = await requireMember();
  if (!can.delete) return { error: "Apenas Diretoria ou Supervisão podem excluir produtos." };
  const id = s(fd, "id")!;
  const { data: imgs } = await supabase.from("product_images").select("storage_path").eq("product_id", id);
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { error: friendlyError(error) };
  if (imgs?.length) await supabase.storage.from(IMAGE_BUCKET).remove(imgs.map((i) => i.storage_path as string));
  revalidatePath("/produtos");
  redirect("/produtos");
}

// ---------------------------------------------------------------------------
// Registros ligados ao produto
// ---------------------------------------------------------------------------
export async function addCode(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const id = s(fd, "product_id")!;
  const codes = splitCodes(s(fd, "code"));
  if (!codes.length) return { error: "Informe o código." };
  const owner = await findCodeOwner(supabase, codes);
  if (owner) {
    return owner.productId === id
      ? { error: `O código ${owner.code} já está neste produto.` }
      : {
          error: `O código ${owner.code} já pertence ao produto ${owner.ownerCode}.`,
          link: { href: `/produtos/${owner.productId}`, label: "Abrir" },
        };
  }
  const { error } = await supabase.from("product_codes").insert(
    codes.map((code) => ({
      product_id: id,
      code,
      type: s(fd, "type") ?? "equivalente",
      source: s(fd, "source"),
      notes: s(fd, "notes"),
    })),
  );
  if (error) return { error: friendlyError(error) };
  return done(id, codes.length > 1 ? `${codes.length} códigos adicionados.` : "Código adicionado.");
}

export async function addDemand(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const id = s(fd, "product_id")!;
  let customerId: string | null = null;
  const cust = s(fd, "customer");
  if (cust) {
    const { data, error } = await supabase.rpc("ensure_customer", { p_name: cust });
    if (error) return { error: friendlyError(error) };
    customerId = data as string;
  }
  const { error } = await supabase.from("demands").insert({
    product_id: id,
    origin: s(fd, "origin") ?? "cliente",
    kind: s(fd, "kind") ?? "solicitacao",
    customer_id: customerId,
    requested_at: s(fd, "requested_at"),
    quantity: n(fd, "quantity"),
    quantity_period: s(fd, "quantity_period"),
    region: s(fd, "region"),
    source: s(fd, "source"),
    description_at_source: s(fd, "description_at_source"),
    notes: s(fd, "notes"),
  });
  if (error) return { error: friendlyError(error) };
  return done(id, "Demanda registrada.");
}

export async function addSample(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const id = s(fd, "product_id")!;
  const { error } = await supabase.from("samples").insert({
    product_id: id,
    quantity: n(fd, "quantity"),
    location: s(fd, "location"),
    status: s(fd, "status") ?? "em_estoque",
    supplier_name: s(fd, "supplier_name"),
    received_by: s(fd, "received_by"),
    received_at: s(fd, "received_at"),
    invoice_number: s(fd, "invoice_number"),
    must_return: fd.get("must_return") === "on",
    return_due: s(fd, "return_due"),
    notes: s(fd, "notes"),
  });
  if (error) return { error: friendlyError(error) };
  return done(id, "Amostra registrada.");
}

export async function updateSampleStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const id = s(fd, "product_id")!;
  const { error } = await supabase.from("samples").update({ status: s(fd, "status") }).eq("id", s(fd, "id")!);
  if (error) return { error: friendlyError(error) };
  return done(id, "Amostra atualizada.");
}

export async function addPrice(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const id = s(fd, "product_id")!;
  const value = n(fd, "value");
  if (value === null) return { error: "Informe o valor." };
  const { error } = await supabase.from("price_references").insert({
    product_id: id,
    kind: s(fd, "kind") ?? "outro",
    value,
    currency: s(fd, "currency") ?? "BRL",
    source: s(fd, "source"),
    reference_date: s(fd, "reference_date"),
    url: s(fd, "url"),
    notes: s(fd, "notes"),
  });
  if (error) return { error: friendlyError(error) };
  return done(id, "Preço registrado.");
}

export async function addMarket(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const id = s(fd, "product_id")!;
  const start = n(fd, "period_start");
  const end = n(fd, "period_end") ?? start;
  if (!start || !s(fd, "source")) return { error: "Informe a fonte e o período." };
  const { error } = await supabase.from("market_data").insert({
    product_id: id,
    source: s(fd, "source"),
    period_start: start,
    period_end: end,
    country: s(fd, "country"),
    quantity: n(fd, "quantity"),
    avg_unit_value_usd: n(fd, "avg_unit_value_usd"),
    total_value_usd: n(fd, "total_value_usd"),
    notes: s(fd, "notes"),
  });
  if (error) return { error: friendlyError(error) };
  return done(id, "Dado de mercado registrado.");
}

export async function addEvaluation(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireMember();
  const id = s(fd, "product_id")!;
  const { error } = await supabase.from("evaluations").insert({
    product_id: id,
    evaluator: s(fd, "evaluator") ?? profile.full_name,
    opinion: s(fd, "opinion"),
    recommendation: s(fd, "recommendation"),
    board_score: n(fd, "board_score"),
    technical_ease: n(fd, "technical_ease"),
  });
  if (error) return { error: friendlyError(error) };
  return done(id, "Parecer registrado.");
}

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------
async function storeImage(
  supabase: Awaited<ReturnType<typeof requireMember>>["supabase"],
  productId: string,
  file: File,
  caption?: string | null,
): Promise<string | null> {
  if (!file.type.startsWith("image/")) return "O arquivo precisa ser uma imagem.";
  if (file.size > 10 * 1024 * 1024) return "Imagem maior que 10 MB.";
  const buf = new Uint8Array(await file.arrayBuffer());
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const sha = Array.from(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, "0")).join("");
  const ext = (file.name.split(".").pop() || file.type.split("/")[1] || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `products/${productId}/${sha.slice(0, 32)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });
  if (upErr && !/exists|duplicate/i.test(upErr.message)) return upErr.message;
  const { error } = await supabase
    .from("product_images")
    .upsert(
      { product_id: productId, storage_path: path, sha256: sha, caption: caption ?? null, source: "upload" },
      { onConflict: "storage_path", ignoreDuplicates: true },
    );
  return error ? friendlyError(error) : null;
}

export async function uploadImage(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const id = s(fd, "product_id")!;
  const files = fd.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Escolha uma imagem." };
  for (const f of files) {
    const err = await storeImage(supabase, id, f, s(fd, "caption"));
    if (err) return { error: err };
  }
  return done(id, files.length > 1 ? `${files.length} fotos enviadas.` : "Foto enviada.");
}

// ---------------------------------------------------------------------------
// Exclusão genérica (RLS decide quem pode)
// ---------------------------------------------------------------------------
const DELETABLE = new Set([
  "product_codes",
  "demands",
  "samples",
  "price_references",
  "market_data",
  "evaluations",
  "product_images",
]);

export async function deleteRecord(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const table = s(fd, "table")!;
  const id = s(fd, "id")!;
  const productId = s(fd, "product_id")!;
  if (!DELETABLE.has(table)) return { error: "Operação inválida." };

  let storagePath: string | null = null;
  if (table === "product_images") {
    const { data } = await supabase.from("product_images").select("storage_path").eq("id", id).maybeSingle();
    storagePath = (data?.storage_path as string) ?? null;
  }
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) return { error: friendlyError(error) };
  if (!data?.length) return { error: "Seu perfil não tem permissão para excluir." };
  if (storagePath) await supabase.storage.from(IMAGE_BUCKET).remove([storagePath]);
  return done(productId, "Excluído.");
}
