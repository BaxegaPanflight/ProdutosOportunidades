import { requireMember } from "@/lib/auth";
import { ROLE } from "@/lib/labels";
import { Shell } from "./shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, can } = await requireMember();
  return (
    <Shell
      nav={{ canImport: can.import, canManageUsers: can.manageUsers, canManageLists: can.delete }}
      userName={profile.full_name ?? profile.email ?? ""}
      roleLabel={ROLE[profile.role]}
    >
      {children}
    </Shell>
  );
}
