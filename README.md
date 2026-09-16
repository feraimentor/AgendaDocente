# Agenda Docente

> Versão atual: **V2.1.0926** (`0.2.1-0926`)

## Produção

- Aplicação: https://agenda-docente.pages.dev
- Backend: projeto Supabase `bjurlhpvjknfsqmibyjb` na região `sa-east-1`
- Acesso: privado com suporte a Login Social (Google OAuth) e e-mail/senha
- Primeiro acesso: a conta provisionada deve trocar a senha temporária antes de abrir a agenda

O segredo temporário não deve ser registrado no repositório. A política remota exige no mínimo 12 caracteres, com letras minúsculas, maiúsculas, números e símbolos.

### Publicação contínua

A branch padrão é `main`. Cada push nela executa lint, testes e build pelo GitHub Actions; se tudo passar, a pasta `dist` é publicada no projeto `agenda-docente` do Cloudflare Pages, preservando o endereço de produção.

O workflow usa variáveis públicas do repositório (`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`) e os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`. Nenhum segredo deve ser gravado no código.

Cockpit privado para professores que transforma um cronograma institucional em CSV em uma agenda operacional: próxima aula, compromissos do dia, Ações CP, visão semanal, turmas e histórico de importações.

O primeiro cenário validado é o ciclo C7-2026, com as turmas BRSAO257 e BRSAO267. A marca Escola da Nuvem é dado da instituição inicial, não a identidade do produto.

## Stack

- React 19, TypeScript, Vite e React Router;
- Tailwind CSS v4, componentes locais no padrão shadcn/ui, Lucide e Sonner;
- TanStack Query para estado remoto;
- Supabase Auth, PostgreSQL com RLS e Storage privado;
- Papa Parse, Zod 4, Web Crypto SHA-256 e `temporal-polyfill`;
- FullCalendar Standard (recursos gratuitos);
- Vitest, Testing Library, pgTAP e Playwright;
- deploy estático no Cloudflare Pages.

Todas as versões estão fixadas em `package.json` e `pnpm-lock.yaml`.

## Requisitos

- Node.js 22 ou mais recente;
- pnpm 11.16.0;
- Docker Desktop ou runtime compatível para o Supabase local;
- projeto Supabase para uso remoto;
- nenhum serviço pago é necessário.

## Instalação

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

No Windows/PowerShell:

```powershell
Copy-Item .env.example .env.local
pnpm dev
```

A aplicação fica em `http://127.0.0.1:5173` (ou na porta indicada pelo Vite).

## Variáveis de ambiente

Use apenas credenciais públicas apropriadas para navegador:

```env
VITE_APP_NAME=Agenda Docente
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Nunca coloque `service_role`, secret key, senha de banco ou token administrativo em variáveis `VITE_*`. O frontend não precisa de `service_role`.

## Supabase local

Os comandos abaixo usam a CLI fixada como dependência do projeto:

```bash
pnpm db:start
pnpm db:reset
pnpm test:db
pnpm db:lint
```

`supabase db reset` recria o banco do zero, executa a migration e o seed não destrutivo. O stack local inclui Auth, PostgreSQL, Storage, Studio e Mailpit. O ambiente local é apenas para desenvolvimento e não deve ser exposto à internet.

### Migration e Data API

A migration em `supabase/migrations` cria:

- 13 tabelas privadas com UUID, FKs compostas de ownership, checks e índices;
- RLS em todas as tabelas do schema `public`;
- grants explícitos para `authenticated`, compatíveis com o novo padrão da Data API;
- `apply_schedule_import`, RPC transacional `SECURITY INVOKER`;
- `rollback_latest_import`, limitado à última versão bem-sucedida;
- buckets privados `schedule-imports` e `avatars`;
- policies de Storage que exigem `auth.uid()` no primeiro segmento do path.

As RPCs derivam o usuário com `auth.uid()` e não aceitam `user_id` como autoridade.

### Aplicar em um projeto remoto

Autentique e vincule a CLI somente ao projeto correto:

```bash
pnpm supabase login
pnpm supabase link --project-ref SEU_PROJECT_REF
pnpm supabase db push --dry-run
pnpm supabase db push
```

Não execute `db reset --linked` em produção: ele é destrutivo.

## Criar o usuário Master

Não há `/signup` e o signup público deve permanecer desabilitado.

1. Em Supabase Dashboard → Authentication → Users, crie o usuário de forma controlada.
2. Faça login; o onboarding cria o `profile`.
3. No SQL Editor administrativo, atribua o papel:

```sql
insert into public.user_roles (user_id, role)
values ('UUID_DO_USUARIO', 'master');
```

4. Em Authentication → Providers/Email, desabilite novos signups.

`user_roles` possui somente policy de leitura do próprio papel. A aplicação comum não pode inserir, alterar nem remover papéis.

## URLs de autenticação e recuperação

Em Authentication → URL Configuration:

- Site URL local: `http://127.0.0.1:5173`;
- redirect local: `http://127.0.0.1:5173/reset-password`;
- Site URL de produção: domínio do Cloudflare Pages;
- redirect de produção: `https://SEU_DOMINIO/reset-password`.

