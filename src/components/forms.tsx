"use client";

import clsx from "clsx";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/errors";
import { btn } from "./ui";

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  pendingText = "Salvando…",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clsx(btn(variant, size), className)}>
      {pending ? pendingText : children}
    </button>
  );
}

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Formulário ligado a uma Server Action: mostra erro/sucesso e limpa os campos ao salvar. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
          {state.link && (
            <a href={state.link.href} className="ml-2 font-medium underline">
              {state.link.label}
            </a>
          )}
        </p>
      )}
      {state?.ok && state.message && (
        <p role="status" className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.message}
        </p>
      )}
    </form>
  );
}

/** Botão de exclusão com confirmação. */
export function DeleteButton({
  action,
  fields,
  confirmText = "Excluir este registro?",
  label = "Excluir",
}: {
  action: Action;
  fields: Record<string, string>;
  confirmText?: string;
  label?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
      className="inline"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant="danger" size="sm" pendingText="…">
        {label}
      </SubmitButton>
      {state?.error && <span className="ml-2 text-xs text-red-700">{state.error}</span>}
    </form>
  );
}

/** Envia o formulário GET ao mudar um select (filtros). */
export function AutoSubmitSelect(props: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
