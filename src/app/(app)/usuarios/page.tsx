import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, PageHeader, Select, Table } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { ROLE } from "@/lib/labels";
import { updateUser } from "./actions";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const { supabase, can, profile } = await requireMember();
  if (!can.manageUsers) redirect("/produtos");
  const { data: users } = await supabase.from("profiles").select("*").order("active").order("full_name");

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle="Novos cadastros chegam inativos. Ative e escolha o perfil de cada pessoa."
      />
      <Card bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Desde</th>
              <th>Perfil e acesso</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="font-medium">
                  {u.full_name ?? "—"} {!u.active && <Badge tone="amber">aguardando</Badge>}
                </td>
                <td>{u.email}</td>
                <td>{fmtDate(u.created_at)}</td>
                <td>
                  <ActionForm action={updateUser} resetOnSuccess={false} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="id" value={u.id} />
                    <Select name="role" defaultValue={u.role} className="h-8 w-36" disabled={u.id === profile.id}>
                      {Object.entries(ROLE).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="active" defaultChecked={u.active} disabled={u.id === profile.id} />
                      Ativo
                    </label>
                    {u.id !== profile.id && (
                      <SubmitButton size="sm" variant="secondary">
                        Salvar
                      </SubmitButton>
                    )}
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <div className="mt-4 grid gap-3 text-sm text-ink-soft sm:grid-cols-3">
        <p>
          <b className="text-ink">Diretoria:</b> tudo, inclusive usuários, dados financeiros e estratégicos.
        </p>
        <p>
          <b className="text-ink">Supervisão:</b> tudo, exceto gerenciar usuários. Pode importar e excluir.
        </p>
        <p>
          <b className="text-ink">Operação:</b> cadastra e consulta produtos, demandas, amostras e clientes. Não vê
          mercado, preços, pareceres nem histórico.
        </p>
      </div>
    </>
  );
}
