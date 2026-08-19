# Witiquetas — Roadmap Oficial Consolidado (Fase 3.5)

Este documento estabelece o **Roadmap Oficial de Implementação da Fase 3.5**, categorizando as entregas por nível de prioridade arquitetural e de produto (P0, P1, P2 e Laboratório).

---

## 1. Prioridade P0 — Fundação do Editor, Dados e Shell

As entregas P0 representam os requisitos essenciais para a usabilidade e consistência do editor, da navegação e do ciclo de vida dos modelos.

### P0.1 — Editor Confiável (Physical Constraints & UX)
- [ ] **Physical Bounds Clamping:** Bloqueio estrito de movimentação, rotação e redimensionamento para impedir que elementos ultrapassem a borda física da mídia.
- [ ] **Margem Segura de 1.0 mm:** Guia visual de recomendação reduzida para 1.0 mm (não bloqueante, porém visualmente destacada).
- [ ] **Magnetic Snap nos Ângulos Cardinais:** Atração magnética suave exclusivamente em 0°, 90°, 180° e 270°.
- [ ] **QR Code 1:1:** Bloqueio dimensional estrito na proporção quadrada 1:1 com teste de leitura garantido para `https://www.globo.com`.
- [ ] **Ajuste de Fonte Automático (Auto-fit):** Redução proporcional dinâmica do tamanho do texto para acomodar descrições longas sem corte destrutivo.
- [ ] **Moldura Limpa:** Fundo transparente padrão e simplificação dos controles de espessura de borda.

### P0.2 — Universal Data Binding & Field Catalog
- [ ] **Campos do Sistema Witiquetas:** Suporte ao campo canônico `system.printDateTime` (formatos: Data, Data e Hora, Hora) com preview dinâmico no editor e resolução no momento da geração do job.
- [ ] **Dropdown de Campos Dinâmicos:** Seletor hierárquico no painel de propriedades exibindo campos da integração agrupados por categoria.
- [ ] **Conteúdo Manual:** Suporte nativo e desacoplado para textos e valores estáticos.
- [ ] **Hierarquia de UX:** Prioridade de exibição padrão: *Integração > Sistema > Manual*.

### P0.3 — Conditional Preview ("Visualizar como")
- [ ] **Interface "Visualizar como":** Seletor intuitivo para simulação de cenários de dados no canvas (substituindo o antigo termo "Cenário").
- [ ] **Detecção Automática de Variações:** Geração automática de botões de simulação ao importar modelos contendo regras lógicas.
- [ ] **Golden Model de Regras:** Validação oficial dos cenários de *Venda normal*, *Promoção*, *Atacado* e *Fidelidade* utilizando o arquivo real `16-ARGOX REGRA - ATACADO.txt`.

### P0.4 — Ciclo de Vida do Modelo ("Meus Modelos")
- [ ] **Persistência Completa:** Fluxo de salvar e atualizar no banco de dados com feedback visual imediato.
- [ ] **Operações de Gestão:** Abrir, renomear, duplicar e excluir modelos com confirmação de segurança.
- [ ] **Disparo Direto:** Botão para envio rápido do modelo para a Central de Impressão.

### P0.5 — Application Shell & Navegação
- [ ] **Sidebar Recolhível:** Menu com estados expandido/compacto (com tooltips descritivos no hover) e Drawer no mobile/tablet.
- [ ] **Ícones Diferenciados:** Distinção visual explícita entre Central de Impressão, Impressoras físicas, Agents e Integrações.
- [ ] **Header Desacoplado:** Remoção de controles internos do editor do cabeçalho global; foco em breadcrumb, empresa/filial, notificações e perfil.

---

## 2. Prioridade P1 — Central de Impressão, Smart Import & Governança

As entregas P1 expandem a plataforma para fluxos operacionais de alta produtividade, governança e experiência comercial.

