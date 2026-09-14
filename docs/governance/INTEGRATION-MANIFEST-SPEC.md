# Integration Manifest — Especificação Arquitetural (PLANNED)

> Documento de contrato futuro. Não significa que conectores ERP estejam implementados.

## Objetivo
Permitir que qualquer ERP/fonte declare capacidades sem contaminar o domínio canônico do Witiquetas.

## Exemplo conceitual
```json
{
  "manifestVersion": "1",
  "integrationId": "example-erp",
  "displayName": "Example ERP",
  "capabilities": ["products.read", "prices.read"],
  "fields": [
    {
      "external": "PRECO_VENDA",
      "canonical": "produto.preco",
      "direction": "read"
    }
  ]
}
```

## Regras
- manifest versionado;
- external field nunca vira automaticamente campo canônico;
- adapter transforma externo → canônico;
- credenciais não pertencem ao manifest;
- Company Configuration decide se integração está ativa;
- Role/User permission decide acesso;
- niche decide relevância;
- disponibilidade efetiva é calculada server-side;
- integração ausente não pode simular valor;
- SYSTEM continua independente de ERP.

## Futuro Integration Flow
Uma camada visual poderá encadear fontes e transformações tipadas:

Source → Query/Fetch → Mapper → Transform → Canonical Data → Witiquetas.

Nodes devem possuir inputs/outputs tipados e contrato versionado. Evitar executar código arbitrário fornecido pelo usuário.

## MCP
MCP pode ser um provider futuro, não uma dependência central. Qualquer MCP deve passar pelo mesmo contrato de capabilities, tenant isolation, permissionamento e auditoria.
