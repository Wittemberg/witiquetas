# Witiquetas — DOCUMENTACAO-FRONTEND

## 1. Objetivo

O frontend do **Witiquetas** será a aplicação Web responsável pela experiência administrativa e operacional da plataforma, incluindo o editor visual de etiquetas de gôndola, gestão de clientes/grupos, empresas/filiais, usuários, permissões, modelos de etiqueta, fila de impressão e comunicação indireta com o Agente Local.

**URL inicial de produção**

```text
https://witiquetas.wrtec.com.br
```

**Repositório**

```text
https://github.com/Wittemberg/witiquetas
```

A arquitetura deve tratar o frontend como um consumidor da API. Regras de negócio, segurança multi-tenant, persistência, compilação de linguagens e controle de impressão não devem ficar acoplados à interface.

---

## 2. Stack

A implantação segue o padrão operacional já utilizado no `admin-ofertas-front`: build em Node, imagem Docker no GHCR, frontend estático em Nginx, publicação pelo GitHub Actions e redeploy via webhook do Portainer.

| Tecnologia | Uso |
|---|---|
| React 19 | Interface SPA |
| TypeScript | Tipagem do frontend e contratos |
| Vite | Build e ambiente de desenvolvimento |
| React Router DOM | Rotas |
| TailwindCSS | Estilização |
| Axios | Cliente HTTP |
| TanStack Query | Cache e sincronização com a API |
| Zustand | Estado do editor |
| React Hook Form + Zod | Formulários e validação |
| Konva.js / react-konva | Canvas do editor visual |
| Nginx | Servir o build em produção |

Todo novo código deve ser TypeScript.

---

