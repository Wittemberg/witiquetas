# Witiquetas — Consolidação Oficial de Produto e UX (Fase 3.5)

Este documento estabelece a **definição canônica de Produto e a Arquitetura de Experiência do Usuário (UX)** do Witiquetas. Todas as decisões de design, novos módulos, interfaces e fluxos operacionais futuros devem estar em total conformidade com as diretrizes aqui formalizadas.

---

## 1. Definição Oficial do Produto

> **O Witiquetas é uma plataforma multinicho para criação, integração, gerenciamento e impressão de etiquetas térmicas, independente do ERP, do contexto operacional e da linguagem de impressão suportada.**

### O que o Witiquetas É:
- Uma plataforma universal e agnóstica para emissão de etiquetas térmicas industriais e comerciais.
- Um ecossistema completo que une **Design Visual**, **Motor de Regras/Condicionais**, **Compilação de Baixo Nível** e **Agente de Entrega Local**.
- Uma solução multi-tenant orientada a grupos empresariais, filiais e estações de trabalho autônomas.

### O que o Witiquetas NÃO É:
- **Não é um software exclusivo para supermercado ou varejo alimentício.** O varejo supermercadista é apenas um dos inúmeros nichos atendidos.
- **Não é um gerador de PDF/impressão desktop convencional.** O Witiquetas compila comandos nativos diretos para impressoras térmicas (PPLA, PPLB, ZPL, EPL, etc.).
- **Não é acoplado a um banco de dados de ERP específico.** O acesso a dados ocorre exclusivamente por abstração de catálogos e integrações contratuais.

---

## 2. O Princípio Multinicho

> **REGRA DE OURO: O NICHO NÃO DEFINE OUTRO EDITOR.**

Todos os segmentos utilizam rigorosamente o mesmo **Witiquetas Editor**. O nicho operacional selecionado influencia exclusivamente a camada de contexto:
- **Presets e tamanhos sugeridos de mídia;**
- **Terminologia do negócio e placeholders;**
- **Campos comuns sugeridos no catálogo;**
- **Modelos/templates recomendados de fábrica;**
- **Workflows e simbologias de códigos de barras (ex: EAN-13 no varejo, Code 128 / GS1-128 na logística, DataMatrix na saúde);**
- **Experiência inicial (Onboarding).**

### Contextos Operacionais Suportados:
1. **Varejo & Supermercados:** Gôndola, oferta, atacado, clube de fidelidade, preço por unidade de medida.
2. **Logística & E-commerce:** Volumes, caixas, pallets, rastreamento de transporte, identificação de docas.
3. **Saúde, Hospitais & Laboratórios:** Pulseiras de pacientes, tubos de coleta, bolsas de sangue, leitos, prontuários.
4. **Farmácias & Manipulação:** Fórmulas magistrais, posologia, advertências, lotes controlados.
5. **Indústria & Manufatura:** Ordens de produção, rastreabilidade de peças, etiquetas de componentes, controle de qualidade.
6. **Alimentos & Gastronomia:** Validade primária e secundária, tabela nutricional, rotulagem de alérgenos.
7. **Patrimônio & Ativos:** Inventário patrimonial, controle de equipamentos com códigos de barra e QR codes de alta durabilidade.
8. **Eventos & Credenciamento:** Crachás de visitantes, ingressos térmicos, credenciais com pulseira térmica.
9. **Arquivos & Documentos:** Pastas de arquivo morto, processos jurídicos, catalogação de caixas.
10. **Uso Genérico / Livre:** Montagem aberta para qualquer propósito térmico.

---

## 3. Application Shell & Navegação

