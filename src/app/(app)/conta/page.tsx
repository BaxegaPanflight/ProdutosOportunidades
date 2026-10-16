import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { ROLE } from "@/lib/labels";
import { updateName, updatePassword } from "./actions";

export const metadata = { title: "Minha conta" };

export default async function ContaPage() {
  const { profile } = await requireMember();
  return (
    <div className="max-w-xl">
      <PageHeader title="Minha conta" subtitle={`${profile.email} · ${ROLE[profile.role]}`} />
      <div className="flex flex-col gap-4">
        <Card title="Nome">
          <ActionForm action={updateName} resetOnSuccess={false} className="flex gap-2">
            <Input name="full_name" defaultValue={profile.full_name ?? ""} />
            <SubmitButton variant="secondary">Salvar</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Nova senha">
          <ActionForm action={updatePassword} className="flex flex-col gap-3">
            <Field label="Senha">
              <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
            </Field>
            <Field label="Repita a senha">
              <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
            </Field>
            <SubmitButton>Alterar senha</SubmitButton>
          </ActionForm>
        </Card>
        <form action="/auth/sair" method="post">
          <button className="text-sm text-brand-700 hover:underline">Sair da conta</button>
        </form>
      </div>
    </div>
  );
}
