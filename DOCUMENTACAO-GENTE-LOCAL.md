# Witiquetas — DOCUMENTACAO-GENTE-LOCAL

> Nome funcional do componente: **Witiquetas Agent / Agente Local**.  
> O nome deste arquivo foi mantido conforme definição inicial do projeto.

## 1. Objetivo

O Agente Local é o terceiro pilar do Witiquetas.

Ele será instalado no ambiente do cliente e fará a ponte segura entre a plataforma Web e as impressoras térmicas locais, principalmente em cenários nos quais a impressora recebe comandos diretamente por TCP/IP, USB, serial ou spooler.

O navegador não deve assumir essa responsabilidade.

---

## 2. Stack

| Tecnologia | Uso |
|---|---|
| Tauri 2 | Aplicação desktop leve |
| Rust | Sistema, rede, serial, arquivos e segurança |
| TypeScript | Interface local, quando necessária |
| SQLite | Configuração/cache local mínimo |
| Tauri Updater | Atualização da aplicação |
| Reqwest | HTTPS com API Witiquetas |
| Tokio | tarefas assíncronas |

O agente deve ser leve, resiliente e apto a permanecer em segundo plano.

---

## 3. Responsabilidades

- registrar a instalação;
- autenticar-se com credencial própria;
- enviar heartbeat;
- detectar/gerenciar impressoras cadastradas;
- consumir jobs;
- enviar RAW TCP;
- suportar serial;
- suportar mecanismos USB quando implementados;
- opcionalmente usar spooler do sistema;
- registrar resultado;
- armazenar fila temporária em caso de instabilidade;
- atualizar-se;
- reportar versão e diagnóstico.

---

## 4. Não responsabilidades

O agente não deve:

- conter regras empresariais;
- consultar diretamente banco do ERP;
- conhecer senha de usuário;
- armazenar JWT do navegador;
- gerar modelos visuais;
- alterar templates;
- executar scripts arbitrários recebidos do servidor;
- aplicar patch de IA automaticamente.

---

## 5. Registro

Fluxo:

```text
Instalação
→ informar código de pareamento
→ API valida
→ vincula customer/company
→ emite credencial exclusiva
→ agente salva segredo no cofre do SO
→ inicia heartbeat
```

O pareamento deve ser de uso único e expirar.

---

## 6. Identificação

Campos enviados:

```text
installationId
machineName
os
architecture
agentVersion
companyId
startedAt
capabilities
```

Não utilizar MAC address como identidade principal.

---

## 7. Heartbeat

Intervalo recomendado inicial:

```text
30 a 60 segundos
```

Payload:

```json
{
  "installationId": "uuid",
  "version": "0.1.0",
  "status": "ONLINE",
  "printers": 2,
  "queue": 0
}
```

A API define agente offline após janela configurável sem heartbeat.

---

## 8. Jobs

Fluxo:

```text
PENDING
→ DISPATCHED
→ PRINTING
→ SUCCESS
```

ou:

```text
PRINTING
→ FAILED
```

O agente deve implementar idempotência.

Um mesmo `jobId` não pode ser impresso novamente após confirmação, salvo reimpressão explícita gerando novo job ou attempt.

---

## 9. Comunicação com impressora

### 9.1 RAW TCP

Prioridade inicial.

Configuração:

```text
host
port
timeout
language
encoding
```

Porta comum em impressoras de rede pode ser 9100, mas o Witiquetas não deve assumir isso como regra fixa.

Envio:

```text
connect
→ write bytes
→ flush
→ close
```

### 9.2 Serial

Configurar:

```text
COM
baud rate
data bits
parity
stop bits
flow control
```

### 9.3 USB

Implementar apenas quando houver estratégia confiável por fabricante/OS.

### 9.4 Spooler

Opcional para ambientes onde seja desejável usar fila instalada do sistema operacional.

---

## 10. Linguagens

O Agente Local não compila layout.

Ele recebe conteúdo compilado:

```json
{
  "jobId": "uuid",
  "printerId": "uuid",
  "language": "PPLB",
  "encoding": "windows-1252",
  "copies": 1,
  "payload": "..."
}
```

Assim o agente permanece simples e independente do editor.

