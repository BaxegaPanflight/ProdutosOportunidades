"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/errors";

const TABLES = new Set(["manufacturers", "segments", "technologies"]);
const s = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

export async function addItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const table = s(fd, "table")!;
  if (!TABLES.has(table)) return { error: "Operação inválida." };
  const name = s(fd, "name");
  if (!name) return { error: "Informe o nome." };
  const row: Record<string, string> = { name };
  if (table === "technologies") row.category = s(fd, "category") ?? "sensor";
  const { error } = await supabase.from(table).insert(row);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/cadastros");
  return { ok: true, message: "Adicionado." };
}

export async function renameItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const table = s(fd, "table")!;
  if (!TABLES.has(table)) return { error: "Operação inválida." };
  const { data, error } = await supabase.from(table).update({ name: s(fd, "name") }).eq("id", s(fd, "id")!).select("id");
  if (error) return { error: friendlyError(error) };
  if (!data?.length) return { error: "Sem permissão." };
  revalidatePath("/cadastros");
  return { ok: true };
}

export async function deleteItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const table = s(fd, "table")!;
  if (!TABLES.has(table)) return { error: "Operação inválida." };
  const { data, error } = await supabase.from(table).delete().eq("id", s(fd, "id")!).select("id");
  if (error) return { error: friendlyError(error) };
  if (!data?.length) return { error: "Sem permissão." };
  revalidatePath("/cadastros");
  return { ok: true };
}

/** Junta dois fabricantes (ex.: "JD" e "John Deere"): move os produtos e apaga o duplicado. */
export async function mergeManufacturer(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, can } = await requireMember();
  if (!can.delete) return { error: "Apenas Diretoria ou Supervisão." };
  const from = s(fd, "id")!;
  const to = s(fd, "into");
  if (!to || to === from) return { error: "Escolha o fabricante de destino." };
  const { error } = await supabase.from("products").update({ manufacturer_id: to }).eq("manufacturer_id", from);
  if (error) return { error: friendlyError(error) };
  const { error: e2 } = await supabase.from("manufacturers").delete().eq("id", from);
  if (e2) return { error: friendlyError(e2) };
  revalidatePath("/cadastros");
  revalidatePath("/produtos");
  return { ok: true, message: "Fabricantes unificados." };
}
