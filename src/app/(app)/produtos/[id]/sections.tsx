/* eslint-disable @typescript-eslint/no-explicit-any */
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms";
import { Badge, Card, Empty, Field, Input, Select, Table, Textarea } from "@/components/ui";
import type { Can } from "@/lib/auth";
import { requireMember } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { CODE_TYPE, KIND, ORIGIN, PRICE_KIND, RECOMMENDATION, SAMPLE_STATUS } from "@/lib/labels";
import type { CodeType, DemandKind, DemandOrigin } from "@/lib/import/types";
import {
  addCode,
  addDemand,
  addEvaluation,
  addMarket,
  addPrice,
  addSample,
  deleteRecord,
  updateProduct,
  updateSampleStatus,
  uploadImage,
} from "../actions";
import { ProductFields, type Lookup } from "../product-fields";

type Row = Record<string, any>;

export interface Ctx {
  product: Row;
  can: Can;
  profileName: string | null;
  codes: Row[];
  segmentIds: string[];
  technologyIds: string[];
  images: Row[];
  demands: Row[];
  samples: Row[];
  market: Row[];
  prices: Row[];
  evaluations: Row[];
  lookups: { manufacturers: Lookup[]; segments: Lookup[]; technologies: Lookup[]; customers: Lookup[] };
}

const Hidden = ({ id }: { id: string }) => <input type="hidden" name="product_id" value={id} />;

