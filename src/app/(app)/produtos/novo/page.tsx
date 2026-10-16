import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { CODE_TYPE, KIND, ORIGIN } from "@/lib/labels";
import { createProduct } from "../actions";
import { ProductFields } from "../product-fields";

export const metadata = { title: "Novo produto" };

export default async function NovoProduto() {
  const { supabase } = await requireMember();
  const [mans, segs, techs, custs] = await Promise.all([
    supabase.from("manufacturers").select("id, name").order("name"),
    supabase.from("segments").select("id, name").order("sort_order").order("name"),
    supabase.from("technologies").select("id, name, category").order("sort_order").order("name"),
    supabase.from("customers").select("id, name").order("name"),
  ]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Novo produto"
        subtitle="Só o código é obrigatório. O que faltar aparece como pendência para completar depois."
      />
      <ActionForm action={createProduct} resetOnSuccess={false} className="flex flex-col gap-4">
        <Card title="Produto">
          <ProductFields manufacturers={mans.data ?? []} segments={segs.data ?? []} technologies={techs.data ?? []} />
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_12rem]">
            <Field label="Outros códigos (opcional)" hint="Um por linha ou separados por ponto e vírgula">
              <Textarea name="other_codes" rows={2} className="font-mono" />
            </Field>
            <Field label="Tipo desses códigos">
              <Select name="other_codes_type" defaultValue="equivalente">
                {Object.entries(CODE_TYPE)
                  .filter(([k]) => k !== "principal")
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card title="Foto (opcional)">
          <Input type="file" name="photo" accept="image/*" capture="environment" className="h-auto py-1.5" />
          <p className="mt-1 text-xs text-ink-faint">No celular, abre a câmera para fotografar a peça.</p>
        </Card>

        <Card title="Quem pediu / de onde veio (opcional)">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Origem">
              <Select name="d_origin" defaultValue="">
                <option value="">— não registrar agora —</option>
                {Object.entries(ORIGIN).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo">
              <Select name="d_kind" defaultValue="solicitacao">
                {Object.entries(KIND).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cliente">
              <Input name="d_customer" list="customers-list" />
              <datalist id="customers-list">
                {(custs.data ?? []).map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Quantidade">
              <Input name="d_quantity" inputMode="decimal" />
            </Field>
            <Field label="Data">
              <Input name="d_date" type="date" />
            </Field>
            <Field label="Fonte" hint="Visita, e-mail, telefone…">
              <Input name="d_source" placeholder="Visita" />
            </Field>
            <Field label="Observações" className="sm:col-span-3">
              <Textarea name="d_notes" rows={2} />
            </Field>
          </div>
        </Card>

        <div className="flex justify-end">
          <SubmitButton>Cadastrar produto</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
