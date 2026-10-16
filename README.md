# Panflight · Oportunidades de Desenvolvimento

Sistema web que substitui a planilha **Filtro de Demandas**. Fase 1 entregue: cadastro centralizado, importação da planilha com deduplicação, busca global com filtros, perfis de acesso e histórico de alterações.

**Stack:** Next.js 15 (App Router, TypeScript, Tailwind) + Supabase (Postgres, Auth, Storage).

---

## 1. Colocar no ar (≈ 20 min)

### 1.1 Criar o projeto no Supabase
1. Acesse <https://supabase.com/dashboard> → **New project**. Região sugerida: **South America (São Paulo)**.
2. Guarde a senha do banco.

### 1.2 Criar as tabelas
Escolha **uma** das opções:

**A) Pelo painel (mais simples):** abra **SQL Editor** e rode, **nesta ordem**, o conteúdo de cada arquivo da pasta `supabase/migrations/`:

| Ordem | Arquivo | O que faz |
|---|---|---|
| 1 | `20261015000001_core.sql` | Tabelas, tipos e listas iniciais (segmentos, tecnologias) |
| 2 | `20261015000002_logic_security.sql` | Regras automáticas, perfis (RLS) e auditoria |
| 3 | `20261015000003_search.sql` | Busca global e filtros |
| 4 | `20261015000004_import.sql` | Importação de planilhas |
| 5 | `20261015000005_storage.sql` | Bucket privado de fotos |

**B) Pela linha de comando:**
```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

### 1.3 Configurar o login
Em **Authentication → URL Configuration**:
- **Site URL:** a URL do sistema (ex.: `https://oportunidades.panflight.com` ou `http://localhost:3000` para testes)
- **Redirect URLs:** adicione `https://SEU-DOMINIO/auth/confirm` (e `http://localhost:3000/auth/confirm`)

### 1.4 Rodar o sistema
```bash
cp .env.example .env.local      # preencha URL e Publishable key (Project Settings → API)
npm install
npm run dev                     # http://localhost:3000
```

### 1.5 Primeiro acesso
1. Clique em **Criar conta**. **O primeiro usuário vira Diretoria automaticamente.**
2. Os próximos entram como **aguardando aprovação**. A Diretoria libera em **Usuários** e escolhe o perfil.
3. Depois que todos tiverem conta, você pode desligar novos cadastros em *Authentication → Sign In / Providers → Allow new users to sign up* e passar a convidar pelo painel.

### 1.6 Importar a planilha atual
Menu **Importar planilha** → escolha o `.xlsx` → revise → **Importar**. Fotos embutidas vão junto. Reimportar o mesmo arquivo **não duplica** nada.

### 1.7 Publicar (Vercel)
Importe o repositório em <https://vercel.com/new>, cadastre as duas variáveis do `.env.example` e faça o deploy. Atualize a *Site URL* no Supabase.

---

## 2. Como os dados ficaram organizados

O ponto central é separar o **produto** (um registro só) dos **eventos** ligados a ele. Na planilha, cada linha misturava os dois.

```
products ─┬─ product_codes        (N códigos: principal, equivalente, substituto, interno…)
          ├─ demands              (cada solicitação/cotação/menção: cliente, data, qtd, fonte, ORIGEM)
          ├─ samples              (amostras: local físico, quem forneceu, NF, devolução)
          ├─ product_images       (fotos no Storage)
          ├─ product_segments / product_technologies
          ├─ market_data          🔒 importações Receita/Siscori por período e país
          ├─ price_references     🔒 dealer, sites, compra do cliente
          └─ evaluations          🔒 pareceres, Análise Board, Facilidade Técnica
customers, manufacturers, segments, technologies, profiles, audit_log, import_batches
```
🔒 = visível só para Diretoria e Supervisão (bloqueado no banco, não só na tela).

**Origem da demanda** (exigência do documento): `cliente` (demanda real) · `pesquisa_interna` · `mercado`.

### Regras automáticas no banco
- **Deduplicação:** um código pertence a um único produto. `AH-221249`, `ah 221249` e `AH221249` são o mesmo código. Tentar cadastrar de novo avisa e aponta o produto existente.
- **Busca global:** encontra por qualquer código (com ou sem hífen), descrição, fabricante, aplicação, equipamentos, descrição usada pelo cliente e nome do cliente. Sem diferença de acentos.
- **Pendências:** cada produto mostra o que falta (descrição, fabricante, aplicação, segmento, tecnologia, imagem).
- **Auditoria:** toda inclusão, alteração e exclusão grava quem, quando e os valores antes/depois (aba *Histórico*).

