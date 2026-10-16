"use client";

import clsx from "clsx";
import { Boxes, FileUp, ListTree, PlusCircle, UserCircle, Users, Building2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({
  canImport,
  canManageUsers,
  canManageLists,
}: {
  canImport: boolean;
  canManageUsers: boolean;
  canManageLists: boolean;
}) {
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
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:pb-0">
      {items.map((it) => {
        const active = it.match ? it.match(path) : path.startsWith(it.href);
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={clsx(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm",
              active ? "bg-brand-50 font-medium text-brand-800" : "text-ink-soft hover:bg-surface hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
