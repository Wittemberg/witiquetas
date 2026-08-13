# Witiquetas

Plataforma Web para criação, gestão, compilação e impressão de etiquetas térmicas de gôndola.

## Produção

```text
https://witiquetas.wrtec.com.br
```

## Repositório

```text
https://github.com/Wittemberg/witiquetas
```

## Três pilares

1. **Frontend Web** — editor visual e gestão.
2. **Backend/API** — segurança, dados, compiladores e jobs.
3. **Agente Local** — comunicação com impressoras e atualização local.

## Documentação principal

- `ARQUITETURA.md`
- `ROADMAP.md`
- `DOCUMENTACAO-FRONTEND.md`
- `DOCUMENTACAO-BACKEND.md`
- `DOCUMENTACAO-AGENTE-LOCAL.md`
- `docs/INFRAESTRUTURA.md`
- `SECURITY.md`
- `CONTRIBUTING.md`

## Architecture Decision Records

As decisões estruturais que não devem ser alteradas sem análise explícita ficam em:

```text
docs/decisions/
```

ADRs iniciais:

- `ADR-001-monorepo.md`
- `ADR-002-customer-company.md`
- `ADR-003-label-schema-independent.md`
- `ADR-004-agent-local.md`
- `ADR-005-storage-postgres-minio.md`

## Arquitetura resumida

```text
Browser
  ↓ HTTPS
Frontend
  ↓ /api
Backend
  ├── PostgreSQL
  ├── MinIO/S3
  └── Print Jobs
        ↓
   Agente Local
        ↓
RAW TCP / Serial / USB / Spooler
        ↓
   Impressora térmica
```

## Infraestrutura

Padrão operacional:

```text
GitHub
→ GitHub Actions
→ GHCR
→ Portainer / Docker Swarm
→ Traefik
```

Rede compartilhada:

```text
interna
```

TLS:

```text
letsencryptresolver
```

## Princípios arquiteturais

- `Customer` não é sinônimo de CNPJ.
- Um `Customer` pode possuir N `Companies`/filiais.
- O frontend não gera PPLA, PPLB, ZPL ou EPL diretamente.
- O backend compila o modelo abstrato para a linguagem da impressora.
- O Agente Local recebe payload compilado e executa a impressão.
- Modelos oficiais da plataforma são imutáveis para clientes e podem ser clonados.
- PostgreSQL é a fonte de verdade relacional.
- MinIO/S3 armazena arquivos e objetos.
- Credenciais nunca são versionadas.
- IA pode sugerir correção, mas não executa código arbitrário em produção.

## Governança

Commits seguem Conventional Commits:

```text
feat:
fix:
docs:
refactor:
test:
chore:
```

Branches recomendadas:

```text
main
feature/*
fix/*
refactor/*
docs/*
release/*
```

Consulte `CONTRIBUTING.md`.

---

Documentação inicial consolidada em 13/08/2026.
