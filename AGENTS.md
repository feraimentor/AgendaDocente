# AgendaDocente — regras de entrega

- A branch padrão e de produção é `main`.
- Depois de qualquer alteração funcional, execute `pnpm lint`, `pnpm test` e `pnpm build`.
- Se as verificações passarem e o usuário não pedir trabalho apenas local, faça commit das alterações intencionais e push para `origin/main` como etapa padrão de conclusão.
- Nunca faça commit de `.env.local`, tokens, senhas, chaves administrativas, CSVs reais ou dados privados.
- O push em `main` aciona o workflow `.github/workflows/deploy.yml`. Além disso, para publicação direta imediata no Cloudflare Pages, execute `npx wrangler@3 pages deploy dist --project-name=agenda-docente --branch=main`.
- A versão pública atual é registrada no arquivo `VERSION` e em `package.json`.