### P1.1 — Smart Import (ImportLayoutAnalyzer)
- [ ] **Compreensão Estrutural:** Análise de repetição de elementos, múltiplas colunas de códigos de barra e agrupamentos espaciais.
- [ ] **Sugestão Inteligente de Uso:** Recomendação de template com índice de confiança (ex: *"Etiqueta Múltipla de 3 Colunas — Confiança 95%"*).
- [ ] **Extração Automática de Regras:** Mapeamento de blocos `[[SE]]` legados para o modelo de Regras de Exibição do Witiquetas.

### P1.2 — Central de Impressão Universal (Universal Print Center)
- [ ] **Busca Contextual Única:** Campo de busca inteligente com placeholder dinâmico fornecido pelo contexto (varejo, hospital, logística, etc.).
- [ ] **Grid com Colunas Dinâmicas:** Tabela gerada automaticamente com base nos dados exigidos pelo modelo selecionado.
- [ ] **Fila Operacional & Lote:** Seleção de registros por checkbox, ajuste de cópias e despacho em massa para a impressora de destino.

### P1.3 — RBAC, Multi-Tenancy & Licenciamento
- [ ] **Entidades de Governança:** Separação estrita entre Empresa (Tenant), Usuário (Identidade), Perfil (Permissões) e Licença (Capacidade).
- [ ] **Perfis Padrão:** Administrador, Designer e Operador controlando visibilidade de itens no menu.
- [ ] **Gestão de Licenças & Trial:** Controle de vigência, limites de impressoras/agents e demonstrações para parceiros.

### P1.4 — Experiência do Usuário no Agent (Instalador Gráfico & Tray)
- [ ] **Instalador sem CLI:** Assistente executável (`.exe`) que registra o Windows Service automaticamente sem exigir terminal ou privilégios manuais.
- [ ] **System Tray App:** Ícone na barra de tarefas para visualização de status, diagnóstico rápido e re-pareamento amigável.

### P1.5 — Printer Language Knowledge Base
- [ ] **Catalogação Sistemática:** Documentação estruturada de todos os comandos conhecidos de PPLA, PPLB, ZPL e EPL com unidades, efeito físico e representação visual.

---

## 3. Prioridade P2 — Ecossistema Aberto de Integração

### P2.1 — Integration SDK & API Pública
- [ ] **Contrato OpenAPI / Swagger:** Especificação formal para que ERPs externos declarem catálogos de campos e enviem registros.
- [ ] **Webhooks e Proxy de Consulta:** Permite à Central de Impressão consultar bancos de ERPs parceiros sob demanda em tempo real.

---

## 4. Laboratório de Inovação ("Sonhos Impossíveis")

### Universal Scale Gateway (Pesquisa Conceitual)
- [ ] **Status:** Fora do roadmap comercial ativo.
- [ ] **Diretriz:** Pesquisa futura para integração universal com balanças comerciais térmicas multimarcas exclusivamente sob contratos formais, APIs homologadas e autorização dos fabricantes.
- [ ] **Restrição:** Proibida qualquer engenharia reversa de protocolos proprietários.

---

## 5. Golden Models Oficiais de Teste e Regressão

Os arquivos de etiquetas reais coletados durante as fases anteriores passam a ser fixtures protegidas para validação de regressão contínua:

1. **`16-ARGOX REGRA - ATACADO.txt` (Golden Model Principal de Regras):**
   - Valida round-trip PPLB Diff Zero;
   - Valida 4 cenários lógicos: *Venda normal*, *Promoção*, *Atacado* e *Fidelidade*;
   - Valida formatação de preços e cálculo de unidade de medida.
2. **Modelos de Gôndola Simples (Normal / Promoção):**
   - Validação de layout padrão de 1 coluna com e sem preço promocional.
3. **Modelos de 3 Colunas (Etiqueta Múltipla de Identificação):**
   - Validação de repetição espacial de códigos de barra e precisão de corte.
