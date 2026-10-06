# Matriz de Compatibilidade e Distribuição Linux: Witiquetas Agent
**Pesquisa Técnica de Arquitetura e Engenharia de Sistemas (Agent C)**  
*Status: DOCUMENTO CANÔNICO DE PESQUISA*  
*Data de Conclusão: Outubro de 2026*

---

## 1. O Desafio da Fragmentação no Linux

O ecossistema Linux no varejo e indústria brasileira é heterogêneo: desde servidores corporativos (RHEL/Rocky) e desktops Ubuntu/Mint em escritórios centrais, até microcomputadores embarcados (Raspberry Pi, Orange Pi) e terminais PDV baseados em Debian ou Alpine.

Para que a experiência seja profissional e previsível, o Witiquetas Agent adota duas premissas fundamentais:
1. **Independência de Versão da Biblioteca C (`glibc`):** O binário não pode falhar com o erro clássico `/lib/x86_64-linux-gnu/libc.so.6: version 'GLIBC_2.34' not found`.
2. **Independência do OpenSSL de Sistema:** O binário não pode exigir que o usuário instale manualmente pacotes como `libssl1.1` ou `libssl3`.

---

## 2. A Decisão Arquitetural: Compilação Estática com Musl

A solução adotada para o Core em Rust é a compilação integralmente estática com **`musl-libc`** e **`rustls`**:

```
[Witiquetas Agent Linux Binary]
  ├── Rust Core Application (Async runtime Tokio)
  ├── Crypto Engine (rustls + ring/aws-lc-rs estático)
  ├── TLS Root Certificates (webpki-roots embutido)
  └── Standard C Library (musl-libc estático)
  
==> RESULTADO: Binário ELF 100% autônomo (Zero dependências dinâmicas no ldd)
```

Testado via `ldd witiquetas-agent`:
`not a dynamic executable` (executa de forma idêntica em um Debian 10 de 2019 ou em um Fedora 41 de 2026).

---

## 3. Matriz de Distribuições Linux e Arquiteturas

| Distribuição | Versões Suportadas | Init System | Formato Nativo | x86_64 | aarch64 (ARM64) | armv7 (ARM 32) | Status Oficial |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Ubuntu** | 20.04, 22.04, 24.04 LTS | systemd | `.deb` | Sim | Sim | Não | **SUPPORTED** |
| **Debian** | 11 (Bullseye), 12 (Bookworm) | systemd | `.deb` | Sim | Sim | Best Effort | **SUPPORTED** |
| **Linux Mint** | 20.x, 21.x, 22.x | systemd | `.deb` | Sim | Não | Não | **SUPPORTED** |
| **Raspberry Pi OS** | 11, 12 (32-bit e 64-bit) | systemd | `.deb` | Não | Sim | Sim | **SUPPORTED** |
| **Fedora** | 38, 39, 40, 41 | systemd | `.rpm` | Sim | Sim | Não | **SUPPORTED** |
| **RHEL / Rocky / Alma**| 8.x, 9.x | systemd | `.rpm` | Sim | Sim | Não | **SUPPORTED** |
| **openSUSE** | Leap 15.5+, Tumbleweed | systemd | `.rpm` | Sim | Sim | Não | **SUPPORTED** |
| **Alpine Linux** | 3.18, 3.19, 3.20 | OpenRC | `.apk` / tar.gz | Sim | Sim | Sim | **SUPPORTED** |
| **Arch Linux / Manjaro**| Rolling release | systemd | PKGBUILD / tar.gz| Sim | Sim | Não | **BEST_EFFORT** |
| **CentOS 7 (Legado)** | 7.9 (Kernel 3.10) | systemd | tar.gz (musl) | Sim | Não | Não | **LEGACY_SUPPORTED** |

---

## 4. Gerenciamento de Serviços (Init Systems)

### 4.1. Ambientes com `systemd` (Padrão para 95%+ das distros)
O pacote `.deb` e `.rpm` registra e ativa automaticamente a unit de serviço do sistema:

