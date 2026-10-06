# Especificação de Experiência do Usuário Zero-Terminal (UX Guide)
**Design de Interação e Experiência do Operador Final (Agent G)**  
*Status: DOCUMENTO CANÔNICO DE PESQUISA*  
*Data de Conclusão: Outubro de 2026*

---

## 1. Princípio Fundamental de Design

> **"A infraestrutura de impressão deve ser invisível."**  
> Um operador de caixa ou estoquista não é técnico de suporte. Ele nunca deve ver uma tela preta do PowerShell, nunca deve precisar saber o que é um `PID`, um `socket` ou um arquivo `JSON`, e nunca deve ter que editar um arquivo de configuração com o Bloco de Notas.

---

## 2. A Jornada Completa em Três Fases

```
[ FASE 1: WEB ]                 [ FASE 2: SETUP ]                 [ FASE 3: OPERAÇÃO ]
Witiquetas Web                   Instalador Gráfico                Bandeja do Sistema
- Clica em "Adicionar Agente"    - Executa WitiquetasAgentSetup    - Ícone discreto (Verde: OK)
- Detecta Windows automaticamente- Digita código WIT-XXXX-XXXX     - Serviço rodando silencioso
- Gera código WIT-7K4P-92MX      - Teste automático de conexão     - Sem janelas abertas
- Download em 1 clique           - Impressoras encontradas         - Pronto para imprimir
```

---

## 3. Fase 1: A Experiência Web (Witiquetas Web)

### 3.1. Localização no Painel
Navegação: `Witiquetas Web` → `Administração` → `Agentes de Impressão` → Botão de Destaque: **[ + Conectar Novo Computador ]**.

### 3.2. Modal Inteligente de Pareamento
Ao clicar no botão, um modal moderno é exibido com:

1. **Detecção Automática de Sistema Operacional:**  
   Através da API `navigator.userAgentData`, o painel identifica se o usuário está no Windows (64-bit), macOS ou Linux, pré-selecionando o botão correto:
   - Botão Primário: **[ ⬇ Baixar Instalador para Windows (64-bit) ]**
   - Link discreto: *"Outros sistemas operacionais (Linux, Mac, 32-bit)"*
2. **Exibição do Código de Pareamento:**  
   Em tipografia grande, monoespaçada e de alto contraste:
   ```
   +-----------------------------------------+
   |   CÓDIGO DE CONEXÃO DO SEU COMPUTADOR   |
   |                                         |
   |           WIT - 7K4P - 92MX             |
   |                                         |
   |    [ 📋 Copiar Código ]   [ 📱 Ver QR ] |
   +-----------------------------------------+
   ```
3. **Instruções Visuais em Três Passos (Sem texto técnico):**
   - **Passo 1:** Baixe e execute o instalador.
   - **Passo 2:** Cole o código acima quando solicitado.
   - **Passo 3:** Conexão pronta! Suas impressoras aparecerão aqui automaticamente.
4. **Indicador de Espera em Tempo Real:**  
   O modal aguarda ativamente o sinal da nuvem via WebSocket. Assim que o instalador conclui o pareamento no computador local, o modal se transforma em uma animação de sucesso verde: *"Computador 'PDV-01' conectado com sucesso!"*.

---

## 4. Fase 2: O Assistente Gráfico de Instalação (Windows Setup)

O executável `WitiquetasAgentSetup.exe` utiliza janela com design moderno, cantos arredondados e identidade visual alinhada ao Witiquetas Web:

### Telas do Assistente:

