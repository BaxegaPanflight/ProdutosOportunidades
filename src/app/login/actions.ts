"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/errors";

function safeNext(v: FormDataEntryValue | null) {
  const s = String(v ?? "/");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(fd.get("email") ?? "").trim(),
    password: String(fd.get("password") ?? ""),
  });
  if (error) {
    return {
      error: /confirm/i.test(error.message)
        ? "Confirme seu e-mail antes de entrar (veja sua caixa de entrada)."
        : "E-mail ou senha incorretos.",
    };
  }
  redirect(safeNext(fd.get("next")));
}

export async function signUp(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  const { data, error } = await supabase.auth.signUp({
    email: String(fd.get("email") ?? "").trim(),
    password,
    options: {
      data: { full_name: String(fd.get("full_name") ?? "").trim() },
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/");
  return { ok: true, message: "Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre." };
}

export async function resetPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";
  const { error } = await supabase.auth.resetPasswordForEmail(String(fd.get("email") ?? "").trim(), {
    redirectTo: `${origin}/auth/confirm?next=/conta`,
  });
  if (error) return { error: error.message };
  return { ok: true, message: "Se o e-mail estiver cadastrado, você receberá um link para criar nova senha." };
}