## 3. Estrutura do monorepo

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
│   ├── portainer/
│   └── docker/
├── docs/
├── .github/
│   └── workflows/
├── DOCUMENTACAO-FRONTEND.md
├── DOCUMENTACAO-BACKEND.md
└── DOCUMENTACAO-GENTE-LOCAL.md
```

Não criar dependência direta entre as aplicações. Compartilhamento deve ocorrer por `packages/*`.

---

## 4. Princípio central do editor

O frontend **não gera PPLA, PPLB, ZPL, EPL ou outra linguagem diretamente**.

O editor persiste um modelo abstrato:

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

A compilação para linguagem de impressora pertence ao backend/engine.

---

## 5. Domínios funcionais

### 5.1 Autenticação

Rotas previstas:

```text
/login
/cadastro
/verificar-email
/esqueci-senha
/redefinir-senha
```

Cadastro empresarial deve contemplar:

- CNPJ;
- razão social;
- nome fantasia;
- inscrição estadual;
- endereço;
- telefone;
- e-mail;
- responsável;
- validação de e-mail;
- status de aprovação administrativa.

Quando não houver inscrição estadual, utilizar `ISENTO`.

A busca automática de CNPJ deverá ser feita pelo backend por meio de provider desacoplado. O frontend não acessa diretamente serviços externos de consulta fiscal.

### 5.2 Cliente, grupo e filiais

O sistema deve separar:

```text
Cliente / Grupo
└── Empresas / Filiais / CNPJs
```

Um cliente pode possuir N filiais.

A interface deve permitir troca de filial ativa sem logout.

Ações administrativas:

```text
CRIAR FILIAL A PARTIR DESTA EMPRESA
CRIAR NOVO CLIENTE USANDO COMO MODELO
```

Na clonagem deve ser possível selecionar o que copiar:

- configurações gerais;
- modelos próprios;
- tamanhos de etiqueta;
- preferências;
- impressoras;
- linguagens habilitadas;
- perfis/regras;
- estrutura de integração.

Não copiar automaticamente:

- CNPJ;
- endereço fiscal;
- IE;
- tokens;
- senhas;
- credenciais de API;
- histórico;
- produtos/cache;
- logs.

### 5.3 Usuários e permissões

Rotas:

```text
/usuarios
/perfis
```

Perfis iniciais:

| Perfil | Finalidade |
|---|---|
| `superadmin` | Administração global Witiquetas |
| `customer_admin` | Administração do grupo |
| `company_admin` | Administração de filial |
| `editor` | Edição de modelos |
| `operator` | Operação e impressão |
| `viewer` | Consulta |

Permissões devem ser granulares:

```text
template.read
template.create
template.edit
template.clone
template.delete
printer.read
printer.configure
printer.print
company.read
company.edit
users.read
users.manage
integration.read
integration.configure
maintenance.read
maintenance.request_ai_analysis
```

### 5.4 Modelos

Escopo:

```text
PLATFORM
CUSTOMER
COMPANY
```

- `PLATFORM`: oficial Witiquetas, somente leitura para cliente;
- `CUSTOMER`: compartilhado pelo grupo;
- `COMPANY`: exclusivo de uma filial.

Modelo oficial poderá ser clonado sem alterar o original.

Todo modelo deverá ser versionado e restaurável.

### 5.5 Editor visual

Funcionalidades mínimas:

- tamanho físico em mm;
- DPI;
- zoom;
- régua;
- grade;
- snap;
- seleção;
- arrastar;
- redimensionar;
- alinhamento;
- ordem de camadas;
- duplicação;
- copiar/colar;
- desfazer/refazer;
- bloqueio;
- visibilidade;
- edição numérica de posição e tamanho;
- preview com dados simulados;
- salvar rascunho;
- publicar versão.

Elementos:

- texto;
- descrição;
- preço;
- preço promocional;
- preço atacado;
- preço fidelidade;
- preço rebaixa;
- código interno;
- EAN;
- barcode;
- QR Code;
- unidade comercial;
- unidade de referência;
- preço por unidade de referência;
- datas;
- linha;
- retângulo;
- imagem/logo.

### 5.6 Quebra de texto

```text
wrap: auto | manual | none
maxLines: number | null
overflow: clip | shrink | ellipsis
alignment: left | center | right
verticalAlignment: top | middle | bottom
```

O preview deve representar a saída real da impressora sempre que tecnicamente possível.

### 5.7 Fontes

Diferenciar:

1. fonte visual do navegador;
2. fonte nativa da impressora;
3. fonte rasterizada/convertida.

Cada compilador deve declarar as capacidades disponíveis.

### 5.8 Teste e TXT

Fluxo prioritário inicial:

```text
Editor
→ dados simulados
→ compilar
→ visualizar comando
→ copiar
→ baixar .txt
→ testar fisicamente
```

Integração ERP fica fora da primeira etapa.

---

## 6. Dicionário canônico de campos

O frontend não deve depender de nomes de colunas do ERP.

Exemplos:

```text
produto.codigo
produto.descricao
produto.ean
produto.unidade
produto.preco
produto.promocao.preco
produto.promocao.inicio
produto.promocao.fim
produto.atacado.quantidade
produto.atacado.preco
produto.fidelidade.preco
produto.rebaixa.preco
produto.referencia.unidade
produto.referencia.quantidade
produto.referencia.preco
produto.fabricante
empresa.razaoSocial
empresa.nomeFantasia
impressao.data
impressao.hora
```

O contrato ficará em `packages/contracts`.

---

## 7. Comunicação com a API

Recomendação:

```text
https://witiquetas.wrtec.com.br/api
```

Variáveis públicas:

```env
VITE_API_BASE_URL=/api
VITE_APP_NAME=Witiquetas
VITE_APP_ENV=production
```

Nunca colocar segredos em variáveis `VITE_*`.

---

## 8. Agente Local

O navegador não abrirá conexão RAW TCP, USB ou serial com impressoras.

A interface mostrará:

```text
ONLINE
OFFLINE
DESATUALIZADO
ERRO
BLOQUEADO
```

Dados relevantes:

- versão;
- computador;
- filial;
- última comunicação;
- impressoras;
- último job;
- atualização disponível.

---

## 9. Deploy

Fluxo:

```text
push main
→ GitHub Actions
→ build
→ push ghcr.io/wittemberg/witiquetas-frontend:latest
→ webhook Portainer
→ redeploy
```

Rede externa Swarm:

```text
interna
```

Traefik:

```text
Host(`witiquetas.wrtec.com.br`)
```

O backend deve receber `/api`.

TLS:

```text
letsencryptresolver
```

---

## 10. Qualidade

Obrigatório no pipeline:

- lint;
- typecheck;
- testes;
- build;
- validação de schemas;
- verificação de secrets.

---

## 11. Primeira entrega

A primeira versão deverá permitir:

- autenticação básica de desenvolvimento;
- tamanho da etiqueta;
- texto, preço e barcode;
- movimentação e redimensionamento;
- propriedades;
- dados simulados;
- salvar/reabrir layout;
- compilar;
- visualizar/copiar/baixar TXT;
- histórico de versões.

---

## 12. Convenções

- código em inglês;
- documentação em português;
- UUID;
- API em ISO 8601;
- timezone operacional `America/Sao_Paulo`;
- Conventional Commits;
- branch principal `main`.

---

## 13. POLÍTICA DE NÃO REGRESSÃO

> **Princípio de Estabilidade de Layout:**
> Componentes e fluxos visualmente aprovados são considerados baseline intocável.
> Solicitações pontuais devem modificar apenas o escopo diretamente relacionado.
> Alterações estruturais de UX/UI em áreas já aprovadas exigem solicitação explícita ou justificativa técnica apresentada antes da implementação.

---

Documento inicial: 13/08/2026.
Atualização: 15/08/2026.
