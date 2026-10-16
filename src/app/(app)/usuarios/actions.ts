"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/errors";

export async function updateUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, can } = await requireMember();
  if (!can.manageUsers) return { error: "Apenas a Diretoria gerencia usuários." };
  const { error } = await supabase
    .from("profiles")
    .update({ role: String(fd.get("role")), active: fd.get("active") === "on" })
    .eq("id", String(fd.get("id")));
  if (error) return { error: friendlyError(error) };
  revalidatePath("/usuarios");
  return { ok: true, message: "Salvo." };
}
