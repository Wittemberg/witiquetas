# ADR-001 — Monorepo

- Status: Aceito
- Data: 13/08/2026

## Contexto

O Witiquetas possui três aplicações e bibliotecas compartilhadas: frontend, backend e Agente Local, além de contratos, schema de etiquetas e compiladores.

## Decisão

Utilizar um único repositório:

```text
Wittemberg/witiquetas
```

Estrutura:

```text
apps/
packages/
infrastructure/
docs/
```

## Razões

- contratos versionados juntos;
- compiladores compartilháveis;
- mudanças atômicas;
- CI centralizado;
- documentação única;
- menor custo operacional inicial.

## Consequências

O pipeline deverá separar builds por aplicação quando o volume do projeto justificar.

Aplicações não poderão importar internals umas das outras; dependências compartilhadas devem estar em `packages/*`.
