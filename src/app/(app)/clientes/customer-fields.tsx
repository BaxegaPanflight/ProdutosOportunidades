import { Field, Input, Select, Textarea } from "@/components/ui";

export function CustomerFields({
  segments,
  customer,
}: {
  segments: { id: string; name: string }[];
  customer?: Record<string, string | number | null>;
}) {
  const v = (k: string) => (customer?.[k] ?? "") as string;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Nome *" className="sm:col-span-2">
        <Input name="name" defaultValue={v("name")} required />
      </Field>
      <Field label="Região" hint="Ex.: Centro-Oeste, Sul, Exterior">
        <Input name="region" defaultValue={v("region")} list="regions-list" />
        <datalist id="regions-list">
          {["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul", "Exterior"].map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </Field>
      <Field label="UF">
        <Input name="state" defaultValue={v("state")} maxLength={2} className="uppercase" />
      </Field>
      <Field label="Cidade">
        <Input name="city" defaultValue={v("city")} />
      </Field>
      <Field label="País">
        <Input name="country" defaultValue={v("country") || "Brasil"} />
      </Field>
      <Field label="Segmento">
        <Select name="segment_id" defaultValue={v("segment_id")}>
          <option value="">—</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Importância" hint="1 (baixa) a 5 (estratégico)">
        <Select name="importance" defaultValue={String(customer?.importance ?? "")}>
          <option value="">—</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Observações" className="sm:col-span-2 lg:col-span-4">
        <Textarea name="notes" defaultValue={v("notes")} rows={2} />
      </Field>
    </div>
  );
}