### Perfis
| | Diretoria | Supervisão | Operação |
|---|:-:|:-:|:-:|
| Cadastrar/editar produtos, demandas, amostras, clientes | ✓ | ✓ | ✓ |
| Ver mercado, preços, pareceres e histórico | ✓ | ✓ | — |
| Importar planilhas | ✓ | ✓ | — |
| Excluir registros, manter listas | ✓ | ✓ | — |
| Gerenciar usuários | ✓ | — | — |

---

## 3. Como a planilha atual é interpretada

| Coluna da planilha | Vai para |
|---|---|
| Código, Códigos SUBS, Cod PETRO | `product_codes` (principal / substituto / interno). Linhas ligadas por SUBS viram **um** produto |
| Descrição | Descrição do produto (a mais frequente e informativa); as outras ficam em cada demanda |
| Marca | Fabricante (`Desconhecida` = vazio) |
| Imagem (foto embutida) | Storage + `product_images` |
| Quantidade / Valores Receita / Proporção 1º mundo | `market_data` (2021 e 2016–2020) |
| Qt USA?, Qt Alemanha?… | `market_data` por país (**período assumido 2021 — confirmar**) |
| Resultado Siscori Certo? | `market_data.verified` + observação |
| Outras Tabelas / OBS / Consulta Cliente / Cliente comentário | `demands` (fonte, cliente, quantidade, data). Reconhece “solicitado pela X”, “X cotou: N peças”, “Qtd Anual N”, “Preço Compra Agricase…” |
| Temos amostra?, Posição Estoque | `samples` |
| Desenvolve?, Análise Board, Facilidade Técnica | `evaluations` e status no funil |
| Cana, Grãos, Infra… / Hall, Indutivo… | Segmentos / tecnologias |
| Valor Dealer | `price_references` (data, fonte, moeda e valor separados; texto original preservado) |
| % Aumento | Ignorada (é calculável) |

Nada é perdido: a linha original completa fica guardada em `demands.raw`.

Resultado com o `Exemplo.xlsx`: **118 linhas → 62 produtos**, 115 demandas (47 de clientes), 15 clientes, 68 fotos, 18 amostras, 22 preços, 19 pareceres.

---

## 4. Estrutura do código
```
supabase/migrations/      banco (tabelas, RLS, busca, importação, storage)
src/app/(app)/produtos    lista com busca/filtros, ficha com abas, novo produto
src/app/(app)/importar    importação com revisão
src/app/(app)/clientes    clientes e o que cada um pediu
src/app/(app)/cadastros   fabricantes (com unificação), segmentos, tecnologias
src/app/(app)/usuarios    aprovação e perfis
src/lib/import            leitura do Excel e regras de interpretação (testadas)
tests/db                  testes do banco (perfis, deduplicação, busca, auditoria, importação)
```

## 5. Testes
```bash
npm test               # regras de interpretação da planilha
npm run typecheck
npm run db:test        # precisa de um Postgres local na porta 5544 (ver tests/db/run.sh)
npx tsx scripts/parse-exemplo.mts Exemplo.xlsx   # mostra como a planilha será interpretada
```

## 6. Versionamento (GitHub)
- Todo push e pull request roda o **CI** (tipos, lint, testes, banco e build).
- Cada alteração aprovada na `main` gera **uma nova versão** automaticamente (`v0.1.0`, `v0.1.1`, …) em *Releases*, com a lista do que mudou.
- Para mudar de fase, aumente a versão em `package.json` (ex.: `0.2.0`) — a numeração recomeça a partir dela.
- Opcional: cadastrando os secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` e `SUPABASE_DB_PASSWORD`, novas migrations são aplicadas no Supabase automaticamente.
- Fluxo sugerido: crie uma branch por alteração → abra um pull request → o CI valida → faça o merge na `main`.

## 7. Próximas fases
- **Fase 2 – Operação:** alertas de prazo/devolução de amostras, importadores de cotações, base master e TendData, funil com movimentação.
- **Fase 3 – Decisão:** score de priorização com pesos ajustáveis pela Diretoria, ranking, dashboards.
- **Fase 4 – IA:** enriquecimento automático com fonte citada e aprovação humana, busca por foto.

## 8. Pontos a confirmar com o time
1. Período das colunas **Qt por país** (assumido 2021).
2. Significado de **Cod PETRO** (tratado como código interno).
3. A classificação automática de cada fonte (cliente × pesquisa interna) pode ser ajustada na tela de importação antes de gravar.
