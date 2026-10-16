import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms";
import { Card, Input, PageHeader, Select, Table } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { addItem, deleteItem, mergeManufacturer, renameItem } from "./actions";

export const metadata = { title: "Cadastros" };

export default async function CadastrosPage() {
  const { supabase, can } = await requireMember();
  const [{ data: mans }, { data: segs }, { data: techs }] = await Promise.all([
    supabase.from("manufacturers").select("id, name, products(count)").order("name"),
    supabase.from("segments").select("id, name, product_segments(count)").order("sort_order").order("name"),
    supabase.from("technologies").select("id, name, category, product_technologies(count)").order("sort_order").order("name"),
  ]);
  const count = (r: Record<string, unknown>, k: string) => (r[k] as { count: number }[] | undefined)?.[0]?.count ?? 0;

  return (
    <>
      <PageHeader title="Cadastros" subtitle="Listas usadas nos produtos" />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card title={`Fabricantes (${mans?.length ?? 0})`} bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <th>Nome</th>
                <th className="text-right">Produtos</th>
                {can.delete && <th>Unificar com</th>}
                {can.delete && <th></th>}
              </tr>
            </thead>
            <tbody>
              {(mans ?? []).map((m) => (
                <tr key={m.id}>
                  <td>
                    <ActionForm action={renameItem} resetOnSuccess={false} className="flex gap-1">
                      <input type="hidden" name="table" value="manufacturers" />
                      <input type="hidden" name="id" value={m.id} />
                      <Input name="name" defaultValue={m.name} className="h-8" aria-label="Nome do fabricante" />
                      <SubmitButton variant="ghost" size="sm" pendingText="…">
                        Salvar
                      </SubmitButton>
                    </ActionForm>
                  </td>
                  <td className="text-right tabular-nums">{count(m, "products")}</td>
                  {can.delete && (
                    <td>
                      <ActionForm action={mergeManufacturer} className="flex gap-1">
                        <input type="hidden" name="id" value={m.id} />
                        <Select name="into" defaultValue="" className="h-8 w-40 text-xs" aria-label="Unificar com">
                          <option value="">—</option>
                          {(mans ?? [])
                            .filter((o) => o.id !== m.id)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                        </Select>
                        <SubmitButton variant="ghost" size="sm" pendingText="…">
                          Unificar
                        </SubmitButton>
                      </ActionForm>
                    </td>
                  )}
                  {can.delete && (
                    <td className="text-right">
                      {count(m, "products") === 0 && (
                        <DeleteButton action={deleteItem} fields={{ table: "manufacturers", id: m.id }} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
          <ActionForm action={addItem} className="flex gap-2 border-t border-line p-4">
            <input type="hidden" name="table" value="manufacturers" />
            <Input name="name" placeholder="Novo fabricante" required />
            <SubmitButton variant="secondary">Adicionar</SubmitButton>
          </ActionForm>
        </Card>

        <div className="flex flex-col gap-4">
          {[
            { title: "Segmentos", table: "segments", rows: segs ?? [], rel: "product_segments" },
            { title: "Tecnologias e processos", table: "technologies", rows: techs ?? [], rel: "product_technologies" },
          ].map((list) => (
            <Card key={list.table} title={list.title} bodyClassName="p-0">
              <Table>
                <tbody>
                  {list.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {can.delete ? (
                          <ActionForm action={renameItem} resetOnSuccess={false} className="flex gap-1">
                            <input type="hidden" name="table" value={list.table} />
                            <input type="hidden" name="id" value={r.id} />
                            <Input name="name" defaultValue={r.name} className="h-8" aria-label="Nome" />
                            <SubmitButton variant="ghost" size="sm" pendingText="…">
                              Salvar
                            </SubmitButton>
                          </ActionForm>
                        ) : (
                          r.name
                        )}
                      </td>
                      <td className="text-xs text-ink-faint">{"category" in r ? String(r.category) : ""}</td>
                      <td className="text-right tabular-nums">{count(r, list.rel)} produtos</td>
                      {can.delete && (
                        <td className="text-right">
                          {count(r, list.rel) === 0 && (
                            <DeleteButton action={deleteItem} fields={{ table: list.table, id: r.id }} />
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
              {can.delete && (
                <ActionForm action={addItem} className="flex gap-2 border-t border-line p-4">
                  <input type="hidden" name="table" value={list.table} />
                  <Input name="name" placeholder="Novo item" required />
                  {list.table === "technologies" && (
                    <Select name="category" defaultValue="sensor" className="w-32">
                      <option value="sensor">Sensor</option>
                      <option value="processo">Processo</option>
                    </Select>
                  )}
                  <SubmitButton variant="secondary">Adicionar</SubmitButton>
                </ActionForm>
              )}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