function Del({ table, id, productId }: { table: string; id: string; productId: string }) {
  return <DeleteButton action={deleteRecord} fields={{ table, id, product_id: productId }} />;
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">{value}</dd>
      {hint && <dd className="text-xs text-ink-faint">{hint}</dd>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resumo + dados + fotos
// ---------------------------------------------------------------------------
export function OverviewSection({ ctx }: { ctx: Ctx }) {
  const { product, demands, samples, market, prices, evaluations, can } = ctx;
  const byOrigin = (o: DemandOrigin) => demands.filter((d) => d.origin === o).length;
  const customerDemands = demands.filter((d) => d.origin === "cliente");
  const customers = [...new Set(customerDemands.map((d) => d.customers?.name).filter(Boolean))] as string[];
  const regions = [
    ...new Set(demands.map((d) => d.region ?? d.customers?.region ?? d.customers?.state).filter(Boolean)),
  ] as string[];
  const dates = demands.map((d) => d.requested_at).filter(Boolean).sort();
  const qty = customerDemands.reduce((a, d) => a + (Number(d.quantity) || 0), 0);
  const sources = new Set(demands.map((d) => d.source).filter(Boolean));
  const sampleQty = samples
    .filter((s) => !["devolvida", "descartada"].includes(s.status))
    .reduce((a, s) => a + (s.quantity ?? 1), 0);
  const marketTotal = market.find((m) => !m.country);
  const brl = prices.filter((p) => p.value !== null && p.currency === "BRL").map((p) => Number(p.value));
  const lastPrice = prices.find((p) => p.value !== null);
  const lastEval = evaluations.find((e) => e.recommendation);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-4">
        <Card title="Análise consolidada">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Demandas registradas"
              value={demands.length}
              hint={`${byOrigin("cliente")} de clientes · ${byOrigin("pesquisa_interna")} internas · ${byOrigin("mercado")} mercado`}
            />
            <Stat label="Clientes interessados" value={customers.length} hint={customers.slice(0, 4).join(", ") || undefined} />
            <Stat label="Qtd. pedida por clientes" value={qty ? fmtNum(qty, 0) : "—"} hint="soma das quantidades informadas" />
            <Stat
              label="Período das demandas"
              value={dates.length ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}` : "—"}
            />
            <Stat label="Fontes diferentes" value={sources.size} />
            <Stat label="Regiões" value={regions.length || "—"} hint={regions.slice(0, 4).join(", ") || undefined} />
            <Stat label="Amostras disponíveis" value={sampleQty || "—"} />
            {can.strategic && (
              <>
                <Stat
                  label="Mercado (importações)"
                  value={marketTotal ? fmtNum(marketTotal.quantity, 0) : "—"}
                  hint={
                    marketTotal
                      ? `${marketTotal.period_start === marketTotal.period_end ? marketTotal.period_start : `${marketTotal.period_start}–${marketTotal.period_end}`} · média ${fmtMoney(marketTotal.avg_unit_value_usd, "USD")}`
                      : undefined
                  }
                />
                <Stat
                  label="Preço de referência"
                  value={lastPrice ? fmtMoney(lastPrice.value, lastPrice.currency) : "—"}
                  hint={
                    brl.length > 1
                      ? `faixa ${fmtMoney(Math.min(...brl))} – ${fmtMoney(Math.max(...brl))}`
                      : lastPrice?.source ?? undefined
                  }
                />
                <Stat
                  label="Último parecer"
                  value={lastEval ? RECOMMENDATION[lastEval.recommendation as keyof typeof RECOMMENDATION] : "—"}
                  hint={lastEval?.opinion?.slice(0, 60)}
                />
              </>
            )}
          </dl>
        </Card>

        <Card title="Dados do produto">
          <ActionForm action={updateProduct} resetOnSuccess={false}>
            <input type="hidden" name="id" value={product.id} />
            <ProductFields
              manufacturers={ctx.lookups.manufacturers}
              segments={ctx.lookups.segments}
              technologies={ctx.lookups.technologies}
              product={product as any}
              selectedSegments={ctx.segmentIds}
              selectedTechnologies={ctx.technologyIds}
              showStatus={false}
            />
            <div className="mt-4 flex justify-end">
              <SubmitButton>Salvar dados</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>

      <Card title={`Fotos (${ctx.images.length})`}>
        {ctx.images.length === 0 ? (
          <Empty>Nenhuma foto.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {ctx.images.map((img) => (
              <figure key={img.id} className="group relative">
                {img.url ? (
                  <a href={img.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.caption ?? product.main_code}
                      className="aspect-square w-full rounded border border-line bg-panel object-contain"
                    />
                  </a>
                ) : (
                  <div className="aspect-square rounded border border-dashed border-line" />
                )}
                <figcaption className="mt-1 flex items-center justify-between gap-1 text-xs text-ink-faint">
                  <span className="truncate">{img.caption ?? img.source ?? ""}</span>
                  {ctx.can.delete && <Del table="product_images" id={img.id} productId={product.id} />}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <ActionForm action={uploadImage} className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <Hidden id={product.id} />
          <Input type="file" name="photo" accept="image/*" multiple className="h-auto py-1.5" required />
          <Input name="caption" placeholder="Legenda (opcional)" />
          <SubmitButton variant="secondary" pendingText="Enviando…">
            Enviar foto
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Códigos
// ---------------------------------------------------------------------------
export function CodesSection({ ctx }: { ctx: Ctx }) {
  const { product, codes, can } = ctx;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card title="Códigos que identificam este produto" bodyClassName="p-0">
        <Table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Fonte</th>
              <th>Observação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id}>
                <td className="font-mono">{c.code}</td>
                <td>
                  <Badge tone={c.type === "principal" ? "blue" : "gray"}>{CODE_TYPE[c.type as CodeType]}</Badge>
                </td>
                <td>{c.source ?? "—"}</td>
                <td>{c.notes ?? ""}</td>
                <td className="text-right">
                  {can.delete && c.type !== "principal" && <Del table="product_codes" id={c.id} productId={product.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="border-t border-line px-4 py-3 text-xs text-ink-faint">
          Cada código pertence a um só produto. A busca encontra o produto por qualquer um deles, com ou sem hífens e
          espaços. Para trocar o código principal, edite em “Resumo e dados”.
        </p>
      </Card>
      <Card title="Adicionar código">
        <ActionForm action={addCode} className="flex flex-col gap-3">
          <Hidden id={product.id} />
          <Field label="Código(s)" hint="Vários: um por linha ou separados por ;">
            <Textarea name="code" rows={2} className="font-mono" required />
          </Field>
          <Field label="Tipo">
            <Select name="type" defaultValue="equivalente">
              {Object.entries(CODE_TYPE)
                .filter(([k]) => k !== "principal")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Fonte">
            <Input name="source" placeholder="Catálogo, site do fabricante…" />
          </Field>
          <Field label="Observação">
            <Input name="notes" />
          </Field>
          <SubmitButton>Adicionar</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demandas
// ---------------------------------------------------------------------------
export function DemandsSection({ ctx }: { ctx: Ctx }) {
  const { product, demands, can } = ctx;
  return (
    <div className="flex flex-col gap-4">
      <Card title="Registrar demanda">
        <ActionForm action={addDemand} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Hidden id={product.id} />
          <Field label="Origem *">
            <Select name="origin" defaultValue="cliente" required>
              {Object.entries(ORIGIN).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select name="kind" defaultValue="solicitacao">
              {Object.entries(KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cliente">
            <Input name="customer" list="customers-list" />
            <datalist id="customers-list">
              {ctx.lookups.customers.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Data">
            <Input name="requested_at" type="date" />
          </Field>
          <Field label="Quantidade">
            <Input name="quantity" inputMode="decimal" />
          </Field>
          <Field label="Por">
            <Select name="quantity_period" defaultValue="">
              <option value="">—</option>
              <option value="pedido">pedido</option>
              <option value="mes">mês</option>
              <option value="ano">ano</option>
            </Select>
          </Field>
          <Field label="Região / UF">
            <Input name="region" />
          </Field>
          <Field label="Fonte">
            <Input name="source" placeholder="Visita, e-mail, planilha…" />
          </Field>
          <Field label="Como o cliente descreveu" className="sm:col-span-2">
            <Input name="description_at_source" />
          </Field>
          <Field label="Observações" className="sm:col-span-2">
            <Input name="notes" />
          </Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-4 lg:justify-end">
            <SubmitButton>Registrar</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card title={`Histórico de demandas (${demands.length})`} bodyClassName="p-0">
        {demands.length === 0 ? (
          <Empty>Nenhuma demanda registrada.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Origem</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th className="text-right">Qtd.</th>
                <th>Fonte</th>
                <th>Descrição na origem / observações</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {demands.map((d) => (
                <tr key={d.id}>
                  <td className="whitespace-nowrap">{fmtDate(d.requested_at)}</td>
                  <td>
                    <Badge tone={ORIGIN[d.origin as DemandOrigin].tone}>{ORIGIN[d.origin as DemandOrigin].label}</Badge>
                  </td>
                  <td className="whitespace-nowrap">{KIND[d.kind as DemandKind]}</td>
                  <td>{d.customers?.name ?? "—"}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {d.quantity !== null ? fmtNum(d.quantity) : "—"}
                    {d.quantity_period && <span className="text-xs text-ink-faint"> /{d.quantity_period}</span>}
                  </td>
                  <td className="max-w-48">{d.source ?? "—"}</td>
                  <td className="max-w-md">
                    {d.description_at_source && <div>{d.description_at_source}</div>}
                    {d.notes && <div className="text-xs text-ink-soft">{d.notes}</div>}
                    {d.import_batch_id && <div className="text-xs text-ink-faint">importado de planilha</div>}
                  </td>
                  <td className="text-right">{can.delete && <Del table="demands" id={d.id} productId={product.id} />}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Amostras
// ---------------------------------------------------------------------------
export function SamplesSection({ ctx }: { ctx: Ctx }) {
  const { product, samples, can } = ctx;
  return (
    <div className="flex flex-col gap-4">
      <Card title={`Amostras (${samples.length})`} bodyClassName="p-0">
        {samples.length === 0 ? (
          <Empty>Nenhuma amostra registrada.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th className="text-right">Qtd.</th>
                <th>Local (armário_prateleira_caixa)</th>
                <th>Status</th>
                <th>Fornecida por</th>
                <th>Recebida</th>
                <th>NF</th>
                <th>Devolução</th>
                <th>Observações</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.id}>
                  <td className="text-right tabular-nums">{s.quantity ?? "—"}</td>
                  <td className="font-mono">{s.location ?? "—"}</td>
                  <td>
                    <ActionForm action={updateSampleStatus} resetOnSuccess={false} className="flex gap-1">
                      <Hidden id={product.id} />
                      <input type="hidden" name="id" value={s.id} />
                      <Select name="status" defaultValue={s.status} className="h-7 w-32 text-xs">
                        {Object.entries(SAMPLE_STATUS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                      <SubmitButton size="sm" variant="secondary" pendingText="…">
                        OK
                      </SubmitButton>
                    </ActionForm>
                  </td>
                  <td>{s.supplier_name ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    {fmtDate(s.received_at)}
                    {s.received_by && <div className="text-xs text-ink-faint">por {s.received_by}</div>}
                  </td>
                  <td>{s.invoice_number ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    {s.must_return ? <Badge tone="amber">Devolver até {fmtDate(s.return_due)}</Badge> : "—"}
                  </td>
                  <td className="max-w-xs text-xs">{s.notes}</td>
                  <td className="text-right">{can.delete && <Del table="samples" id={s.id} productId={product.id} />}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card title="Registrar amostra">
        <ActionForm action={addSample} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Hidden id={product.id} />
          <Field label="Quantidade">
            <Input name="quantity" inputMode="numeric" />
          </Field>
          <Field label="Local" hint="Armário_Prateleira_Caixa, ex.: 2_1_A">
            <Input name="location" className="font-mono" />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue="em_estoque">
              {Object.entries(SAMPLE_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fornecida por">
            <Input name="supplier_name" />
          </Field>
          <Field label="Recebida por">
            <Input name="received_by" defaultValue={ctx.profileName ?? ""} />
          </Field>
          <Field label="Data de recebimento">
            <Input name="received_at" type="date" />
          </Field>
          <Field label="Nota fiscal">
            <Input name="invoice_number" />
          </Field>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="must_return" /> Precisa devolver
            </label>
            <Input name="return_due" type="date" aria-label="Devolver até" />
          </div>
          <Field label="Observações" className="sm:col-span-2 lg:col-span-3">
            <Input name="notes" />
          </Field>
          <div className="flex items-end">
            <SubmitButton>Registrar</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mercado (restrito)
// ---------------------------------------------------------------------------
export function MarketSection({ ctx }: { ctx: Ctx }) {
  const { product, market, can } = ctx;
  const totals = market.filter((m) => !m.country);
  const countries = market.filter((m) => m.country).sort((a, b) => Number(b.quantity) - Number(a.quantity));
  return (
    <div className="flex flex-col gap-4">
      <Card title="Importações — totais por período" bodyClassName="p-0">
        {totals.length === 0 ? (
          <Empty>Sem dados de mercado.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Fonte</th>
                <th>Período</th>
                <th className="text-right">Quantidade</th>
                <th className="text-right">Valor médio (US$)</th>
                <th className="text-right">Valor total (US$)</th>
                <th className="text-right">1º mundo</th>
                <th>Conferido</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {totals.map((m) => (
                <tr key={m.id}>
                  <td>{m.source}</td>
                  <td>{m.period_start === m.period_end ? m.period_start : `${m.period_start}–${m.period_end}`}</td>
                  <td className="text-right tabular-nums">{fmtNum(m.quantity, 0)}</td>
                  <td className="text-right tabular-nums">{fmtMoney(m.avg_unit_value_usd, "USD")}</td>
                  <td className="text-right tabular-nums">{fmtMoney(m.total_value_usd, "USD")}</td>
                  <td className="text-right tabular-nums">{fmtPct(m.first_world_share)}</td>
                  <td>
                    {m.verified === true ? (
                      <Badge tone="green">Correto</Badge>
                    ) : m.verified === false ? (
                      <Badge tone="red">Incorreto</Badge>
                    ) : (
                      "—"
                    )}
                    {m.notes && <div className="mt-1 max-w-xs text-xs text-ink-soft">{m.notes}</div>}
                  </td>
                  <td className="text-right">{can.delete && <Del table="market_data" id={m.id} productId={product.id} />}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {countries.length > 0 && (
        <Card title="Por país de origem" bodyClassName="p-0">
          <Table>
            <thead>
              <tr>
                <th>País</th>
                <th>Período</th>
                <th className="text-right">Quantidade</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {countries.map((m) => (
                <tr key={m.id}>
                  <td>{m.country}</td>
                  <td>{m.period_start === m.period_end ? m.period_start : `${m.period_start}–${m.period_end}`}</td>
                  <td className="text-right tabular-nums">{fmtNum(m.quantity, 0)}</td>
                  <td className="text-xs text-ink-soft">{m.notes}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <Card title="Adicionar dado de mercado">
        <ActionForm action={addMarket} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Hidden id={product.id} />
          <Field label="Fonte *">
            <Input name="source" defaultValue="Receita Federal (Siscori)" required />
          </Field>
          <Field label="Ano inicial *">
            <Input name="period_start" inputMode="numeric" required />
          </Field>
          <Field label="Ano final">
            <Input name="period_end" inputMode="numeric" />
          </Field>
          <Field label="País (vazio = total)">
            <Input name="country" />
          </Field>
          <Field label="Quantidade">
            <Input name="quantity" inputMode="decimal" />
          </Field>
          <Field label="Valor médio (US$)">
            <Input name="avg_unit_value_usd" inputMode="decimal" />
          </Field>
          <Field label="Valor total (US$)">
            <Input name="total_value_usd" inputMode="decimal" />
          </Field>
          <Field label="Observação">
            <Input name="notes" />
          </Field>
          <div className="flex items-end lg:col-span-4 lg:justify-end">
            <SubmitButton>Adicionar</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preços (restrito)
// ---------------------------------------------------------------------------
export function PricesSection({ ctx }: { ctx: Ctx }) {
  const { product, prices, can } = ctx;
  return (
    <div className="flex flex-col gap-4">
      <Card title={`Preços de referência (${prices.length})`} bodyClassName="p-0">
        {prices.length === 0 ? (
          <Empty>Nenhum preço registrado.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th className="text-right">Valor</th>
                <th>Fonte</th>
                <th>Texto original / observação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{fmtDate(p.reference_date)}</td>
                  <td>{PRICE_KIND[p.kind as keyof typeof PRICE_KIND]}</td>
                  <td className="whitespace-nowrap text-right tabular-nums font-medium">{fmtMoney(p.value, p.currency)}</td>
                  <td>
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                        {p.source ?? p.url}
                      </a>
                    ) : (
                      (p.source ?? p.customers?.name ?? "—")
                    )}
                  </td>
                  <td className="max-w-md text-xs text-ink-soft">{p.raw_text ?? p.notes}</td>
                  <td className="text-right">
                    {can.delete && <Del table="price_references" id={p.id} productId={product.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card title="Adicionar preço">
        <ActionForm action={addPrice} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Hidden id={product.id} />
          <Field label="Tipo">
            <Select name="kind" defaultValue="dealer">
              {Object.entries(PRICE_KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Valor *">
            <Input name="value" inputMode="decimal" required placeholder="1.234,56" />
          </Field>
          <Field label="Moeda">
            <Select name="currency" defaultValue="BRL">
              <option value="BRL">R$ (BRL)</option>
              <option value="USD">US$ (USD)</option>
              <option value="EUR">€ (EUR)</option>
            </Select>
          </Field>
          <Field label="Data">
            <Input name="reference_date" type="date" />
          </Field>
          <Field label="Fonte">
            <Input name="source" placeholder="Maqnelson, site CAT…" />
          </Field>
          <Field label="Link">
            <Input name="url" type="url" placeholder="https://" />
          </Field>
          <Field label="Observação" className="lg:col-span-2">
            <Input name="notes" />
          </Field>
          <div className="flex items-end lg:col-span-4 lg:justify-end">
            <SubmitButton>Adicionar</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pareceres (restrito)
// ---------------------------------------------------------------------------
export function EvaluationsSection({ ctx }: { ctx: Ctx }) {
  const { product, evaluations, can } = ctx;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <Card title={`Pareceres (${evaluations.length})`}>
        {evaluations.length === 0 ? (
          <Empty>Nenhum parecer.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {evaluations.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {e.recommendation && (
                      <Badge
                        tone={
                          e.recommendation === "sim" || e.recommendation === "feito"
                            ? "green"
                            : e.recommendation === "nao"
                              ? "red"
                              : "amber"
                        }
                      >
                        {RECOMMENDATION[e.recommendation as keyof typeof RECOMMENDATION]}
                      </Badge>
                    )}
                    <span className="font-medium">{e.evaluator ?? "—"}</span>
                    <span className="text-xs text-ink-faint">{fmtDate(e.created_at)}</span>
                  </div>
                  {e.opinion && <p className="mt-1 text-sm">{e.opinion}</p>}
                  {(e.board_score !== null || e.technical_ease !== null) && (
                    <p className="mt-1 text-xs text-ink-soft">
                      Análise Board: <b>{fmtNum(e.board_score)}</b> · Facilidade técnica: <b>{fmtNum(e.technical_ease)}</b>
                    </p>
                  )}
                </div>
                {can.delete && <Del table="evaluations" id={e.id} productId={product.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Novo parecer">
        <ActionForm action={addEvaluation} className="flex flex-col gap-3">
          <Hidden id={product.id} />
          <Field label="Avaliador">
            <Input name="evaluator" defaultValue={ctx.profileName ?? ""} />
          </Field>
          <Field label="Recomendação">
            <Select name="recommendation" defaultValue="">
              <option value="">—</option>
              {Object.entries(RECOMMENDATION).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Parecer">
            <Textarea name="opinion" rows={3} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Análise Board">
              <Input name="board_score" inputMode="decimal" />
            </Field>
            <Field label="Facilidade técnica">
              <Input name="technical_ease" inputMode="decimal" />
            </Field>
          </div>
          <SubmitButton>Salvar parecer</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Histórico de alterações (restrito)
// ---------------------------------------------------------------------------
const TABLE_LABEL: Record<string, string> = {
  products: "Produto",
  product_codes: "Código",
  product_segments: "Segmento",
  product_technologies: "Tecnologia",
  product_images: "Foto",
  demands: "Demanda",
  market_data: "Mercado",
  price_references: "Preço",
  samples: "Amostra",
  evaluations: "Parecer",
};
const ACTION_LABEL: Record<string, string> = { INSERT: "incluiu", UPDATE: "alterou", DELETE: "excluiu" };
const HIDDEN_FIELDS = new Set(["id", "product_id", "created_at", "created_by", "updated_at", "updated_by", "raw", "source_hash", "import_batch_id"]);

function short(v: unknown): string {
  if (v === null || v === undefined || v === "") return "∅";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

export async function HistorySection({ productId }: { productId: string }) {
  const { supabase } = await requireMember();
  const [{ data: logs }, { data: people }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("*")
      .eq("product_id", productId)
      .order("changed_at", { ascending: false })
      .limit(300),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email]));
  return (
    <Card title="Histórico de alterações" bodyClassName="p-0">
      {!logs?.length ? (
        <Empty>Sem registros.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Quem</th>
              <th>O quê</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const data = (l.new_data ?? l.old_data ?? {}) as Row;
              const fields: string[] =
                l.action === "UPDATE"
                  ? (l.changed_fields ?? [])
                  : Object.keys(data).filter((k) => !HIDDEN_FIELDS.has(k) && data[k] !== null && data[k] !== "");
              return (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">{fmtDate(l.changed_at, true)}</td>
                  <td className="whitespace-nowrap">{l.changed_by ? (who.get(l.changed_by) ?? "—") : "sistema"}</td>
                  <td className="whitespace-nowrap">
                    {ACTION_LABEL[l.action]} {TABLE_LABEL[l.table_name] ?? l.table_name}
                  </td>
                  <td className="text-xs text-ink-soft">
                    {fields
                      .filter((f) => !HIDDEN_FIELDS.has(f))
                      .slice(0, 6)
                      .map((f) => (
                        <div key={f}>
                          <span className="font-medium text-ink">{f}</span>:{" "}
                          {l.action === "UPDATE" ? (
                            <>
                              {short(l.old_data?.[f])} → {short(l.new_data?.[f])}
                            </>
                          ) : (
                            short(data[f])
                          )}
                        </div>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
