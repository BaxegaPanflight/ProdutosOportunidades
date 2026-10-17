"use client";

import clsx from "clsx";
import { Boxes, FileUp, ListTree, PlusCircle, UserCircle, Users, Building2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavProps {
  canImport: boolean;
  canManageUsers: boolean;
  canManageLists: boolean;
}

export function Nav({ canImport, canManageUsers, canManageLists }: NavProps) {
  const path = usePathname();
  const items = [
    { href: "/produtos", label: "Produtos", icon: Boxes, match: (p: string) => p.startsWith("/produtos") && p !== "/produtos/novo" },
    { href: "/produtos/novo", label: "Novo produto", icon: PlusCircle, match: (p: string) => p === "/produtos/novo" },
    { href: "/clientes", label: "Clientes", icon: Building2 },
    ...(canImport ? [{ href: "/importar", label: "Importar planilha", icon: FileUp }] : []),
    { href: "/cadastros", label: canManageLists ? "Cadastros" : "Fabricantes", icon: ListTree },
    ...(canManageUsers ? [{ href: "/usuarios", label: "Usuários", icon: Users }] : []),
    { href: "/conta", label: "Minha conta", icon: UserCircle },
  ];
  return (
    <nav className="flex flex-col gap-0.5 pb-3">
      {items.map((it) => {
        const active = it.match ? it.match(path) : path.startsWith(it.href);
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors lg:py-2",
              active
                ? "bg-brand-50 font-semibold text-brand-800 before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-brand-700"
                : "text-ink-soft hover:bg-surface hover:text-ink",
            )}
          >
            <Icon className={clsx("size-[18px]", active ? "text-brand-700" : "text-ink-faint")} aria-hidden />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
