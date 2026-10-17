import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Aguardando aprovação" };

export default async function Aguardando() {
  const { profile } = await getSession();
  if (!profile) redirect("/login");
  if (profile.active) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-panel p-6 text-center">
        <Logo className="mx-auto mb-5 w-48" />
        <h1 className="text-lg font-semibold">Acesso aguardando aprovação</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Sua conta ({profile.email}) foi criada. Um usuário da Diretoria precisa liberar o seu acesso e definir o
          seu perfil.
        </p>
        <form action="/auth/sair" method="post" className="mt-6">
          <button className="text-sm text-brand-700 hover:underline">Sair</button>
        </form>
      </div>
    </main>
  );
}
