import { LoginForms } from "./login-forms";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-sm">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-brand-700">Panflight</div>
          <h1 className="mt-1 text-lg font-semibold">Oportunidades de desenvolvimento</h1>
        </div>
        {sp.erro && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{sp.erro}</p>}
        <LoginForms next={sp.next ?? "/"} />
      </div>
    </main>
  );
}
