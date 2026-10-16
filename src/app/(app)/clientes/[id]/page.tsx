import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms";
import { Badge, Card, Empty, PageHeader, Table } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtNum } from "@/lib/format";
import { KIND, ORIGIN } from "@/lib/labels";
import type { DemandKind, DemandOrigin } from "@/lib/import/types";
import { deleteCustomer, updateCustomer } from "../actions";
import { CustomerFields } from "../customer-fields";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, can } = await requireMember();
  const [{ data: customer }, { data: segments }, { data: demands }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("segments").select("id, name").order("sort_order"),
    supabase
      .from("demands")
      .select("id, origin, kind, requested_at, quantity, quantity_period, source, products(id, main_code, description)")
      .eq("customer_id", id)
      .order("requested_at", { ascending: false, nullsFirst: false }),
  ]);
  if (!customer) notFound();

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/clientes" className="text-brand-700 hover:underline">
          ← Clientes
        </Link>
      </div>
      <PageHeader
        title={customer.name}
        subtitle={[customer.city, customer.state, customer.region].filter(Boolean).join(" · ") || undefined}
        actions={
          can.delete && (
            <DeleteButton
              action={deleteCustomer}
              fields={{ id }}
              label="Excluir cliente"
              confirmText="Excluir este cliente? As demandas continuam, sem cliente associado."
            />
          )
        }
      />
      <div className="flex flex-col gap-4">
        <Card title="Dados">
          <ActionForm action={updateCustomer} resetOnSuccess={false}>
            <input type="hidden" name="id" value={id} />
            <CustomerFields segments={segments ?? []} customer={customer} />
            <div className="mt-3 flex justify-end">
              <SubmitButton>Salvar</SubmitButton>
            </div>
          </ActionForm>
        </Card>
        <Card title={`Produtos que este cliente pediu (${demands?.length ?? 0})`} bodyClassName="p-0">
          {!demands?.length ? (
            <Empty>Nenhuma demanda.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Origem</th>
                  <th>Tipo</th>
                  <th className="text-right">Qtd.</th>
                  <th>Fonte</th>
                </tr>
              </thead>
              <tbody>
                {demands.map((d) => {
                  const p = d.products as unknown as { id: string; main_code: string; description: string | null };
                  return (
                    <tr key={d.id}>
                      <td className="whitespace-nowrap">{fmtDate(d.requested_at)}</td>
                      <td>
                        <Link href={`/produtos/${p.id}?aba=demandas`} className="font-mono text-brand-700 hover:underline">
                          {p.main_code}
                        </Link>{" "}
                        <span className="text-ink-soft">{p.description}</span>
                      </td>
                      <td>
                        <Badge tone={ORIGIN[d.origin as DemandOrigin].tone}>{ORIGIN[d.origin as DemandOrigin].label}</Badge>
                      </td>
                      <td>{KIND[d.kind as DemandKind]}</td>
                      <td className="text-right tabular-nums">
                        {d.quantity !== null ? fmtNum(d.quantity) : "—"}
                        {d.quantity_period && <span className="text-xs text-ink-faint"> /{d.quantity_period}</span>}
                      </td>
                      <td>{d.source ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
