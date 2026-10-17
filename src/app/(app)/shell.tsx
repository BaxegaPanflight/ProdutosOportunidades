"use client";

import clsx from "clsx";
import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { Nav, type NavProps } from "./nav";

/**
 * Estrutura das páginas internas: menu lateral fixo no computador e,
 * no celular, barra no topo com o menu em gaveta.
 */
export function Shell({
  nav,
  userName,
  roleLabel,
  children,
}: {
  nav: NavProps;
  userName: string;
  roleLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  // fecha a gaveta ao trocar de página
  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <div className="min-h-screen lg:flex">
      {/* barra do topo (celular e tablet) */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-panel/95 px-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="menu-lateral"
          className="flex size-10 items-center justify-center rounded-md text-ink hover:bg-surface"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Link href="/produtos" className="w-32" aria-label="Início">
          <Logo />
        </Link>
      </header>

      {/* fundo escuro atrás da gaveta */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={clsx(
          "fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        id="menu-lateral"
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-panel transition-transform duration-200",
          "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-64 lg:max-w-none lg:translate-x-0 lg:shrink-0",
          open ? "translate-x-0 shadow-xl" : "-translate-x-full",
        )}
      >
        <div className="flex items-start justify-between gap-2 px-5 pb-4 pt-5">
          <Link href="/produtos" className="block w-44" aria-label="Início">
            <Logo />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="-mr-2 -mt-1 flex size-9 items-center justify-center rounded-md text-ink-soft hover:bg-surface lg:hidden"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="mx-5 mb-3 border-b border-line pb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
          Oportunidades
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          <Nav {...nav} />
        </div>

        <div className="border-t border-line px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 text-xs">
              <div className="truncate font-medium text-ink">{userName}</div>
              <div className="text-ink-faint">{roleLabel}</div>
            </div>
            <ThemeToggle />
          </div>
          <form action="/auth/sair" method="post" className="mt-3">
            <button className="flex items-center gap-2 text-sm text-ink-soft hover:text-brand-700">
              <LogOut className="size-4" aria-hidden />
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">{children}</main>
    </div>
  );
}