A interface do Witiquetas adota uma estrutura em **Shell Moderno** com barra lateral recolhível e cabeçalho desacoplado da lógica interna do editor.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ CABEÇALHO: [Breadcrumb / Contexto]     [Empresa/Filial ▼]  [Notificações] [Perfil] │
├──────────────┬──────────────────────────────────────────────────────────────┤
│ SIDEBAR      │ ÁREA DE CONTEÚDO PRINCIPAL                                   │
│              │                                                              │
│ ⊞ Início     │                                                              │
│ ▤ Modelos    │                                                              │
│ ✎ Editor     │                                                              │
│ 🖶 Central    │                                                              │
│ 🖨 Impressoras│                                                              │
│ 💻 Agents     │                                                              │
│ 🔌 Integrações│                                                              │
│ ⚙ Admin      │                                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

### Comportamento da Sidebar:
- **Expandida:** Exibe ícone, nome do módulo e badges de contagem quando aplicável.
- **Recolhida (Compacta):** Exibe exclusivamente os ícones funcionais. Ao passar o mouse (*hover*), exibe *tooltip* com nome e descrição do módulo.
- **Mobile / Tablet:** Transforma-se em *Drawer* deslizante acessível por menu hambúrguer.
- **Distinção Visual de Ícones:**
  - **Central de Impressão:** Ícone focado em operação/fila/documentos de trabalho.
  - **Impressoras:** Ícone focado em hardware físico/dispositivos térmicos.
  - **Agents:** Ícone focado em computadores/estações com o daemon instalado.
  - **Integrações:** Ícone de plug/API de conectividade com ERPs.

### Cabeçalho Unificado:
- **Remoções Arquiteturais:** Foram removidos do cabeçalho global os controles internos do editor (como "Abrir Editor", botões manuais de "Auto-refresh" ou botões redundantes de recarga).
- **Responsabilidades do Cabeçalho:**
  - Identificação e seletor da Empresa/Filial ativa;
  - Breadcrumb do contexto de navegação;
  - Central de notificações operacionais (jobs concluídos, falhas de conectividade);
  - Menu de perfil de usuário e encerramento de sessão.
- **Sincronização:** Atualizações de status e filas operam de forma transparente e em segundo plano (*polling* reativo ou *Server-Sent Events*), sem exigir intervenção do usuário.

---

## 4. Ciclo de Vida do Modelo ("Meus Modelos")

A persistência de modelos visuais é tratada como um recurso de primeira classe da organização:
- **Abrir:** Carrega o `LabelDocument` no editor com histórico e associações de campos preservadas.
- **Salvar / Salvar Alterações:** Persiste o schema no banco de dados da empresa/grupo com versionamento incremental. O botão "Salvar" possui destino garantido e auditável.
- **Duplicar:** Cria uma cópia independente para rápida criação de variações (ex: modelo gôndola 100x30 replicado para 60x30).
- **Renomear e Excluir:** Gestão do ciclo de vida com confirmação defensiva.
- **Imprimir Diretamente:** Permite disparar o modelo para a Central de Impressão sem necessidade de reabrir o canvas.

---

## 5. Central de Impressão Universal (Universal Print Center)

