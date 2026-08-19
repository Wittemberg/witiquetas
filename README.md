# Witiquetas

Plataforma multinicho para criação, integração, gerenciamento e impressão de etiquetas térmicas, independente do ERP, contexto operacional e linguagem de impressão suportada.

## Produção

```text
https://witiquetas.wrtec.com.br
```

## Repositório

```text
https://github.com/Wittemberg/witiquetas
```

## Arquitetura em 4 Camadas

1. **Camada de Dados** — ERP / API / Integração fornece registros e catálogo de campos.
2. **Camada de Modelo** — Usuário monta visualmente a etiqueta e associa elementos gráficos.
3. **Motor Witiquetas** — Regras, condições, cálculos, preview, validação física e representação intermediária.
4. **Camada de Impressão** — Compiladores (PPLA, PPLB, ZPL, EPL), fila de Print Jobs e Witiquetas Agent residente.

## Documentação Principal

- `docs/product/PRODUCT-UX-CONSOLIDATION.md` (Consolidação de Produto, UX e Regras do Editor)
- `docs/architecture/UNIVERSAL-DATA-ARCHITECTURE.md` (Arquitetura Universal de Dados e 4 Camadas)
- `docs/architecture/INTEGRATION-FIELD-CATALOG.md` (Catálogo Dinâmico de Campos e SDK)
- `docs/architecture/PRINTER-LANGUAGE-KNOWLEDGE-BASE.md` (Base de Conhecimento de Linguagens Térmicas)
- `docs/product/ROADMAP-PHASE-3-5.md` (Roadmap Oficial Consolidado — P0, P1, P2 e Laboratório)
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
