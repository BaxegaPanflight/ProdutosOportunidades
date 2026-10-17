"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { normCode } from "@/lib/codes";

/** Campo de código que avisa na hora se o código já existe em outro produto. */
export function CodeInput({
  name,
  defaultValue,
  exceptProductId,
  required,
}: {
  name: string;
  defaultValue?: string;
  exceptProductId?: string;
  required?: boolean;
}) {
  const [hit, setHit] = useState<{ id: string; code: string } | null>(null);

  async function check(value: string) {
    const norm = normCode(value);
    if (!norm) return setHit(null);
    const supabase = createClient();
    const { data } = await supabase
      .from("product_codes")
      .select("product_id, products(main_code)")
      .eq("code_norm", norm)
      .maybeSingle();
    if (data && data.product_id !== exceptProductId) {
      const p = data.products as unknown as { main_code: string } | null;
      setHit({ id: data.product_id as string, code: p?.main_code ?? value });
    } else setHit(null);
  }

  return (
    <div>
      <Input
        name={name}
        defaultValue={defaultValue}
        required={required}
        autoComplete="off"
        className="font-mono"
        onBlur={(e) => check(e.currentTarget.value)}
      />
      {hit && (
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
          Este código já está cadastrado no produto{" "}
          <Link href={`/produtos/${hit.id}`} className="font-semibold underline">
            {hit.code}
          </Link>
          . Registre a nova demanda nele em vez de criar outro produto.
        </p>
      )}
    </div>
  );
}