Substitui qualquer conceito limitado de "grade de produtos de supermercado". A Central de Impressão é uma mesa operacional genérica onde cada linha representa uma entidade a ser impressa:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [🔍 Buscar paciente, prontuário ou leito...                               ] │
├────┬────────────────────────┬─────────────┬───────────┬──────────┬──────────┤
│ ☐  │ Registro / Identificador│ Contexto    │ Destaque  │ Qtd      │ Ações    │
├────┼────────────────────────┼─────────────┼───────────┼──────────┼──────────┤
│ ☑  │ PAC-2026-8841          │ Maria Souza │ Leito 402 │ [ 2 ]    │ Imprimir │
│ ☐  │ PAC-2026-8842          │ João Silva  │ UTI Posto │ [ 1 ]    │ Imprimir │
└────┴────────────────────────┴─────────────┴───────────┴──────────┴──────────┘
```

### Regras da Central de Impressão:
1. **Busca Contextual Única:** Uma única caixa de busca inteligente. O placeholder e os campos pesquisados são fornecidos dinamicamente pelo catálogo do ERP ou pelo modelo ativo (ex: *"Buscar código, EAN ou descrição..."* no varejo; *"Buscar paciente, prontuário ou atendimento..."* na saúde).
2. **Colunas Dinâmicas:** As colunas exibidas na tabela são derivadas automaticamente dos campos utilizados no modelo selecionado ou declarados na integração.
3. **Seleção e Lote:** Suporte a seleção por checkbox, ajuste de cópias individuais e disparo em lote para a impressora e Agent desejados.

---

## 6. Regras de UX do Editor Visual

O **Witiquetas Editor** opera com base em física e segurança de layout:

1. **Limite Físico Absoluto (Bounds Clamping):** Nenhum elemento visual (texto, código de barras, imagem, moldura) pode ultrapassar a área física da etiqueta definida em milímetros. Movimentos de arrastar (*drag*), redimensionamento (*resize*), rotação e movimentação em grupo são bloqueados ou limitados na borda física.
2. **Margem Segura de 1.0 mm:** Linha visual de recomendação reduzida para **1.0 mm** das bordas físicas. A margem segura atua como guia visual para prevenir cortes térmicos, enquanto o limite físico é uma restrição matemática estrita.
3. **Rotação Precisa com Magnetic Snap:** O editor permite rotação contínua (0° a 360°), aplicando atração magnética suave (*magnetic snap*) exclusivamente nos ângulos cardinais ortogonais: **0°, 90°, 180° e 270°**.
4. **Tratamento de Texto & Auto-Ajuste:**
   - Adicionado recurso: **"Ajustar fonte automaticamente"** (*Auto-fit*), que reduz proporcionalmente o tamanho da fonte para acomodar descrições longas sem exigir corte manual ou quebra destrutiva.
   - Removido o controle obsoleto "Recorte de Campo" da interface padrão.
5. **Molduras e Formas:** Fundo transparente por padrão; controle de espessura claro; sem poluição de propriedades redundantes.
6. **QR Code e Simbologias 2D:**
   - Proporção estritamente bloqueada em **1:1** para prevenir deformações que impeçam leitura óptica.
   - Zona silenciosa (*Quiet Zone*) e contraste mantidos automaticamente.
   - *Golden Test Manual*: URL canônica de validação `https://www.globo.com` legível por qualquer smartphone.

---

## 7. Regras de Exibição e Preview Condicional

### Regras de Exibição (Substituição de "Condição Fx")
- A interface substitui rótulos técnicos opacos por declarações semânticas legíveis: **"Mostrar este conteúdo quando..."**
- Regras de exibição podem depender de valores da integração, campos do sistema ou expressões lógicas combinadas (ex: `PRECO_PROMOCAO > 0 && CLIENTE_CLUBE == true`).
- Apenas elementos compatíveis com controle condicional expõem essas configurações no painel de propriedades.

