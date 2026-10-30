import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

const PUBLIC_PATHS = ["/login", "/auth"];
const TIMEOUT_MS = 8000;

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    // sem limite, um Supabase fora do ar deixa a página presa até a Vercel desistir (504)
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS) }) },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Não coloque código entre createServerClient e getClaims (renovação da sessão)
  // limite no total (a biblioteca repete tentativas sozinha)
  const { data, error } = await Promise.race([
    supabase.auth.getClaims(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
  ]).catch((e: Error) => ({ data: null, error: e }));
  if (error && /fetch|abort|timeout|network/i.test(`${error.name} ${error.message}`)) {
    throw new Error(
      `O banco de dados (Supabase) não respondeu em ${TIMEOUT_MS / 1000} segundos. ` +
        "Se o projeto estiver pausado, reative-o em supabase.com/dashboard (botão Restore project) e tente de novo.",
    );
  }
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!data?.claims && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(to);
  }
  return response;
}
