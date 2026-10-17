import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (error) {
    // Mostra o motivo em vez da página genérica MIDDLEWARE_INVOCATION_FAILED da Vercel
    const message = error instanceof Error ? error.message : String(error);
    console.error("[middleware]", error);
    return new NextResponse(`Erro de configuração do sistema:\n\n${message}`, {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
