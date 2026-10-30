import { cookies } from "next/headers";
import { requireMember } from "@/lib/auth";
import { ROLE } from "@/lib/labels";
import { MENU_COOKIE } from "@/lib/menu";
import { Shell } from "./shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, can } = await requireMember();
  // menu recolhido ou não: última escolha do usuário (lida aqui para não "pular" ao carregar)
  const collapsed = (await cookies()).get(MENU_COOKIE)?.value === "1";
  return (
    <Shell
      nav={{ canImport: can.import, canManageUsers: can.manageUsers, canManageLists: can.delete }}
      userName={profile.full_name ?? profile.email ?? ""}
      roleLabel={ROLE[profile.role]}
      initialCollapsed={collapsed}
    >
      {children}
    </Shell>
  );
}