| Tela | Título Visual | O que o Usuário Vê | O que o Sistema Faz por Baixo |
| :--- | :--- | :--- | :--- |
| **1** | **Bem-vindo ao Witiquetas** | Logo oficial, mensagem amigável de boas-vindas e botão "Avançar". | Solicita elevação de UAC de forma limpa. |
| **2** | **Verificando Computador** | Três itens com checkmarks verdes animados: <br>✔ Conexão com a Internet <br>✔ Acesso aos servidores Witiquetas <br>✔ Permissões de instalação | Testa DNS, resolução de domínio e permissão de escrita em `Program Files` e `ProgramData`. |
| **3** | **Código de Conexão** | Caixa de texto dividida: `WIT - [    ] - [    ]` com botão "Colar". | Converte automaticamente para maiúsculas e remove hífens acidentais. |
| **4** | **Conectando à Empresa** | Spinner suave seguido de: *"Conectado a: Supermercado Modelo Ltda"*. | Envia handshake criptográfico ao backend validando o código temporário. |
| **5** | **Instalando Serviço** | Barra de progresso contínua. | Instala o Windows Service `WitiquetasAgent`, define auto-start e configura recuperação. |
| **6** | **Detectando Impressoras** | *"Encontramos 2 impressoras locais:"* <br>🖨 Zebra ZD220 (USB) <br>🖨 Elgin L42 Pro (192.168.1.150) | Varre portas USB locais e subnet local na porta 9100, registrando as impressoras no tenant. |
| **7** | **Concluído com Sucesso!** | Mensagem de sucesso e botão "Concluir". | Inicia o serviço e o Tray Companion; fecha o instalador silenciosamente. |

---

## 5. Fase 3: O Tray Companion (Bandeja do Sistema)

Uma vez instalado, o serviço roda silenciosamente em segundo plano. Para dar visibilidade de que "tudo está funcionando" sem poluir a área de trabalho, um ícone discreto é fixado na bandeja do sistema (ao lado do relógio do Windows):

### 5.1. Estados do Ícone Visual
- 🟢 **Ponto Verde:** Conectado e operando normalmente.
- 🟡 **Ponto Amarelo:** Tentando reconectar (aguardando internet ou serviço reiniciando).
- 🔴 **Ponto Vermelho:** Erro que exige atenção (computador despareado ou sem internet por tempo prolongado).

### 5.2. Menu de Clique com o Botão Direito (Sem Jargão Técnico)
Ao clicar com o botão direito no ícone da bandeja, o operador visualiza opções compreensíveis:

```
+------------------------------------------+
|  ● Conectado (PDV-01-FRENTE)             |
|    Empresa: Supermercado Modelo Ltda     |
|    Impressoras: 2 ativas                 |
|------------------------------------------|
|  🌐 Abrir Painel do Witiquetas           |
|  🔍 Diagnóstico / Testar Impressão       |
|  🔄 Reconectar / Alterar Código          |
|------------------------------------------|
|  ℹ Sobre o Witiquetas Agent (v1.0.0)     |
|  ❌ Sair do Ícone da Barra               |
+------------------------------------------+
```

### 5.3. Política Rigorosa Anti-Jargão
É expressamente proibido exibir para o usuário:
- Tokens JWT, hashes hexadecimais de chave de máquina ou UUIDs internos;
- URLs de banco de dados ou endpoints brutos de API (`https://api.witiquetas.com/v1/...`);
- Códigos de erro HTTP (`502 Bad Gateway`, `401 Unauthorized`);
- Fragmentos de JSON bruto ou logs técnicos com stack traces.

### 5.4. Dicionário de Tradução de Erros para a Linguagem do Usuário:
- *Erro de Socket / Timeout na porta 9100:*  
  ❌ "Connection refused on socket 192.168.1.50:9100 (os error 10061)"  
  ✔ **"A impressora não respondeu. Verifique se o cabo de rede está conectado e se a impressora está ligada."**
- *Erro de Autenticação / Token Expirado:*  
  ❌ "HTTP 401 Unauthorized - Agent token revoked in tenant context"  
  ✔ **"Este computador foi desconectado pela empresa. Gere um novo código de conexão no painel para reativar."**
- *Sem Internet:*  
  ❌ "DNS resolution failure for host cloud.witiquetas.com"  
  ✔ **"Sem conexão com a internet. O Witiquetas tentará reconectar automaticamente assim que o sinal voltar."**