### Preview Condicional ("Visualizar como")
- O conceito de "Cenário" passa a se chamar oficialmente: **"Visualizar como"** (*Simula diferentes condições dos dados para conferir como a etiqueta será impressa*).
- Ao importar modelos que possuam regras lógicas (ex: `[[SE]]`, `[[SENAO]]`), o analisador detecta as combinações de variáveis e gera automaticamente os botões de simulação no editor.
- **Golden Model Oficial:** O arquivo real [`16-ARGOX REGRA - ATACADO.txt`](file:///c:/Users/start/OneDrive/Área%20de%20Trabalho/Aprendendo/Witiquetas/witiquetas) é a fixture canônica de referência para simulação de:
  - *Venda normal*
  - *Promoção*
  - *Atacado*
  - *Fidelidade / Clube*

---

## 8. Recursos Contextuais e Bibliotecas

Para evitar menus primários vazios ou desconexos, recursos visuais e elementos reaproveitáveis são disponibilizados dentro do próprio contexto de edição:
- Ao inserir **QR Code**, o painel oferece a aba contextual: **QRs Salvos**.
- Ao inserir **Imagem/Logo**, o painel oferece a aba: **Imagens & Logotipos**.
- A gestão de modelos fica concentrada no menu **Modelos**.
- Um módulo global "Bibliotecas" só será criado no futuro caso haja volume que justifique uma visão unificada de ativos.

---

## 9. Experiência do Usuário no Agent (Instalação Comercial)

> **DIRETRIZ DE INSTALAÇÃO: Um operador leigo deve ser capaz de instalar e conectar o Witiquetas Agent sem abrir terminal, PowerShell, `services.msc` ou editar arquivos de texto.**

### Fluxo Comercial de Instalação:
```text
Baixar Instalador (.exe)
  → Executar assistente gráfico
  → Serviço Windows registrado automaticamente em segundo plano
  → Digitar código de pareamento no prompt do assistente ou System Tray
  → Status "Conectado" imediato
```

### Características do Agent Comercial:
- Ícone oficial integrado no **System Tray (Área de Notificação)**;
- O fechamento da janela do Tray **não encerra** o serviço de impressão em segundo plano;
- Acesso rápido pelo Tray para visualização de status, diagnóstico de impressoras e botão "Reconectar / Re-parear";
- A linha de comando (`--install-service`, `--service-status`, etc.) permanece disponível como ferramenta avançada para administradores de TI e automações remotas.

---

## 10. Login, Perfis (RBAC) e Licenciamento

A governança multi-tenant do Witiquetas é estruturada em 4 entidades complementares:

1. **Empresa (Tenant):** Agrupamento corporativo (CNPJ Matriz e Filiais) que isola modelos, impressoras, logs e integrações.
2. **Usuário:** Identidade autenticada individual com e-mail, senha e verificação em duas etapas opcional.
3. **Perfil / Papel (Role):** Conjunto de permissões funcionais:
   - **Administrador:** Acesso completo (empresas, filiais, usuários, licenças, integrações, auditoria).
   - **Designer:** Criação e alteração de modelos, gestão de layouts e bibliotecas visuais.
   - **Operador:** Acesso restrito à Central de Impressão, seleção de dados e disparo de trabalhos para impressoras autorizadas.
4. **Licença:** Define a capacidade operacional do tenant:
   - Status (Ativa, Trial, Bloqueada, Cancelada);
   - Vigência (Início e expiração);
   - Limites quantitativos: número de usuários simultâneos, impressoras cadastradas, Agents ativos e módulos habilitados.

---

## 11. Identidade Visual

Os estudos visuais aprovados orientam a criação dos assets finais em três formatos padronizados:
- **App Icon:** Símbolo representativo estilizado combinando a letra **W**, o conceito de precisão térmica e a estrela de qualidade.
- **Favicon:** Versão simplificada de alto contraste legível em 16x16 e 32x32 pixels.
- **Full Logo:** Símbolo + tipografia oficial Witiquetas para cabeçalhos, instaladores e documentação institucional.

---

## 12. Laboratório de Inovação ("Sonhos Impossíveis")

### Universal Scale Gateway (Laboratório)
- **Status:** Fora do roadmap comercial e de produção atual.
- **Escopo:** Pesquisa conceitual para potencial integração futura com balanças comerciais térmicas multimarcas (Toledo, Filizola, Urano, Elgin, etc.).
- **Condições Estritas:** Esta funcionalidade só será abordada caso existam APIs formais documentadas, parcerias homologadas com os fabricantes, conformidade jurídica/regulatória (INMETRO) e viabilidade comercial.
- **PROIBIÇÃO:** É expressamente proibido basear a arquitetura atual do Witiquetas em engenharia reversa de protocolos proprietários de balanças ou suposições de compatibilidade não autorizadas.
