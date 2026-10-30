"use client";

import clsx from "clsx";
import { ChevronsLeft, ChevronsRight, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo, LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { MENU_COOKIE } from "@/lib/menu";
import { Nav, type NavProps } from "./nav";

/**
 * Estrutura das páginas internas: menu lateral no computador (pode ser
 * recolhido só para os ícones) e, no celular, barra no topo com o menu em gaveta.
 */
export function Shell({
  nav,
  userName,
  roleLabel,
  initialCollapsed,
  children,
}: {
  nav: NavProps;
  userName: string;
  roleLabel: string;
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // recolhido vale só no computador; no celular a gaveta é sempre completa
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const path = usePathname();

  function toggleCollapsed() {
    setCollapsed((c) => {
      document.cookie = `${MENU_COOKIE}=${c ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`;
      return !c;
    });
  }

  // fecha a gaveta ao trocar de página
  useEffect(() => setOpen(false), [path]);

  // Ctrl+B (⌘+B no Mac) recolhe/expande o menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b" && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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

  /** esconde no computador quando o menu está recolhido */
  const wide = collapsed ? "lg:hidden" : "";

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
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-panel transition-[transform,width] duration-200",
          "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:max-w-none lg:translate-x-0 lg:shrink-0",
          collapsed ? "lg:w-[4.5rem]" : "lg:w-64",
          open ? "translate-x-0 shadow-xl" : "-translate-x-full",
        )}
      >
        {/* botão de recolher, na borda do menu (computador) */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={`${collapsed ? "Expandir" : "Recolher"} menu (Ctrl+B)`}
          aria-expanded={!collapsed}
          aria-controls="menu-lateral"
          className="absolute -right-3 top-7 z-10 hidden size-6 items-center justify-center rounded-full border border-line bg-panel text-ink-soft shadow-sm hover:border-brand-600 hover:text-brand-700 lg:flex"
        >
          {collapsed ? <ChevronsRight className="size-3.5" aria-hidden /> : <ChevronsLeft className="size-3.5" aria-hidden />}
        </button>

        <div className={clsx("flex items-start justify-between gap-2 pb-4 pt-5", collapsed ? "px-5 lg:justify-center lg:px-2" : "px-5")}>
          <Link href="/produtos" className={clsx("block w-44", wide)} aria-label="Início">
            <Logo />
          </Link>
          {collapsed && (
            <Link href="/produtos" className="hidden w-12 lg:block" aria-label="Início" title="Panflight · Oportunidades">
              <LogoMark />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="-mr-2 -mt-1 flex size-9 items-center justify-center rounded-md text-ink-soft hover:bg-surface lg:hidden"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div
          className={clsx(
            "mb-3 border-b border-line pb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint",
            collapsed ? "mx-5 lg:mx-3 lg:text-transparent lg:select-none" : "mx-5",
          )}
        >
          <span className={wide}>Oportunidades</span>
        </div>

        <div className={clsx("min-h-0 flex-1 overflow-y-auto", collapsed ? "px-3 lg:px-2" : "px-3")}>
          <Nav {...nav} collapsed={collapsed} />
        </div>

        <div className={clsx("border-t border-line py-4", collapsed ? "px-5 lg:px-2" : "px-5")}>
          <div className={clsx("flex items-center justify-between gap-2", collapsed && "lg:flex-col")}>
            <div className={clsx("min-w-0 text-xs", wide)}>
              <div className="truncate font-medium text-ink">{userName}</div>
              <div className="text-ink-faint">{roleLabel}</div>
            </div>
            {collapsed && (
              <div
                className="hidden size-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800 lg:flex"
                title={`${userName} · ${roleLabel}`}
              >
                {initials(userName)}
              </div>
            )}
            <ThemeToggle vertical={collapsed} />
          </div>
          <form action="/auth/sair" method="post" className={clsx("mt-3", collapsed && "lg:flex lg:justify-center")}>
            <button className="flex items-center gap-2 text-sm text-ink-soft hover:text-brand-700" title="Sair">
              <LogOut className="size-4" aria-hidden />
              <span className={wide}>Sair</span>
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">{children}</main>
    </div>
  );
}

function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
