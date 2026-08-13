# Instruções para aplicar este pacote

## 1. Copiar arquivos novos/substituídos para a raiz do repositório

Arquivos:

```text
README.md
ARQUITETURA.md
ROADMAP.md
CONTRIBUTING.md
SECURITY.md
DOCUMENTACAO-AGENTE-LOCAL.md
docs/decisions/ADR-001-monorepo.md
docs/decisions/ADR-002-customer-company.md
docs/decisions/ADR-003-label-schema-independent.md
docs/decisions/ADR-004-agent-local.md
docs/decisions/ADR-005-storage-postgres-minio.md
```

## 2. Remover o arquivo com nome incorreto

```bash
git rm DOCUMENTACAO-GENTE-LOCAL.md
```

O conteúdo foi preservado em:

```text
DOCUMENTACAO-AGENTE-LOCAL.md
```

com correção do título e remoção da observação transitória sobre o nome antigo.

## 3. Conferir status

```bash
git status
```

## 4. Commit sugerido

```bash
git add .
git commit -m "docs(architecture): consolida governanca inicial do Witiquetas"
git push origin main
```

## 5. Decisão fora do commit

Antes do primeiro código proprietário, decidir se o repositório continuará público.

Para produto comercial fechado, a recomendação arquitetural é torná-lo privado.