O Supabase Free possui limites e restrições no SMTP padrão. Para o MVP de um único Master, confirme que o endereço provisionado recebe as mensagens no projeto configurado. SMTP externo é infraestrutura futura quando houver usuários adicionais, não requisito do MVP.

## Buckets

A migration cria os buckets. Confira no Dashboard:

- `schedule-imports` — privado, CSV até 10 MB;
- `avatars` — privado, PNG/JPEG/WebP até 5 MB.

Paths usados:

```text
schedule-imports/{user_id}/{cycle_id}/{import_batch_id}/original.csv
avatars/{user_id}/avatar.ext
```

O upload do CSV ocorre antes da RPC. Se a transação do banco falhar, o cliente tenta remover o objeto recém-enviado; o cronograma anterior permanece intacto.

## Fluxo de importação

1. O navegador lê UTF-8/BOM ou faz fallback Windows-1252.
2. Papa Parse detecta vírgula ou ponto e vírgula.
3. Headers, datas em português, turmas, horários, materiais e ações são normalizados.
4. Zod valida campos essenciais; duplicatas exatas viram warning.
5. Web Crypto calcula SHA-256 do arquivo e hashes determinísticos das linhas.
6. A tela mostra preview, período, turmas e avisos antes de qualquer alteração oficial.
7. Ao confirmar, o CSV vai ao Storage privado e a RPC aplica create/update/soft-delete em uma transação PostgreSQL.
8. Notas pessoais, cores e progresso das ações não são apagados por reimportação.

Um arquivo idêntico à versão atual não cria lote novo. Mudança de horário mantém o evento; mudança de data é remove + create. O rollback só restaura a versão imediatamente anterior.

## CSV real e privacidade

O CSV real não é copiado para o repositório. A regressão usa uma fixture sanitizada por padrão. Para validar localmente o arquivo privado:

```powershell
$env:REAL_SCHEDULE_CSV='C:\caminho\cronograma.csv'
pnpm test
```

Arquivos `*.real.csv` e `tests/fixtures/private/` estão ignorados pelo Git. Não publique o CSV real em repositório público.

## Testes e qualidade

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Banco local:

```bash
pnpm db:start
pnpm db:reset
pnpm test:db
```

Os testes pgTAP cobrem schema, RLS A/B, Storage, ausência de autoelevação, RPC transacional, reimportação, preservação de nota/progresso e rollback. Os E2E públicos cobrem proteção de rota, ausência de signup e viewport mobile.

Para o E2E conectado:

```bash
E2E_MASTER_EMAIL=master@example.com E2E_MASTER_PASSWORD='senha-de-teste' pnpm test:e2e
```

Use somente um projeto local ou remoto descartável para E2E; nunca rode mutações de teste em produção.

## Build

```bash
pnpm build
pnpm preview
```

A saída estática fica em `dist`. As páginas são divididas em chunks, inclusive o FullCalendar. O arquivo `public/_headers` adiciona headers defensivos e cache imutável aos assets versionados.

## Cloudflare Pages

Configuração do projeto:

- framework preset: Vite;
- build command: `pnpm build`;
- output directory: `dist`;
- Node.js: 22;
- variáveis: as três chaves públicas de `.env.example`.

O Cloudflare Pages trata uma publicação sem `404.html` de topo como SPA e entrega `index.html` para deep links. Assim, atualizar `/agenda`, `/classes/:id` ou `/settings` funciona sem Worker e sem Pages Functions.

Também é possível fazer direct upload, depois de autenticar o Wrangler:

```bash
pnpm dlx wrangler@latest pages deploy dist --project-name agenda-docente
```

O arquivo `wrangler.jsonc` documenta o output estático. Nenhum Worker é necessário.

## Limitações relevantes do Free tier

- e-mails do Auth padrão possuem limites; veja a seção de recuperação;
- o Supabase local exige Docker;
- o plano gratuito pode pausar projetos inativos conforme a política vigente;
- limites do Cloudflare Pages e Supabase devem ser conferidos nas documentações oficiais antes do rollout para mais usuários.

## Segurança

- RLS é a autoridade; React Router é apenas UX;
- nenhuma autorização usa `user_metadata`;
- todas as tabelas privadas carregam `user_id` explícito;
- UPDATE policies possuem `USING` e `WITH CHECK`;
- `user_roles` não é editável pelo usuário;
- Storage é privado e isolado por path;
- nenhuma URL pública permanente é criada para CSVs;
- exportação JSON exclui senha, tokens, chaves e bytes dos CSVs.

## Estrutura

```text
src/app               router, layout e providers
src/features          domínios do produto
src/lib/csv           ETL, hashes e diff
src/lib/dates         timezone e estado temporal
src/lib/supabase      cliente público
supabase/migrations   schema, RLS, RPCs e Storage
supabase/tests        pgTAP de integração/segurança
tests/unit            Vitest e regressão C7-2026
e2e                   Playwright
```
