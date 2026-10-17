import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (error) {
    // Mostra o motivo em vez da página genérica MIDDLEWARE_INVOCATION_FAILED da Vercel
    const message = error instanceof Error ? error.message : String(error);
    console.error("[middleware]", error);
    // Diagnóstico: só nomes das variáveis, nunca os valores
    const found = Object.keys(process.env).filter((k) => k.toUpperCase().includes("SUPABASE"));
    const diag = [
      `Ambiente: ${process.env.VERCEL_ENV ?? "local"}`,
      `Deploy (commit): ${process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "-"}`,
      `URL definida: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "sim" : "não"}`,
      `Chave definida: ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "sim" : "não"}`,
      `Variáveis com SUPABASE no nome: ${found.length ? found.map((k) => JSON.stringify(k)).join(", ") : "nenhuma"}`,
    ].join("\n");
    return new NextResponse(`Erro de configuração do sistema:\n\n${message}\n\n${diag}`, {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
