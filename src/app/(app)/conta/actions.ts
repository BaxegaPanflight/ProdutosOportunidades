"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { friendlyError, type ActionState } from "@/lib/errors";

export async function updateName(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireMember();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: String(fd.get("full_name") ?? "").trim() || null })
    .eq("id", profile.id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Nome atualizado." };
}

export async function updatePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireMember();
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "As senhas não conferem." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true, message: "Senha alterada." };
}
