# Avaliação de Sistemas Legados e Arquitetura "Legacy Print Bridge"
**Pesquisa Técnica sobre Windows 95, 98, ME, 2000 e XP**  
*Status: DOCUMENTO CANÔNICO DE PESQUISA (NÃO IMPLEMENTAR)*  
*Data de Conclusão: Outubro de 2026*

---

## 1. Motivação da Pesquisa

O varejo brasileiro e indústrias tradicionais ainda preservam ilhas de automação comercial e chão de fábrica operando com versões históricas do Windows (especialmente Windows 98 SE e Windows XP SP3 em terminais de balança, microterminais ou PDVs com placas-mãe industriais antigas).

Atendendo ao direcionamento de produto, esta pesquisa não rejeita essas versões a priori, mas investiga a fundo:
1. **Os limites técnicos reais de compilação e criptografia;**
2. **Por que um Agent nativo moderno não pode rodar diretamente nesses sistemas;**
3. **Qual a única alternativa arquitetural viável (Legacy Print Bridge) sem degradar a segurança da plataforma.**

---

## 2. Por Que o Agent Nativo Moderno é Inviável em Win 95/98/ME/XP

### 2.1. O Abismo da Toolchain Rust e Compiladores
- **Compilação para Win9x (95/98/ME):** O compilador Rust depende do backend LLVM. O LLVM e o ecossistema C/C++ padrão removeram o suporte à geração de código para a arquitetura híbrida de 16/32 bits do Win9x há mais de duas décadas. A biblioteca padrão de Rust (`std::sys::windows`) assume primitivas do Windows NT (como `CreateFileW`, semáforos de sincronização do NT e manipuladores de exceção estruturada SEH modernos) que não existem no `KERNEL32.DLL` do Windows 95/98.
- **Compilação para Windows XP:** O target `i686-pc-windows-msvc` voltado para Windows XP exigia flags de subsistema 5.01 e bibliotecas C CRT legadas. O time oficial do Rust removeu formalmente todo o suporte a Windows XP a partir da versão 1.75. Tentar compilar o Agent atual em toolchains obsoletas congeladas (Rust 1.74 ou anterior) impediria o uso de crates vitais modernas como `tokio 1.x`, `rustls 0.23+` e `reqwest`.

### 2.2. A Barreira Criptográfica do TLS 1.2 / 1.3
- **Incompatibilidade com CDNs e Nuvem:** A infraestrutura de nuvem moderna do Witiquetas (Cloudflare, AWS, Google Cloud) exige no mínimo **TLS 1.2 com cifras seguras (ECDHE-ECDSA/RSA, AES-GCM)** e validação estrita de certificados SHA-256 com raízes modernas (Let's Encrypt ISRG Root X1).
- **CryptoAPI Legada:** O subsistema Schannel do Windows 95/98 suporta apenas SSL 2.0 e SSL 3.0 (vulneráveis a ataques como POODLE e BEAST, sumariamente banidos por normas globais PCI-DSS e LGPD). O Windows XP possui suporte limitado ao TLS 1.0 (apenas com o patch POSReady 2009 para TLS 1.2 capenga, sem suporte a cifras elípticas modernas).
- **Risco de Segurança:** Permitir que o backend do Witiquetas faça downgrade de TLS para aceitar conexões diretas do Windows 95 ou XP abriria uma vulnerabilidade crítica de Man-in-the-Middle em toda a infraestrutura multiempresa.

---

## 3. A Alternativa Arquitetural: "Legacy Print Bridge" (Pesquisa)

Se uma empresa possui um software ERP antigo rodando em uma máquina Windows 95 ou XP que precisa imprimir etiquetas térmicas gerenciadas pelo Witiquetas, a solução **NUNCA** deve ser enfraquecer o Agent moderno. Em vez disso, investigamos duas opções de ponte local:

```
[ CENÁRIO A: IMPRESSÃO DIRETA DE REDE (PADRÃO WITIQUETAS) ]
Witiquetas Cloud  ---(TLS 1.3 Seguro)--->  PC Moderno (Win 10/Linux)  ---(RAW 9100)--->  Impressora Térmica
                                           [ Witiquetas Agent Ativo ]                      (Zebra/Elgin na LAN)
* A máquina legada Win 95/XP NÃO PARTICIPA da impressão e não precisa de nenhum software instalado!

[ CENÁRIO B: LEGACY PRINT BRIDGE (GATEWAY LOCAL) ]
Máquina Win 95/XP  ---(Rede Local / SMB / LPR)--->  Gateway Local (Raspberry Pi)  ---(TLS 1.3)--->  Witiquetas Cloud
(ERP Antigo gera texto)                            [ Legacy Bridge Sanitizer ]
```

### 3.1. Detalhamento do Cenário A: Impressão Desacoplada (A Solução Ideal)
No modelo de produto do Witiquetas, a emissão de etiquetas na nuvem é disparada pelo navegador web ou por integrações de retaguarda.
- A impressora térmica (ex: Zebra ZD220 ou Elgin L42 Pro) possui placa de rede Ethernet ou está conectada via USB a um computador moderno (Windows 10/11 ou Raspberry Pi) na mesma loja;
- O Witiquetas Agent é instalado **apenas no computador moderno**;
- O terminal legado continua executando suas rotinas fiscais antigas sem interferência, enquanto todas as impressões de gôndola, preços e logística são operadas pelo Witiquetas de forma centralizada.

### 3.2. Detalhamento do Cenário B: Legacy Print Bridge (Caso Extremo de Spooler)
Se o ERP legado rodando em Windows 95/XP precisar obrigatoriamente disparar a impressão como se fosse uma impressora local da rede:
1. Um microdispositivo moderno de baixo custo (ex: Raspberry Pi Zero 2W de R$ 150 ou um mini-PC Linux) é colocado na rede da loja;
2. Ele emula uma impressora de rede padrão antiga via protocolo LPR/LPD (RFC 1179) ou compartilhamento SAMBA/SMBv1 compatível com Windows 95;
3. O Windows 95 envia os dados puros via rede local para o Gateway;
4. O Gateway captura o fluxo, empacota com segurança e o encaminha para o Witiquetas Agent moderno via TLS 1.3 seguro.

---

## 4. Avaliação de Risco e Diretriz Canônica

| Fator de Risco | Tentativa de Agent Nativo em Win 95/XP | Abordagem Legacy Print Bridge |
| :--- | :--- | :--- |
| **Quebra de Criptografia TLS** | **CRÍTICO:** Exigiria habilitar SSLv3 na nuvem. | **ZERO:** A nuvem mantém 100% TLS 1.3 seguro. |
| **Manutenção de Toolchain** | **CRÍTICO:** Congelar Rust em versões antigas. | **ZERO:** Core evolui normalmente na versão estável. |
| **Estabilidade Operacional** | **ALTA FALHA:** Crashes de memória e BSODs. | **ALTA:** O gateway roda em Linux moderno. |
| **Complexidade de Suporte** | Inviável para escala de produto. | Restrito a casos especiais com hardware bridge. |

> **DIRETRIZ FINAL DE ARQUITETURA:**  
> O Witiquetas Agent moderno **NÃO** terá suporte nativo a Windows 95, 98, ME, 2000 ou XP.  
> Qualquer atendimento a clientes com essa demanda específica será tratado no nível de infraestrutura de rede (Cenário A ou Legacy Print Bridge), preservando intacta a segurança criptográfica da plataforma.