Arquivo: `/lib/systemd/system/witiquetas-agent.service`
```ini
[Unit]
Description=Witiquetas Print Agent Daemon
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=witiquetas
Group=witiquetas
ExecStart=/usr/bin/witiquetas-agent --service
Restart=always
RestartSec=5s
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

# Endurecimento de Segurança do Serviço (Systemd Hardening)
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

### 4.2. Ambientes com `OpenRC` / `SysVinit` (Alpine, Devuan, Docker)
Arquivo: `/etc/init.d/witiquetas-agent`
```sh
#!/sbin/openrc-run
description="Witiquetas Print Agent Daemon"
command="/usr/bin/witiquetas-agent"
command_args="--service"
command_background="yes"
pidfile="/run/witiquetas-agent.pid"

depend() {
    need net
    after firewall
}
```

---

## 5. Permissões de Hardware, Dispositivos e Rede

Para operar sem privilégios de superusuário (`root`), o Agent utiliza um usuário de serviço dedicado (`witiquetas`) associado a regras de permissão de dispositivos:

1. **RAW TCP Egress (Porta 9100):**  
   Não exige privilégios de `root`. O socket de saída para IPs da sub-rede local opera normalmente sob qualquer usuário não-privilegiado.
2. **Impressoras Térmicas USB (`/dev/usb/lp*`):**  
   O usuário `witiquetas` é adicionado aos grupos de sistema `lp` e `dialout`.
3. **Regra Canônica de Udev:**  
   O pacote instala o arquivo `/etc/udev/rules.d/99-witiquetas-printers.rules` com os Vendor IDs dos principais fabricantes de impressoras térmicas (Zebra `0a5f`, Elgin `04b8`/`1504`, Argox `0bcd`, Citizen `1d90`, Godex `1cbe`):
   ```udev
   # Impressoras Térmicas USB - Acesso seguro ao grupo lp
   SUBSYSTEM=="usb", ATTR{idVendor}=="0a5f", GROUP="lp", MODE="0660"
   SUBSYSTEM=="usb", ATTR{idVendor}=="0bcd", GROUP="lp", MODE="0660"
   SUBSYSTEM=="usb", ATTR{idVendor}=="1504", GROUP="lp", MODE="0660"
   SUBSYSTEM=="usblp", GROUP="lp", MODE="0660"
   ```
4. **Coexistência com o CUPS:**  
   O CUPS frequentemente captura portas USB térmicas através do backend `usb`. O Witiquetas Agent pode enviar dados diretamente via protocolo RAW TCP da porta 9100 ou solicitar que o CUPS configure a impressora como fila "Raw Queue" para não corromper comandos ZPL/PPLB.

---

## 6. Formatos de Distribuição e Experiência do Usuário

### 6.1. Usuário Desktop (Ubuntu, Mint, Debian GUI)
- O usuário clica em "Baixar para Linux (Ubuntu/Debian)" na plataforma web e obtém `witiquetas-agent_1.0.0_amd64.deb`.
- Ao dar dois cliques, o instalador gráfico da distribuição (GNOME Software, Discover ou GDebi) é aberto.
- O usuário clica em "Instalar". Um atalho "Witiquetas Agent" é adicionado ao menu de aplicativos, abrindo o assistente gráfico de pareamento para digitar o código `WIT-XXXX-XXXX`.

### 6.2. Servidores Headless e Raspberry Pi (Instalação Rápida via Script)
Para administradores de servidores ou quiosques sem interface gráfica, disponibilizamos um instalador script assinado e determinístico:

```bash
# Instalação e pareamento automático em linha única
curl -sSL https://get.witiquetas.com/agent.sh | sudo sh -s -- --code WIT-7K4P-92MX
```

O script detecta a arquitetura (`uname -m`), o gerenciador de pacotes (`apt`, `dnf`, `zypper` ou `apk`), o sistema de init (`systemd` ou `openrc`), baixa o artefato correto, valida o checksum SHA-256 e inicializa o serviço.
