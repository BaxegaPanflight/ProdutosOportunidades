"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/errors";

const s = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

function fields(fd: FormData) {
  const imp = s(fd, "importance");
  return {
    name: s(fd, "name"),
    region: s(fd, "region"),
    state: s(fd, "state")?.toUpperCase() ?? null,
    city: s(fd, "city"),
    country: s(fd, "country") ?? "Brasil",
    segment_id: s(fd, "segment_id"),
    importance: imp ? Number(imp) : null,
    notes: s(fd, "notes"),
  };
}

export async function createCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const f = fields(fd);
  if (!f.name) return { error: "Informe o nome." };
  const { error } = await supabase.from("customers").insert(f);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/clientes");
  return { ok: true, message: "Cliente cadastrado." };
}

export async function updateCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const id = s(fd, "id")!;
  const f = fields(fd);
  if (!f.name) return { error: "Informe o nome." };
  const { error } = await supabase.from("customers").update(f).eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return { ok: true, message: "Cliente salvo." };
}

export async function deleteCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const { data, error } = await supabase.from("customers").delete().eq("id", s(fd, "id")!).select("id");
  if (error) return { error: friendlyError(error) };
  if (!data?.length) return { error: "Seu perfil não tem permissão para excluir." };
  revalidatePath("/clientes");
  redirect("/clientes");
}
