# Environment matrix

| Branch | Environment | Infrastructure |
| --- | --- | --- |
| `desarrollo` | Local | Local PostgreSQL and local services |
| `develop` | QA | Railway QA and Supabase QA |
| `main` | Production | Railway PROD and Supabase PROD |

## Local guardrails

`desarrollo` must not start when local environment files contain:

- Supabase QA project ref.
- Supabase PROD project ref.
- `supabase.co` remote URLs.
- Railway URLs.
- Supabase pooler URLs.

The local launcher checks `.env` and `config/local.env` when present and does not print secret values.

## Promotion guardrails

Promotion scripts are separate from the local launcher:

- `scripts/git/promote-desarrollo-to-develop.ps1`
- `scripts/git/promote-develop-to-main.ps1`

They provide dry-run evidence and block by default unless explicit confirmation and required metadata are supplied. They do not run as part of local startup.