---

## 11. Configuração local

SQLite recomendado apenas para:

```text
installation
paired_company
printers
local_queue
settings
diagnostics
```

Não armazenar cadastro de produtos ou dados completos do SaaS.

Estrutura no Windows:

```text
%PROGRAMDATA%\Witiquetas\
├── config\
├── data\
├── logs\
├── spool\
└── diagnostics\
```

Dados por usuário, se necessários:

```text
%LOCALAPPDATA%\Witiquetas\
```

Segredos devem preferir Windows Credential Manager/DPAPI, não arquivo `.env` em texto puro.

---

## 12. Logs

Local:

```text
%PROGRAMDATA%\Witiquetas\logs\
```

Formato estruturado.

Rotação:

- limite por tamanho;
- limite de dias;
- compressão opcional.

Nunca logar:

- senha;
- token completo;
- secret S3;
- conteúdo sensível desnecessário.

---

## 13. Diagnóstico

Tela/endpoint local:

```text
Versão
Status API
Filial vinculada
Último heartbeat
Fila local
Impressoras
Último erro
Verificar atualização
Exportar diagnóstico
```

O pacote de diagnóstico pode incluir logs sanitizados e configuração sem segredos.

---

## 14. Atualização

O agente deve suportar:

```text
VERIFICAR ATUALIZAÇÕES
ATUALIZAR AGORA
```

Canal inicial:

```text
stable
```

Futuro:

```text
beta
stable
```

Fluxo:

```text
Git tag
→ GitHub Actions
→ build Windows
→ assinatura
→ GitHub Release / endpoint updater
→ agente verifica
→ download
→ valida assinatura
→ instala
→ reinicia
```

Nunca aceitar atualização sem validação criptográfica.

---

## 15. GitHub Actions do agente

Diferente de frontend/backend, o agente não será implantado via webhook Portainer.

Workflow:

```text
tag v*
→ checkout
→ build Tauri
→ testes
→ assinar
→ publicar artefatos
→ criar/atualizar release
```

O `main` pode gerar builds de desenvolvimento, mas releases de produção devem ser vinculadas a tags versionadas.

---

## 16. Versionamento

SemVer:

```text
MAJOR.MINOR.PATCH
```

Exemplos:

```text
0.1.0
0.2.0
1.0.0
1.0.1
```

A API poderá definir versão mínima suportada.

Estados:

```text
CURRENT
UPDATE_AVAILABLE
UPDATE_REQUIRED
UNSUPPORTED
```

---

## 17. Segurança

- TLS obrigatório;
- token por instalação;
- token revogável;
- segredo no cofre do SO;
- nenhuma porta HTTP pública;
- nenhuma execução de shell remoto;
- permitir somente operações previstas;
- assinatura de atualização;
- validação de tamanho de payload;
- timeout de impressão;
- allowlist opcional de hosts de impressora.

---

## 18. Operação offline

O agente pode manter pequena fila local somente para jobs já autorizados.

Regra inicial recomendada:

- não criar novos jobs offline;
- persistir job recebido antes de imprimir;
- confirmar após retorno da conexão;
- impedir reimpressão acidental após reinício.

---

## 19. Manutenção assistida por IA

O agente pode enviar diagnóstico sanitizado à plataforma após autorização administrativa.

A IA poderá sugerir correção no código, mas o agente instalado nunca deverá:

- baixar script arbitrário;
- executar PowerShell/cmd recebido da IA;
- substituir binários fora do updater;
- alterar configurações de segurança sem ação explícita.

---

## 20. Primeira entrega do agente

1. instalação Windows;
2. pareamento;
3. heartbeat;
4. cadastro manual de impressora TCP;
5. teste de conexão;
6. receber payload PPLB/PPLA;
7. enviar RAW;
8. confirmar resultado;
9. logs;
10. atualização.

---

## 21. Nome do executável e serviço

Sugestão:

```text
Witiquetas Agent
witiquetas-agent.exe
```

Se executado como serviço:

```text
WitiquetasAgent
```

A interface pode rodar em tray, enquanto o serviço mantém jobs em segundo plano.

---

Documento inicial: 13/08/2026.
