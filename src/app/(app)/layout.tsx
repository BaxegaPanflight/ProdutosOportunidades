import { requireMember } from "@/lib/auth";
import { ROLE } from "@/lib/labels";
import { Nav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, can } = await requireMember();
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-line bg-white lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-700">Panflight</div>
            <div className="text-sm font-semibold text-ink">Oportunidades</div>
          </div>
        </div>
        <Nav canImport={can.import} canManageUsers={can.manageUsers} canManageLists={can.delete} />
        <div className="hidden border-t border-line px-4 py-3 text-xs lg:absolute lg:bottom-0 lg:block lg:w-full">
          <div className="truncate font-medium text-ink">{profile.full_name ?? profile.email}</div>
          <div className="text-ink-faint">{ROLE[profile.role]}</div>
          <form action="/auth/sair" method="post" className="mt-2">
            <button className="text-brand-700 hover:underline">Sair</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
