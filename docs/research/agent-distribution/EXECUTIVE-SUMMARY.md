# Sumário Executivo: Distribuição do Agent & UX Zero-Terminal
**Witiquetas Platform Architecture & Distribution Research**  
*Status: RESEARCH & ARCHITECTURE (FUTURE / PLANNED)*  
*Data de Conclusão: Outubro de 2026*

---

## 1. Visão Geral e Desafio de Produto

O **Witiquetas Agent** é o elo físico crítico entre a plataforma em nuvem e as impressoras térmicas locais (Zebra, Elgin, Argox, Bematech, Datamax). Ele é responsável pelo transporte de payloads compilados (ZPL, PPLB, etc.) via RAW TCP (porta 9100) e conexões USB/Serial locais.

### O Problema Atual
Historicamente, utilitários de impressão técnica exigem intervenção de profissionais de TI:
- Execução de comandos no PowerShell ou CMD;
- Instalação e manipulação manual de serviços via `sc.exe`;
- Edição de arquivos `.json` ou variáveis de ambiente;
- Dependência de runtimes pesados (.NET Framework/.NET 8, Java JRE, Node.js, Python ou Visual C++ Redistributable).

### O Paradoxo do Operador Final
Em supermercados, atacados, indústrias e lojas de varejo, o usuário responsável por conectar uma impressora é um operador leigo ou gerente de loja. **Exigir terminal é garantia de falha no onboarding, chamados de suporte caros e abandono de produto.**

### A Meta "Zero-Terminal"
Projetar uma distribuição profissional, autônoma e à prova de falhas:
1. **Zero Console:** Nenhuma janela preta de console visível durante ou após a instalação.
2. **Zero Dependência Externa:** Binário 100% nativo em Rust (`rustls` embutido), sem necessidade de instalar .NET, Java ou VC++ Redistributable.
3. **Fluxo Gráfico de 3 Minutos:** Baixar instalador único -> Inserir código `WIT-XXXX-XXXX` -> Parear automaticamente -> Serviço Windows ativo -> Pronto para imprimir.
4. **Infraestrutura Invisível:** O Agent opera como Windows Service / Linux Daemon silencioso, com um ícone discreto na bandeja do sistema (Tray Companion) para conferência de status.

---

## 2. Síntese das Pesquisas Multi-Agent

A pesquisa técnica foi conduzida de forma paralela e exaustiva por eixos temáticos:

| Eixo / Agente | Escopo Técnico | Decisão & Recomendação Canônica |
| :--- | :--- | :--- |
| **Agent A: Windows Matrix** | Compatibilidade de Windows 95 a Windows 11 e Windows Server. | **Menor Windows Suportado:** Windows 10 (1809+) e Server 2016+. **Legado Suportado:** Windows 7 SP1 / 8.1 (com KB4474419 e KB3140245). Win 95/98/ME/2000/XP são **NOT_SUPPORTED / TECHNICALLY_UNSAFE**. |
| **Agent B: Windows Setup** | Inno Setup vs WiX v4/v5 vs MSIX vs NSIS vs Tauri. | **Inno Setup 6** para o instalador EXE oficial de varejo (wizard com máscara de pareamento, zero console, self-contained). **WiX Toolset v4** para pacote MSI silencioso corporativo (GPO/Intune). |
| **Agent C: Linux Matrix** | Debian, Ubuntu, Fedora, RHEL, Alpine, Raspberry Pi OS (x86_64, aarch64, armv7). | **Binário Estático Musl** (`x86_64-unknown-linux-musl`, `aarch64-unknown-linux-musl`) elimina conflitos de `glibc`. Pacotes nativos `.deb` e `.rpm` com unit `systemd`. |
| **Agent D: Apple Ecosystem** | macOS, iOS, iPadOS e restrições de sandbox/background. | **macOS:** Universal Binary 2 (x86_64 + arm64) fora da App Store, assinado com Developer ID e Notarizado pela Apple, via `LaunchDaemon` (.pkg). **iOS/iPadOS:** PWA Web nativo em Safari que despacha jobs ao backend; **nenhum app iOS é necessário**, respeitando 100% das diretrizes da Apple. |
| **Agent E: Security & Signing** | Authenticode, SmartScreen, Developer ID, GPG, CI/CD. | **Windows:** Assinatura Authenticode via Azure Trusted Signing (Cloud HSM) com timestamp RFC 3161. **macOS:** Notarização Apple. **CI:** GitHub Actions com atestação SLSA Nível 3 e manifests SHA-256 imutáveis. |
| **Agent F: Update & Recovery** | Atualização silenciosa, sem console, atômica e resiliente. | Atualização em segundo plano via swap atômico (`.pending` -> `.exe` -> `.bak`). **Trava de Impressão:** Bloqueio estrito para nunca atualizar enquanto houver job RAW em transmissão. Rollback automático em 30 segundos se health check falhar. |
| **Agent G: Product UX** | Fluxo Web, Wizard Desktop e Tray Companion. | Experiência visual guiada com código `WIT-XXXX-XXXX`, auto-detecção de impressoras na rede local (9100) e Tray sem jargão técnico (sem JSON, tokens ou URLs expostas). |
| **Legacy Windows** | Viabilidade técnica em Win 95/98/ME/XP e risco criptográfico. | Impossibilidade de rodar Agent nativo moderno devido à ausência de TLS 1.2/1.3 e Rust toolchain. Proposta de **Legacy Print Bridge** arquitetural via rede local sem comprometer o core moderno. |

