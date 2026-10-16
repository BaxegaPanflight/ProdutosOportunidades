import { Field, Input, Select, Textarea } from "@/components/ui";
import { STATUS, STATUS_ORDER } from "@/lib/labels";
import { CodeInput } from "./code-input";

export interface Lookup {
  id: string;
  name: string;
}

export function ProductFields({
  manufacturers,
  segments,
  technologies,
  product,
  selectedSegments = [],
  selectedTechnologies = [],
  showStatus = true,
}: {
  manufacturers: Lookup[];
  segments: Lookup[];
  technologies: (Lookup & { category?: string })[];
  product?: {
    id: string;
    main_code: string;
    description: string | null;
    manufacturer: string | null;
    application: string | null;
    equipment: string | null;
    notes: string | null;
  };
  selectedSegments?: string[];
  selectedTechnologies?: string[];
  showStatus?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Código principal *">
        <CodeInput name="main_code" defaultValue={product?.main_code} exceptProductId={product?.id} required />
      </Field>
      <Field label="Fabricante" hint="Escolha da lista ou digite um novo">
        <Input name="manufacturer" list="manufacturers-list" defaultValue={product?.manufacturer ?? ""} />
        <datalist id="manufacturers-list">
          {manufacturers.map((m) => (
            <option key={m.id} value={m.name} />
          ))}
        </datalist>
      </Field>
      <Field label="Descrição" className="sm:col-span-2">
        <Input name="description" defaultValue={product?.description ?? ""} />
      </Field>
      <Field label="Aplicação / função" className="sm:col-span-2">
        <Textarea name="application" defaultValue={product?.application ?? ""} rows={2} />
      </Field>
      <Field label="Equipamentos e modelos" className="sm:col-span-2" hint="Ex.: colheitadeiras S700, plantadeiras 2130…">
        <Textarea name="equipment" defaultValue={product?.equipment ?? ""} rows={2} />
      </Field>
      {showStatus && (
        <Field label="Status">
          <Select name="status" defaultValue="cadastrado">
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-xs font-medium text-ink-soft">Segmentos</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {segments.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="segments" value={s.id} defaultChecked={selectedSegments.includes(s.id)} />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-xs font-medium text-ink-soft">Tecnologias / processos</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {technologies.map((t) => (
            <label key={t.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="technologies"
                value={t.id}
                defaultChecked={selectedTechnologies.includes(t.id)}
              />
              {t.name}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Observações" className="sm:col-span-2">
        <Textarea name="notes" defaultValue={product?.notes ?? ""} rows={2} />
      </Field>
    </div>
  );
}
