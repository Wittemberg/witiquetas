# Roadmap de Implementação e Pacotes de Entrega (PLANNED)
**Planejamento Fásico da Distribuição do Agent & UX Zero-Terminal**  
*Status: DOCUMENTO CANÔNICO DE PLANEJAMENTO (FUTURE / PLANNED)*  
*Data de Conclusão: Outubro de 2026*

---

## 1. Governança e Regras de Ativação

> **ATENÇÃO — REGRAS GLOBAIS DO PROJETO:**  
> A fase atual do projeto é a **ADMINISTRATIVE_GOVERNANCE**.  
> Os módulos do **Editor de Etiquetas** e da **Central de Impressão** estão formalmente **CONGELADOS (FROZEN)**.  
> Este roadmap define a sequência exata de engenharia para quando a diretoria do Witiquetas autorizar formalmente a abertura da fase de distribuição (após a conclusão das rotinas administrativas vigentes).

---

## 2. Divisão em 5 Pacotes Incrementais de Engenharia

```
[ PACOTE 1 ] -> Core Service & CLI Hardening (Base do Agent em Rust)
      ↓
[ PACOTE 2 ] -> Instalador Gráfico Windows (Inno Setup 6 + Pareamento Visual)
      ↓
[ PACOTE 3 ] -> Tray Companion & IPC Local (Bandeja do Sistema + Semáforo)
      ↓
[ PACOTE 4 ] -> Pacotes Nativos Linux & macOS (Deb, Rpm, Notarização Apple)
      ↓
[ PACOTE 5 ] -> Pipeline de Assinatura & Mecanismo de Auto-Update
```

---

### Pacote 1: Endurecimento do Core Service & Contratos de Execução
*Objetivo:* Tornar o binário Rust `witiquetas-agent` um serviço de sistema operacional autônomo, 100% estático e à prova de falhas.

- [ ] **1.1. Abstração de Serviços Nativos:**  
  Integração completa da crate `windows-service` para o Windows SCM e manipulação de sinais POSIX (`SIGTERM`, `SIGHUP`) para Linux/macOS.
- [ ] **1.2. Comandos Canônicos de Ciclo de Vida:**  
  Homologação das flags de linha de comando:
  - `--install-service` (cria e ativa serviço com recuperação automática);
  - `--uninstall-service` (para e remove o serviço do sistema);
  - `--service-status` (retorna JSON estruturado ou código de saída sobre a saúde do daemon);
  - `--single-run` (executa um único ciclo de polling e diagnóstico para depuração de TI).
- [ ] **1.3. Eliminação Total de Dependências Dinâmicas:**  
  Migração definitiva da camada TLS para `rustls` estático com raízes WebPKI embutidas, eliminando vínculos dinâmicos com `OpenSSL` ou bibliotecas C de terceiros.
- [ ] **1.4. Testes de Validação:**  
  Testes automatizados de tolerância a quedas de rede, reconexão com backoff exponencial com jitter e isolamento multiempresa.

---

### Pacote 2: Instalador Gráfico Windows & Experiência de Pareamento
*Objetivo:* Eliminar qualquer necessidade de terminal no ambiente Microsoft Windows.

- [ ] **2.1. Script Canônico do Inno Setup 6:**  
  Desenvolvimento do script `installer/windows/setup.iss` compilando para `WitiquetasAgentSetup.exe`:
  - Elevação limpa de UAC (`PrivilegesRequired=admin`);
  - Supressão de qualquer console (`CREATE_NO_WINDOW`);
  - Estrutura de diretórios em `Program Files` e `ProgramData`.
- [ ] **2.2. Assistente Visual de 7 Etapas:**  
  Implementação das telas customizadas em Pascal Script: Boas-vindas -> Diagnóstico de conectividade -> Campo com máscara `WIT-____-____` -> Validação em nuvem -> Registro do serviço -> Descoberta de impressoras locais -> Conclusão.
- [ ] **2.3. Parâmetros de Automação para TI:**  
  Suporte a `/VERYSILENT`, `/SUPPRESSMSGBOXES` e `/PAIRCODE="WIT-XXXX-XXXX"`.
- [ ] **2.4. Pacote MSI para Empresas:**  
  Criação do projeto WiX Toolset v4 gerando `WitiquetasAgent.msi` para distribuição corporativa via GPO e Intune.

