import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { btn, Card, Empty, Input, PageHeader, Table } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { createCustomer } from "./actions";
import { CustomerFields } from "./customer-fields";

export const metadata = { title: "Clientes" };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase } = await requireMember();
  let query = supabase
    .from("customers")
    .select("id, name, region, state, city, importance, segments(name), demands(count)")
    .order("name")
    .limit(500);
  if (q) query = query.ilike("name", `%${q}%`);
  const [{ data: customers }, { data: segments }] = await Promise.all([
    query,
    supabase.from("segments").select("id, name").order("sort_order"),
  ]);

  return (
    <>
      <PageHeader title="Clientes" subtitle="Empresas que pediram, cotaram ou forneceram amostras" />
      <form className="mb-4 flex gap-2" method="get">
        <Input name="q" defaultValue={q} placeholder="Buscar cliente…" className="max-w-sm" />
        <button className={btn("secondary")}>Buscar</button>
      </form>
      <div className="grid gap-4 xl:grid-cols-[1fr_28rem]">
        <Card bodyClassName="p-0">
          {!customers?.length ? (
            <Empty>Nenhum cliente.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Região / UF</th>
                  <th>Cidade</th>
                  <th>Segmento</th>
                  <th className="text-right">Importância</th>
                  <th className="text-right">Demandas</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clientes/${c.id}`} className="font-medium text-brand-700 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td>{[c.region, c.state].filter(Boolean).join(" / ") || "—"}</td>
                    <td>{c.city ?? "—"}</td>
                    <td>{(c.segments as unknown as { name: string } | null)?.name ?? "—"}</td>
                    <td className="text-right">{c.importance ?? "—"}</td>
                    <td className="text-right tabular-nums">
                      {(c.demands as unknown as { count: number }[])?.[0]?.count ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="Novo cliente">
          <ActionForm action={createCustomer}>
            <CustomerFields segments={segments ?? []} />
            <div className="mt-3 flex justify-end">
              <SubmitButton>Cadastrar</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
