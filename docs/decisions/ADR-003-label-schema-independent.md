# ADR-003 — Schema de etiqueta independente da impressora

- Status: Aceito
- Data: 13/08/2026

## Contexto

O Witiquetas deverá suportar Argox, Zebra, Elgin e futuras impressoras/linguagens.

Gerar comandos diretamente no editor criaria acoplamento entre UI e hardware.

## Decisão

O editor persiste um `LabelDocument` abstrato e versionado.

Compiladores convertem o documento para linguagens específicas.

```text
LabelDocument
├── PPLACompiler
├── PPLBCompiler
├── ZPLCompiler
├── EPLCompiler
└── futuros
```

## Consequências

- frontend permanece independente da impressora;
- uma etiqueta pode ser recompilada para outra linguagem quando compatível;
- capabilities devem ser declaradas por compilador;
- schema deve possuir versionamento e compatibilidade retroativa planejada.
