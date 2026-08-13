# Contributing to Witiquetas

## 1. Objetivo

Este documento define convenções mínimas para desenvolvimento, revisão, documentação e versionamento do Witiquetas.

---

## 2. Branch principal

```text
main
```

`main` deve representar código integrável e apto a passar pelo pipeline.

Não realizar desenvolvimento experimental diretamente em `main`.

---

## 3. Branches

Padrão:

```text
feature/<descricao-curta>
fix/<descricao-curta>
refactor/<descricao-curta>
docs/<descricao-curta>
release/<versao>
```

Exemplos:

```text
feature/label-editor
feature/pplb-compiler
fix/price-format
docs/adr-agent-local
```

---

## 4. Commits

Usar Conventional Commits.

Tipos:

```text
feat:
fix:
docs:
refactor:
test:
chore:
build:
ci:
perf:
```

Exemplos:

```text
feat(editor): adiciona elemento de preco
feat(pplb): implementa barcode EAN13
fix(agent): evita reimpressao apos reconexao
docs(architecture): registra separacao customer/company
ci(frontend): publica imagem no ghcr
```

---

## 5. Pull Requests

Toda alteração significativa deve explicar:

- problema;
- solução;
- impacto;
- testes;
- riscos;
- alteração de schema, se houver;
- alteração de infraestrutura, se houver.

Mudança arquitetural exige ADR.

---

## 6. Definition of Done

Uma tarefa só deve ser considerada concluída quando aplicável:

- código compilando;
- lint aprovado;
- typecheck aprovado;
- testes aprovados;
- documentação atualizada;
- migrations versionadas;
- sem secrets;
- logs adequados;
- erros tratados;
- autorização multi-tenant validada;
- build Docker aprovado;
- critérios de aceite atendidos.

---

## 7. Código

### Linguagem

Código:

```text
inglês
```

Documentação e textos de negócio:

```text
português do Brasil
```

### TypeScript

Evitar `any`.

Contratos compartilhados devem ficar em `packages/contracts`.

### Datas

API:

```text
ISO 8601
```

Timezone operacional:

```text
America/Sao_Paulo
```

Persistência de timestamps deve preferir UTC quando aplicável, convertendo apenas na apresentação.

---

## 8. Banco de dados

Alterações de schema devem usar migration.

Em produção:

```text
prisma migrate deploy
```

Não usar `prisma db push` como mecanismo de deploy produtivo.

Nunca editar banco produtivo manualmente para substituir uma migration que deveria existir no repositório.

---

## 9. Multi-tenancy

Qualquer endpoint novo deve responder explicitamente:

- qual escopo?
- `PLATFORM`, `CUSTOMER` ou `COMPANY`?
- qual permissão?
- como o backend valida o vínculo?
- existe risco de enumeração de ID?

Testes de autorização são obrigatórios para operações sensíveis.

---

## 10. Modelos de etiqueta

Alterar `LabelDocument` requer:

- avaliar compatibilidade;
- incrementar `schemaVersion` quando necessário;
- migration/conversão;
- testes com layouts antigos;
- ADR se a alteração for estrutural.

---

## 11. Compiladores

Cada compilador deve:

- implementar interface comum;
- validar capabilities;
- não depender do React;
- possuir testes;
- tratar encoding;
- emitir warnings quando um recurso não existir na linguagem.

---

## 12. Agente Local

O agente não deve receber mecanismos de shell remoto.

Toda atualização de binário passa pelo updater assinado.

Mudança no protocolo agente/backend deve ser compatível com versões suportadas.

---

## 13. Segurança

Antes de abrir PR:

- revisar `.env`;
- revisar logs;
- revisar tokens;
- revisar URLs assinadas;
- revisar uploads;
- revisar permissões;
- revisar dados de diagnóstico.

Consulte `SECURITY.md`.

---

## 14. Documentação

Atualizar documentação no mesmo PR que altera o comportamento documentado.

Uma mudança não está concluída se o código e a documentação contradizem um ao outro.

---

Documento inicial: 13/08/2026.
