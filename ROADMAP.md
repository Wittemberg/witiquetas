# Witiquetas — Roadmap Inicial

## Objetivo

Este roadmap organiza o desenvolvimento do Witiquetas em fases validáveis. A prioridade é comprovar primeiro o coração do produto: desenhar uma etiqueta, compilar o layout e gerar um comando que imprima corretamente.

---

## Fase 0 — Fundação

### Objetivo

Criar uma base executável, versionada e implantável antes de construir funcionalidades de negócio.

### Entregas

- monorepo;
- workspace;
- `apps/frontend`;
- `apps/backend`;
- `apps/agent-local`;
- packages compartilhados;
- lint;
- typecheck;
- testes;
- Dockerfiles;
- GitHub Actions;
- GHCR;
- Portainer;
- healthcheck;
- `/api/health`;
- `/api/version`;
- `.env.example`;
- migrations iniciais;
- banco `witiquetas`;
- usuário PostgreSQL exclusivo;
- bucket MinIO/S3 exclusivo;
- configuração do domínio.

### Critério de saída

```text
Frontend responde em produção
+
Backend responde /api/health
+
pipeline publica e redeploya
```

---

## Fase 1 — Editor visual e schema abstrato

### Objetivo

Criar etiqueta visual sem dependência de linguagem de impressora.

### Entregas

- tamanho em mm;
- DPI;
- canvas;
- zoom;
- grade;
- snap;
- texto;
- descrição;
- preço;
- barcode;
- linha;
- retângulo;
- arrastar;
- redimensionar;
- propriedades;
- dados simulados;
- serialização;
- salvar;
- reabrir;
- `LabelDocument v1`;
- undo/redo.

### Critério de saída

Um layout criado no navegador pode ser salvo, recarregado e reproduzido sem perda.

---

## Fase 2 — PPLA/PPLB e TXT

### Objetivo

Comprovar a primeira impressão real.

### Entregas

- interface de compiladores;
- PPLA/PPLB inicial;
- validação de comandos;
- encoding;
- preview textual;
- copiar comando;
- baixar TXT;
- dados simulados;
- primeiros modelos oficiais;
- testes unitários dos compiladores.

### Critério de saída

```text
Editor
→ compile
→ TXT
→ envio manual
→ etiqueta física correta
```

---

## Fase 3 — Agente Local

### Objetivo

Eliminar a etapa manual de envio para impressora.

### Entregas

- instalador Windows;
- pareamento;
- token de instalação;
- heartbeat;
- cadastro de impressora TCP;
- teste de conexão;
- job de impressão;
- idempotência;
- RAW TCP;
- fila local mínima;
- logs;
- diagnóstico;
- atualização assinada.

### Critério de saída

Usuário clica em imprimir no Web e a etiqueta é impressa diretamente na impressora configurada.

---

## Fase 4 — SaaS administrativo

### Objetivo

Transformar o motor validado em plataforma comercial multiempresa.

### Entregas

- cadastro;
- validação de e-mail;
- aprovação;
- customer;
- companies/CNPJs;
- busca CNPJ via provider;
- usuários;
- RBAC;
- troca de filial;
- clonagem de filial;
- clonagem para novo cliente;
- modelos `PLATFORM/CUSTOMER/COMPANY`;
- auditoria;
- histórico de versões;
- restauração.

### Critério de saída

Dois clientes distintos podem operar sem qualquer vazamento de dados e um grupo pode administrar múltiplas filiais.

---

## Fase 5 — Novas linguagens e impressoras

### Objetivo

Expandir compatibilidade mantendo o schema abstrato.

### Prioridade inicial

1. Zebra ZPL;
2. EPL;
3. Elgin conforme modelos/protocolos selecionados;
4. demais linguagens conforme demanda real.

### Entregas

- capability matrix;
- fontes por impressora;
- códigos de barras;
- QR;
- imagens;
- rotação;
- otimizações por linguagem.

---

## Fase 6 — Integrações ERP

### Objetivo

Consumir produtos e alterações de preços de ERPs externos por contrato documentado.

### Entregas

- documentação pública do contrato;
- API keys;
- providers;
- mapeamento para dicionário canônico;
- produtos;
- alteração de preços;
- promoções;
- atacado;
- fidelidade;
- rebaixa;
- unidade de referência;
- preço por litro/kg/unidade;
- datas;
- seleção por checkbox;
- geração em lote.

### Critério de saída

Uma software house externa consegue integrar seu ERP usando somente a documentação Witiquetas.

---

## Fase 7 — Manutenção assistida por IA

### Objetivo

Reduzir tempo de diagnóstico mantendo segurança.

### Entregas

- captura sanitizada de erros;
- incidentes;
- stack trace;
- correlação;
- análise IA;
- sugestão de patch;
- criação de branch/PR;
- testes;
- revisão humana;
- histórico de manutenção.

### Restrição

Nenhuma execução remota arbitrária de scripts em produção.

---

## Princípio de priorização

Nova funcionalidade não deve antecipar fases se ela não for necessária para validar a fase atual.

A primeira prova comercial do produto é:

```text
desenhar
→ compilar
→ imprimir corretamente
```

---

Roadmap inicial: 13/08/2026.