---

## 3. Os 15 Decision Gates — Respostas Canônicas

1. **Menor Windows oficialmente suportável:**  
   **Windows 10 (Build 1809+ / LTSC 2019+)** e **Windows Server 2016+** como linha oficial padrão. Windows 7 SP1 e Windows 8.1 como *Legacy Supported* (exigindo atualizações KB4474419 e KB3140245 para TLS 1.2 e SHA-2). Abaixo disso é tecnicamente inseguro.
2. **x86 (32-bit) será suportado?**  
   **SIM (Best Effort / Legacy).** Muitos terminais de ponto de venda (PDVs) antigos operam com Windows 7/10 32-bit ou Linux x86. Geraremos o binário `i686-pc-windows-msvc` e `i686-unknown-linux-musl`.
3. **x64 será suportado?**  
   **SIM (Tier 1 Padrão).** Alvo prioritário principal para Windows e Linux.
4. **ARM64 Windows será suportado?**  
   **SIM (Futuro / Tier 2).** Compilação cruzada direta via `aarch64-pc-windows-msvc`. Crescente em novos dispositivos móveis industriais e mini-PCs Snapdragon.
5. **Quais Linux oficialmente suportados?**  
   Debian 11/12, Ubuntu 20.04/22.04/24.04, Linux Mint 20/21, Fedora 38+, RHEL/Rocky/AlmaLinux 8/9, Alpine Linux 3.18+, Raspberry Pi OS (Debian 11/12 32-bit e 64-bit).
6. **Estratégia glibc / musl:**  
   **Musl estático integral.** Binários compilados contra Musl com `rustls` embutido eliminam dependências de versão de glibc e pacotes externos de OpenSSL, rodando em qualquer distribuição Linux sem `ldd errors`.
7. **macOS fora da Mac App Store é viável?**  
   **SIM, 100% viável e recomendado.** Distribuição via `.pkg` assinado com Apple Developer ID Installer e binário assinado com Developer ID Application, submetido ao Apple Notary Service (`xcrun notarytool`) e grampeado (`stapled`).
8. **iOS / iPadOS sem App Store: qual experiência é viável?**  
   **Witiquetas PWA (Progressive Web App).** iOS bloqueia daemons em segundo plano e encerra conexões TCP após 30 segundos. O operador usa o iPad no navegador/PWA para criar ou selecionar impressões; o backend despacha o payload compilado ao Agent local (PC ou Raspberry Pi da loja), que entrega à impressora.
9. **Installer Windows recomendado:**  
   **Inno Setup 6.** Gera um executável único de alta performance, sem dependências, com assistente customizado em Pascal Script, controle nativo do Service Control Manager, supressão de consoles e argumentos para TI (`/VERYSILENT /CODE=...`).
10. **Tray technology recomendada:**  
    **Rust Native Tray Companion** (utilizando a crate `tray-icon` + `windows-rs` / Win32 puro), comunicando-se com o serviço em background através de IPC local via Named Pipes (`\\.\pipe\witiquetas-agent`). Consumo de memória: < 12 MB de RAM.
11. **Dependências externas necessárias:**  
    **ZERO.** O binário Core em Rust é 100% estático. Não requer .NET, Java, Python ou pacotes VC++ Redistributable externos.
12. **Estratégia de assinatura:**  
    Certificado **OV/EV via Azure Trusted Signing** (ou HSM em nuvem) com timestamping RFC 3161 para Windows Authenticode; Apple Developer ID para macOS; chaves GPG para repositórios e artefatos Linux.
13. **Estratégia de auto-update:**  
    Atualização silenciosa e atômica gerenciada pelo próprio serviço em background: download do binário assinado -> validação de hash e assinatura -> bloqueio do semáforo de impressão -> parada breve do serviço -> substituição atômica -> subida e health check -> rollback em 30s se houver falha.
14. **Estratégia para Windows 95 / 98 / ME / XP:**  
    Classificados como **NOT_SUPPORTED** e **TECHNICALLY_UNSAFE** para execução do Agent moderno. Não haverá compilação do Agent Rust para esses sistemas. Para ambientes industriais que não podem ser atualizados, a solução arquitetural recomendada é o **Legacy Print Bridge** (o PDV legado imprime na rede ou o Agent roda em outro computador da mesma rede e comanda a impressora térmica via RAW TCP).
15. **Pacotes de implementação sugeridos:**  
    Estruturados em 4 pacotes incrementais (Pacote 1: Core Service & CLI Hardening; Pacote 2: Inno Setup & Pareamento Gráfico; Pacote 3: Tray Companion & IPC; Pacote 4: Linux Packaging & macOS Notarization).

---

## 4. Próximos Passos e Governança

Conforme as regras do repositório (**RULE[user_global]**) e a trava de congelamento da fase administrativa:
- Nenhum código de produção foi alterado neste ciclo.
- A matriz e os documentos detalhados a seguir servem como baseline canônico e base para as futuras **ADRs** (Architecture Decision Records) quando a fase de distribuição for oficialmente aberta.
