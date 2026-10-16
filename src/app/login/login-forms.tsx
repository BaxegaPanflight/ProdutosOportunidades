"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { resetPassword, signIn, signUp } from "./actions";

export function LoginForms({ next }: { next: string }) {
  const [mode, setMode] = useState<"entrar" | "criar" | "senha">("entrar");
  return (
    <div>
      {mode === "entrar" && (
        <ActionForm action={signIn} resetOnSuccess={false} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={next} />
          <Field label="E-mail">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Senha">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
        </ActionForm>
      )}
      {mode === "criar" && (
        <ActionForm action={signUp} className="flex flex-col gap-3">
          <Field label="Nome">
            <Input name="full_name" required />
          </Field>
          <Field label="E-mail">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Senha" hint="Mínimo de 8 caracteres">
            <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <SubmitButton pendingText="Criando…">Criar conta</SubmitButton>
          <p className="text-xs text-ink-faint">Novas contas ficam aguardando aprovação da Diretoria.</p>
        </ActionForm>
      )}
      {mode === "senha" && (
        <ActionForm action={resetPassword} className="flex flex-col gap-3">
          <Field label="E-mail">
            <Input name="email" type="email" required />
          </Field>
          <SubmitButton pendingText="Enviando…">Enviar link</SubmitButton>
        </ActionForm>
      )}
      <div className="mt-5 flex justify-between text-sm">
        {mode !== "entrar" ? (
          <button className="text-brand-700 hover:underline" onClick={() => setMode("entrar")}>
            Voltar para entrar
          </button>
        ) : (
          <button className="text-brand-700 hover:underline" onClick={() => setMode("criar")}>
            Criar conta
          </button>
        )}
        {mode === "entrar" && (
          <button className="text-ink-soft hover:underline" onClick={() => setMode("senha")}>
            Esqueci a senha
          </button>
        )}
      </div>
    </div>
  );
}