---

### Pacote 3: Desktop Tray Companion & Comunicação Local (IPC)
*Objetivo:* Fornecer ao operador da loja um indicador visual amigável do status da impressora sem abrir janelas de console.

- [ ] **3.1. Aplicação Leve de Bandeja (`witiquetas-tray`):**  
  Construção de utilitário nativo em Rust (< 12 MB RAM) utilizando as crates `tray-icon` e `windows-rs`:
  - Ícone dinâmico com cores de status (Verde = Conectado, Amarelo = Reconectando, Vermelho = Erro);
  - Inicialização automática via registro `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- [ ] **3.2. Barramento de IPC Local Seguro:**  
  Comunicação entre o Windows Service (rodando como `SYSTEM`) e o Tray Companion (rodando na sessão do usuário logado) através de **Named Pipes** autenticados (`\\.\pipe\witiquetas-agent` no Windows) e **UNIX Domain Sockets** (`/run/witiquetas-agent.sock` no Linux/macOS).
- [ ] **3.3. Telas Amigáveis de Operação:**  
  Diálogo de teste de impressão (emissão de etiqueta de teste em 1 clique) e modal simplificado para troca de código de pareamento.

---

### Pacote 4: Distribuição Linux e Ecossistema Apple
*Objetivo:* Expandir a distribuição com paridade funcional para terminais Linux e computadores Mac.

- [ ] **4.1. Pacotes Nativos Linux:**  
  Geração automatizada de pacotes `.deb` (Debian/Ubuntu/Raspberry Pi OS) e `.rpm` (Fedora/RHEL/openSUSE), incluindo unit `systemd` e regras de `udev` para impressoras térmicas USB.
- [ ] **4.2. Instalador Web Headless (`agent.sh`):**  
  Script determinístico para servidores sem interface gráfica (`curl -sSL https://get.witiquetas.com/agent.sh | sudo sh -s -- --code WIT-XXXX`).
- [ ] **4.3. macOS Universal Binary & Notarização:**  
  Compilação universal (Intel + Apple Silicon), criação do arquivo `LaunchDaemon` (`/Library/LaunchDaemons/com.witiquetas.agent.plist`), empacotamento `.pkg`, assinatura com Developer ID e notarização com `xcrun notarytool`.

---

### Pacote 5: Pipeline de Assinatura, Segurança e Auto-Update
*Objetivo:* Automatizar o ciclo de vida e garantir releases seguras e imutáveis.

- [ ] **5.1. Integração com Azure Trusted Signing:**  
  Automação de assinatura digital Authenticode e timestamping RFC 3161 no GitHub Actions via OIDC.
- [ ] **5.2. Manifesto Criptográfico e Proveniência SLSA:**  
  Geração do manifesto `manifest.json` com hashes SHA-256 e atestação de proveniência de build.
- [ ] **5.3. Mecanismo de Atualização Atômica com Print Lock:**  
  Implementação da substituição segura em segundo plano (`.pending` -> `.exe` -> `.bak`) com garantia de jamais interromper transmissão física para a porta 9100.
- [ ] **5.4. Rollback Automático de 30 Segundos:**  
  Detecção de falhas pós-atualização com reversão imediata para a versão funcional anterior.

---

## 3. Matriz de Rastreabilidade e Critérios de Conclusão (DoD)

| Pacote | Requisito Principal | Critério de Aceite (DoD) | Dependência |
| :--- | :--- | :--- | :--- |
| **P1** | Core Service Rust | Executa como serviço nativo sem console; zero `.so` ou `.dll` externas. | Homologação Rust Core |
| **P2** | Windows Installer | Usuário leigo instala e conecta em < 3 minutos via assistente visual. | Pacote 1 |
| **P3** | Tray Companion | Ícone na barra reflete status real; sem jargão técnico ou janelas pretas. | Pacote 1 + Pacote 2 |
| **P4** | Linux / Mac Setup | Instalação em 2 cliques ou comando único; impressoras USB detectadas. | Pacote 1 |
| **P5** | Auto-Update & Signing | SmartScreen azul superado; update nunca corrompe etiqueta física. | Pacotes 1 a 4 |
