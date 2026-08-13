# ADR-002 — Separar Customer de Company/CNPJ

- Status: Aceito
- Data: 13/08/2026

## Contexto

Um cliente comercial pode possuir várias filiais/CNPJs com configurações semelhantes.

Modelar CNPJ como tenant impediria herança e administração adequada do grupo.

## Decisão

Separar:

```text
Customer
└── Company
```

`Customer` representa o cliente/grupo.

`Company` representa cada CNPJ/filial.

## Consequências

- um customer pode possuir N companies;
- usuários podem ter acesso a múltiplas companies;
- configurações podem existir no escopo CUSTOMER ou COMPANY;
- clonagem de filial cria nova Company no mesmo Customer;
- clonagem para novo cliente cria novo Customer;
- histórico, secrets e dados operacionais não são clonados automaticamente.
