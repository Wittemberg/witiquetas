# Matriz Canônica de Compatibilidade Windows: Witiquetas Agent
**Pesquisa Técnica de Arquitetura e Engenharia de Sistemas (Agent A)**  
*Status: DOCUMENTO CANÔNICO DE PESQUISA*  
*Data de Conclusão: Outubro de 2026*

---

## 1. Critérios Técnicos de Avaliação

Para determinar a viabilidade real de suporte de cada sistema operacional Microsoft Windows, cada família foi submetida a 12 vetores técnicos inegociáveis:

1. **Toolchain Rust & Compilação:** Suporte oficial do compilador Rust (`rustc` / LLVM) e targets suportados (`x86_64-pc-windows-msvc`, `i686-pc-windows-msvc`, `aarch64-pc-windows-msvc` ou `*-pc-windows-gnu`).
2. **Segurança TLS (1.2 e 1.3):** Capacidade de estabelecer sessões criptografadas com o backend em nuvem utilizando cifras modernas (ECDHE, AES-GCM, ChaCha20-Poly1305).
3. **Criptografia e Validação de Certificados:** Suporte a certificados raiz modernos (como Let's Encrypt ISRG Root X1), suporte a assinaturas digitais SHA-256 e validação de revogação (OCSP / CRL).
4. **Stack de Rede (WinHTTP / Schannel / Winsock):** Disponibilidade das APIs de transporte HTTP/WebSocket e sockets puros.
5. **Service Control Manager (SCM):** Suporte nativo da API Win32 (`advapi32.dll`) para criação, monitoramento e inicialização autônoma de Windows Services (`SERVICE_AUTO_START`).
6. **Suporte a Unicode:** Capacidade de manipular caminhos de arquivo, nomes de impressoras e payloads em UTF-8 / UTF-16 nativo (APIs `W`).
7. **Arquiteturas de CPU:** Suporte a binários x86 (32-bit), x64 (64-bit) e ARM64.
8. **Compatibilidade do Instalador:** Execução de instaladores gráficos modernos sem exigir runtimes adicionais.
9. **Assinatura Authenticode:** Capacidade do SO de validar binários assinados com certificados SHA-256 (RFC 3161).
10. **Comunicação RAW TCP (Porta 9100):** Abertura de sockets TCP sem bloqueios de firewall legados para transmissão de ZPL/PPLB.
11. **Vulnerabilidade e Superfície de Ataque:** Exposição do ambiente local a exploração remota devido à falta de patches de segurança.
12. **Classificação Oficial:**
    - `SUPPORTED`: Sistema plenamente suportado com garantias de CI/CD contínuo.
    - `LEGACY_SUPPORTED`: Funcional com pré-requisitos de sistema conhecidos e validados pelo instalador.
    - `BEST_EFFORT`: Compilação possível, porém sem suporte da Microsoft e com testes restritos.
    - `TECHNICALLY_UNSAFE`: Inseguro para uso corporativo, com quebra criptográfica grave.
    - `NOT_SUPPORTED`: Tecnicamente inviável ou impossível de compilar/executar.

---

## 2. Matriz Comparativa Completa por Família de SO

| Família do SO | Versão NT / Kernel | Rust Toolchain | TLS 1.2 / 1.3 | Win32 SCM (Serviço) | Unicode Nativo | Authenticode SHA-256 | RAW TCP 9100 | Classificação Oficial |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Windows 95** | 4.00 (VMM32) | Não | Não (Apenas SSL 2/3) | Não (RunServices) | Não (ANSI apenas) | Não | Sim (Winsock 2) | **NOT_SUPPORTED** |
| **Windows 98 / 98 SE** | 4.10 (VMM32) | Não | Não (Apenas SSL 2/3) | Não (RunServices) | Não (ANSI apenas) | Não | Sim (Winsock 2) | **NOT_SUPPORTED** |
| **Windows ME** | 4.90 (VMM32) | Não | Não (Apenas SSL 2/3) | Não (RunServices) | Não (ANSI apenas) | Não | Sim (Winsock 2) | **NOT_SUPPORTED** |
| **Windows 2000** | NT 5.0 | Não (Deprecado) | Não (TLS 1.0 máx) | Sim | Sim (UTF-16) | Não | Sim | **NOT_SUPPORTED** |
| **Windows XP / 2003** | NT 5.1 / NT 5.2 | Não (Rust 1.75+ drop) | Não nativo (Inseguro) | Sim | Sim (UTF-16) | Não (Parcial SP3) | Sim | **TECHNICALLY_UNSAFE** |
| **Windows Vista / 2008** | NT 6.0 | Não (Deprecado) | Parcial (KB4019276) | Sim | Sim (UTF-16) | Parcial | Sim | **NOT_SUPPORTED** |
| **Windows 7 SP1 / 2008 R2** | NT 6.1 | Tier 3 (c/ crt flags) | Sim (KB3140245) | Sim | Sim (UTF-16) | Sim (KB4474419) | Sim | **LEGACY_SUPPORTED** |
| **Windows 8.1 / 2012 R2** | NT 6.3 | Tier 3 | Sim (TLS 1.2 nativo) | Sim | Sim (UTF-16) | Sim | Sim | **LEGACY_SUPPORTED** |
| **Windows 10 (Todas as edições)** | NT 10.0 | Tier 1 Oficial | Sim (TLS 1.2 e 1.3) | Sim | Sim (UTF-16) | Sim | Sim | **SUPPORTED** |
| **Windows 11** | NT 10.0 (22000+) | Tier 1 Oficial | Sim (TLS 1.3 nativo) | Sim | Sim (UTF-16) | Sim | Sim | **SUPPORTED** |
| **Windows Server 2016-2025** | NT 10.0 | Tier 1 Oficial | Sim (TLS 1.2 e 1.3) | Sim | Sim (UTF-16) | Sim | Sim | **SUPPORTED** |

---

## 3. Análise Técnica Pormenorizada

### 3.1. Windows 95, 98 e Millennium Edition (Win9x)
- **Kernel & Arquitetura:** Baseados em arquitetura híbrida de 16/32 bits sobre MS-DOS e driver virtual VMM32. Não existe Service Control Manager; tarefas em segundo plano dependiam de chaves de registro inseguras (`HKLM\Software\Microsoft\Windows\CurrentVersion\RunServices`).
- **Unicode:** Primitivas do sistema são puramente ANSI (`CP1252`). As funções `W` da Win32 API são stubs vazios a menos que o pacote obsoleto *Microsoft Layer for Unicode (MSLU)* estivesse instalado.
- **TLS & Criptografia:** A biblioteca criptográfica de sistema do Win9x (CryptoAPI 1.0) suporta apenas cifras obsoletas (DES, 3DES, RC4) e protocolos inseguros (SSL 2.0 / SSL 3.0). Conexão com qualquer CDN ou infraestrutura moderna em nuvem (Cloudflare, AWS, GCP, Cloudflare Workers) é imediatamente abortada por ausência de ALPN, SNI e ciphers modernos.
- **Toolchain:** LLVM e Rust não possuem targets para Win9x. O compilador C mais recente capaz de gerar código para Win9x foi o Visual C++ 6.0 (1998) ou MinGW antigo.
- **Conclusão:** **Totalmente inviável e inseguro.**

### 3.2. Windows 2000 (NT 5.0)
- **Kernel:** Introduziu o SCM moderno completo e suporte integral a chamadas Unicode `W`.
- **Limitações:** O subsistema Schannel não possui suporte a TLS 1.2. Além disso, as chamadas modernas da C Runtime do Windows (`GetTickCount64`, `EncodePointer`, `DecodePointer`, sincronizações SRWLock) não existem no `KERNEL32.DLL` do Windows 2000.
- **Toolchain:** O Rust descartou completamente suporte ao Windows 2000 em suas primeiras versões 1.x.
- **Conclusão:** **Inviável.**

### 3.3. Windows XP (SP3) e Windows Server 2003
- **Presença em Varejo:** Ainda encontrado em computadores industriais legados e sistemas de automação de balança de supermercado desconectados.
- **Rust Toolchain:** O suporte a Windows XP (`i686-pc-windows-msvc` com subsistema 5.01) foi oficialmente descontinuado no ecossistema Rust (removido do Rust 1.75+).
- **Criptografia & TLS:** No Windows XP SP3 vanilla, o Schannel suporta no máximo TLS 1.0 (quebrada por BEAST, POODLE). Embora a atualização KB4019276 tenha adicionado TLS 1.2 ao *Windows POSReady 2009*, ela não suporta as cifras Elliptic Curve (ECDHE) exigidas por servidores modernos, além de não validar certificados intermediários com SHA-256 e raízes modernas sem modificações manuais invasivas no Certificate Store.
- **Classificação:** **TECHNICALLY_UNSAFE.** Tentar forçar um binário Rust moderno no Windows XP violaria os padrões PCI-DSS, LGPD e as políticas de segurança da infraestrutura de nuvem do Witiquetas.

### 3.4. Windows Vista e Windows Server 2008 (NT 6.0)
- Embora tenha introduzido a *Cryptography Next Generation (CNG)*, o suporte a TLS 1.2 foi disponibilizado apenas tardiamente e de forma restrita (Server 2008 SP2). Rust removeu suporte a essa versão. Quase nenhuma base de hardware comercial ainda utiliza Vista.
- **Classificação:** **NOT_SUPPORTED.**

### 3.5. Windows 7 SP1 e Windows Server 2008 R2 (NT 6.1)
- **Status de Mercado:** Presente em cerca de 3% a 5% dos pontos de venda de varejo legados no Brasil.
- **Requisitos Críticos:**
  1. **Atualização SHA-2 (KB4474419):** Obrigatória. Sem ela, o Windows 7 não reconhece instaladores e executáveis assinados com certificados modernos SHA-256 (retornando erro de código corrompido ou assinatura inválida).
  2. **Atualização de TLS 1.2 (KB3140245):** Necessária caso o software utilize a stack nativa WinHTTP/Schannel. **Porém**, se o Witiquetas Agent utilizar **`rustls`** com raízes WebPKI embutidas estaticamente no binário, a dependência do Schannel do sistema operacional é **eliminada**, permitindo TLS 1.2 e 1.3 puros e seguros mesmo no Windows 7!
- **Rust Toolchain:** Windows 7 é classificado como Tier 3 no Rust 1.78+. Binários compilados para `x86_64-pc-windows-msvc` ou `i686-pc-windows-msvc` com flags de retrocompatibilidade do MSVC (`/SUBSYSTEM:WINDOWS,6.01`) executam com estabilidade comprovada.
- **Classificação:** **LEGACY_SUPPORTED.** O instalador gráfico deve checar ativamente se o Windows 7 possui o SP1 e a atualização SHA-2 instalados, alertando o operador de forma clara caso contrário.

### 3.6. Windows 8.1 e Windows Server 2012 / 2012 R2 (NT 6.3)
- Possui TLS 1.2 habilitado por padrão no Schannel, suporte integral a certificados SHA-256 e APIs completas de serviço e rede.
- **Classificação:** **LEGACY_SUPPORTED.** Opera perfeitamente com os binários gerados.

### 3.7. Windows 10 e Windows 11 (NT 10.0) — O Padrão Oficial
- **Edições Suportadas:** Windows 10 Home, Pro, Enterprise, Education, IoT Enterprise, LTSC (2015, 2016, 2019, 2021) e Windows 11 (todas as builds a partir da 21H2 até 24H2+).
- **Servidores:** Windows Server 2016, 2019, 2022 e 2025.
- **Recursos Nativos:**
  - Suporte Tier 1 absoluto no compilador Rust oficial;
  - Stack criptográfica completa (TLS 1.2 e TLS 1.3 nativos no Windows 11 e Server 2022);
  - Integração perfeita com Windows Service Control Manager (`StartServiceCtrlDispatcherW`, recuperação automática de falhas, atraso de inicialização);
  - APIs de notificação e System Tray de alta resolução (DPI-aware);
  - Suporte nativo a binários assinados digitalmente com SmartScreen.
- **Classificação:** **SUPPORTED (Tier 1).**

---

## 4. Arquiteturas de Processador (CPU Targets)

| Arquitetura | Target do Rust | Prioridade | Cenário de Uso |
| :--- | :--- | :--- | :--- |
| **x64 (x86_64)** | `x86_64-pc-windows-msvc` | **Tier 1 (Principal)** | Padrão absoluto para 95%+ dos computadores desktop, notebooks e servidores de retaguarda. |
| **x86 (32-bit)** | `i686-pc-windows-msvc` | **Tier 2 (Legado)** | PDVs antigos baseados em Intel Atom / Celeron com Windows 7 32-bit ou Windows 10 32-bit. |
| **ARM64** | `aarch64-pc-windows-msvc` | **Tier 2 (Emergente)** | Novos PDVs compactos, tablets industriais e laptops Snapdragon X Elite rodando Windows 11 ARM. |

---

## 5. Menor Windows Oficialmente Suportável

Com base na integridade criptográfica, segurança da cadeia de suprimentos e estabilidade do transporte RAW 9100:

> **DECISÃO CANÔNICA DE ENGENHARIA:**  
> O **menor Windows oficialmente suportado sem ressalvas é o Windows 10 (Build 1809+ / LTSC 2019+) e Windows Server 2016.**  
>  
> Para garantir que clientes do varejo com hardware em transição não fiquem desamparados, o **Windows 7 SP1 e Windows 8.1 são classificados como LEGACY_SUPPORTED**, desde que os patches KB4474419 (SHA-2) e KB3140245 (TLS 1.2) estejam presentes, utilizando `rustls` estático para blindar a comunicação em nuvem.  
>  
> Nenhuma versão anterior ao Windows 7 (XP, 2000, 98, 95) será suportada com binários nativos do Agent moderno.
