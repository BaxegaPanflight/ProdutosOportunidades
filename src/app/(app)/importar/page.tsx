import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { Importer } from "./importer";

export const metadata = { title: "Importar planilha" };

export default async function ImportarPage() {
  const { supabase, can } = await requireMember();
  if (!can.import) redirect("/produtos");
  const { data: batches } = await supabase
    .from("import_batches")
    .select("id, file_name, created_at, stats")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <>
      <PageHeader
        title="Importar planilha"
        subtitle="Formato atual do Filtro de Demandas. Nada é gravado antes de você revisar e confirmar."
      />
      <Importer />
      {!!batches?.length && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">Importações anteriores</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-white text-sm">
            {batches.map((b) => {
              const st = (b.stats ?? {}) as Record<string, number>;
              return (
                <li key={b.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                  <span className="font-medium">{b.file_name}</span>
                  <span className="text-ink-soft">
                    {fmtDate(b.created_at, true)} · {st.produtos_novos ?? 0} novos · {st.produtos_existentes ?? 0}{" "}
                    existentes · {st.demandas ?? 0} demandas
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
