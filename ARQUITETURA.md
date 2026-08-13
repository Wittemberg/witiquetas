# Witiquetas — Arquitetura

## 1. Propósito

Este documento registra a arquitetura de alto nível e as decisões estruturais do Witiquetas antes do início da implementação.

Ele não substitui a documentação detalhada dos três pilares:

- `DOCUMENTACAO-FRONTEND.md`
- `DOCUMENTACAO-BACKEND.md`
- `DOCUMENTACAO-AGENTE-LOCAL.md`

As razões por trás das decisões mais relevantes ficam registradas em `docs/decisions/`.

---

## 2. Visão do produto

O Witiquetas será uma plataforma comercial para criação, gestão, compilação e impressão de etiquetas térmicas, com foco inicial em etiquetas de gôndola.

O produto deve ser:

- independente de ERP;
- independente de fabricante de impressora;
- multiempresa e multifilial;
- extensível para novas linguagens de impressão;
- operável via Web;
- capaz de imprimir diretamente em impressoras locais por meio de Agente Local;
- auditável;
- atualizável;
- preparado para comercialização SaaS.

---

## 3. Três pilares

```text
┌──────────────────┐
│   FRONTEND WEB   │
│ React/TypeScript │
└────────┬─────────┘
         │ HTTPS
         ▼
┌──────────────────┐
│   BACKEND/API    │
│ NestJS/TypeScript│
└───────┬──────────┘
        │
        ├──────────── PostgreSQL
        │
        ├──────────── MinIO / S3
        │
        └──────────── Print Jobs
                           │
                           ▼
                  ┌─────────────────┐
                  │  AGENTE LOCAL   │
                  │  Tauri / Rust   │
                  └────────┬────────┘
                           │
                  RAW TCP / Serial /
                   USB / Spooler
                           │
                           ▼
                     Impressora
```

---

## 4. Princípios que não devem ser quebrados sem ADR

### 4.1 Cliente não é CNPJ

```text
Customer / Grupo
├── Company / CNPJ Matriz
├── Company / CNPJ Filial 02
├── Company / CNPJ Filial 03
└── Company / CNPJ Filial N
```

O contrato comercial pode pertencer ao `Customer`, enquanto configurações operacionais e fiscais podem pertencer a `Company`.

### 4.2 O frontend não compila linguagens de impressão

O editor gera um `LabelDocument` abstrato.

```text
Editor Visual
   ↓
LabelDocument
   ↓
Backend
   ↓
Compiler
   ├── PPLA
   ├── PPLB
   ├── ZPL
   ├── EPL
   └── futuros
```

### 4.3 O Agente Local não contém regra de negócio

O agente:

- autentica a instalação;
- recebe job autorizado;
- transmite bytes;
- registra resultado;
- mantém fila local mínima;
- atualiza-se.

Ele não consulta ERP e não decide conteúdo de etiqueta.

### 4.4 Persistência tem responsabilidades claras

```text
PostgreSQL
→ dados relacionais e transacionais

MinIO/S3
→ arquivos, imagens, logos, exports e anexos
```

### 4.5 Produção é atualizada por pipeline

Frontend/backend:

```text
main
→ GitHub Actions
→ GHCR
→ Portainer webhook
→ redeploy
```

Agente:

```text
tag
→ GitHub Actions
→ build assinado
→ release
→ updater
```

---

## 5. Monorepo

Estrutura alvo:

```text
witiquetas/
├── apps/
│   ├── frontend/
│   ├── backend/
│   └── agent-local/
├── packages/
│   ├── contracts/
│   ├── label-schema/
│   ├── printer-core/
│   ├── printer-ppla/
│   ├── printer-pplb/
│   ├── printer-zpl/
│   ├── printer-epl/
│   └── ui/
├── infrastructure/
├── docs/
└── .github/
```

Aplicações não importam código interno umas das outras.

Código compartilhado deve existir em `packages/*`.

---

## 6. Modelo abstrato de etiqueta

Exemplo conceitual:

```json
{
  "schemaVersion": 1,
  "label": {
    "widthMm": 100,
    "heightMm": 30,
    "dpi": 203
  },
  "elements": [
    {
      "id": "description",
      "type": "text",
      "field": "produto.descricao",
      "x": 10,
      "y": 10,
      "width": 400,
      "height": 50,
      "wrap": "auto"
    }
  ]
}
```

Esse schema deve ser versionado.

Nunca alterar significado de versão publicada sem migration/conversão explícita.

---

## 7. Escopo dos modelos

```text
PLATFORM
CUSTOMER
COMPANY
```

`PLATFORM`:
- criado pela plataforma;
- oficial;
- somente leitura para cliente;
- clonável.

`CUSTOMER`:
- compartilhado pelo grupo;
- disponível para suas empresas.

`COMPANY`:
- exclusivo de um CNPJ/filial.

---

## 8. Segurança multi-tenant

Toda requisição autenticada deve resolver o contexto do usuário no backend.

O backend não confia em `customerId` ou `companyId` enviado pelo navegador sem validar o vínculo.

Regra:

```text
Autenticação
→ identidade
→ permissões
→ customer permitido
→ company permitida
→ operação
```

---

## 9. Integração ERP

O Witiquetas não deverá acessar diretamente o banco de cada ERP como arquitetura principal.

A integração futura deverá ocorrer por contrato de API documentado.

O ERP fornece dados; o Witiquetas normaliza para seu dicionário canônico.

---

## 10. IA e manutenção

A IA pode:

- analisar erro;
- sugerir causa;
- propor patch;
- sugerir teste;
- preparar branch/PR.

A IA não pode:

- executar shell arbitrário em produção;
- alterar binário do agente fora do updater;
- acessar segredos desnecessários;
- aplicar correção sem pipeline/revisão.

---

## 11. Endereço e infraestrutura

Produção:

```text
https://witiquetas.wrtec.com.br
```

API:

```text
https://witiquetas.wrtec.com.br/api
```

Rede Docker/Swarm:

```text
interna
```

Imagens:

```text
ghcr.io/wittemberg/witiquetas-frontend
ghcr.io/wittemberg/witiquetas-backend
```

---

## 12. Alterações arquiteturais

Uma alteração deve gerar ADR quando modificar qualquer um destes pontos:

- separação dos três pilares;
- multi-tenancy;
- formato do `LabelDocument`;
- mecanismo de compilação;
- mecanismo de impressão;
- banco principal;
- armazenamento de objetos;
- autenticação/autorização;
- estratégia de atualização;
- modelo de integração ERP.

---

Documento inicial: 13/08/2026.
