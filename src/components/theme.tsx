"use client";

import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_KEY as KEY } from "@/lib/theme-script";

export type ThemeChoice = "light" | "dark" | "system";

function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Automático (segue o aparelho)", icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    setChoice(readChoice());
  }, []);

  // no modo automático, acompanha a troca de tema do aparelho
  useEffect(() => {
    if (choice !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  function choose(next: ThemeChoice) {
    setChoice(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // navegação privada: o tema vale só até fechar a página
    }
    applyTheme(next);
  }

  return (
    <div role="radiogroup" aria-label="Tema" className={clsx("inline-flex rounded-md border border-line bg-surface p-0.5", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          title={label}
          onClick={() => choose(value)}
          className={clsx(
            "flex size-7 items-center justify-center rounded transition-colors",
            choice === value ? "bg-panel text-brand-700 shadow-sm" : "text-ink-faint hover:text-ink",
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
