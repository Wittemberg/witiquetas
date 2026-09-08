# Segurança e Autenticação de Desenvolvedor da Plataforma (DCC)

## 1. Visão Geral

O **Development Control Center (DCC)** é uma ferramenta interna de engenharia, governança e homologação da plataforma Witiquetas. Ele **não pertence** ao modelo comercial de locatários (*multi-tenant RBAC*) da aplicação.

Usuários comerciais das empresas contratantes — incluindo administradores com o papel `ADMIN` — **não possuem visibilidade, permissão nem mecanismo de acesso** ao DCC através de suas credenciais de tenant.

---

## 2. Decisão de Arquitetura de Segurança

### 2.1. Rejeição de Fórmulas Determinísticas
Propostas baseadas em regras determinísticas locais (por exemplo: combinação de data de nascimento do operador com a data corrente, `DATA_NASCIMENTO + DATA_ATUAL`):
1. **São criptograficamente nulas:** Reduzem o espaço de busca a poucas centenas de combinações triviais, permitindo ataques de força bruta imediatos em menos de 1 milissegundo.
2. **Violam padrões de mercado:** Não possuem garantia de não-repetição, entropia suficiente nem sincronismo temporal seguro.
3. **Não atendem a auditorias de segurança:** Qualquer auditoria de segurança ou Pentest classificaria o mecanismo como `CWE-327: Use of a Broken or Risky Cryptographic Algorithm` e vulnerabilidade crítica (CVSS 9.8).

### 2.2. Adoção do Padrão RFC 6238 (TOTP)
A plataforma adotou estritamente a especificação **RFC 6238 / RFC 4226**:
- **Algoritmo de Hash:** HMAC-SHA1.
- **Tamanho do Código:** 6 dígitos numéricos decimais.
- **Passo Temporal (Time Step):** 30 segundos.
- **Janela de Tolerância:** ±1 passo (30 segundos antes ou depois) para acomodar desvios normais de relógio cliente/servidor.
- **Comparação Temporalmente Constante:** `crypto.timingSafeEqual` para prevenir ataques de temporização (*timing attacks*).
- **Proteção contra Força Bruta (Rate Limiting):** Máximo de 5 tentativas consecutivas com falha em uma janela de 15 minutos por endereço IP.

---

## 3. Identidade Lógica e Segredo de Produção

### 3.1. Identidade Lógica
A identidade lógica autorizada para a plataforma é:
- **Username:** `Marcel`
- **Tipo:** Desenvolvedor da Plataforma / Mantenedor Técnico.
- **Persistência:** Entidade puramente lógica da plataforma. **Não existe** na tabela `users` do PostgreSQL, não possui vínculo com qualquer `company_id` e não consome licenças comerciais.

### 3.2. Segredo Criptográfico (`DCC_TOTP_SECRET`)
- O segredo base32 é injetado **exclusivamente** via variável de ambiente de produção:
  ```env
  DCC_TOTP_SECRET="JBSWY3DPEHPK3PXP" # (Exemplo ilustrativo; nunca commitar segredos reais)
  ```
- **Proibições Absolutas:**
  - NUNCA codificar o segredo no repositório Git (*hardcoded*).
  - NUNCA registrar o segredo em arquivos de log.
  - NUNCA trafegar o segredo ou disponibilizá-lo para requisições do frontend.

---

## 4. Ciclo de Vida da Sessão de Desenvolvedor

1. **Separação Completa de Sessão:**
   - A autenticação comercial de inquilinos utiliza o cookie `witiquetas_session`.
   - A autenticação técnica de desenvolvedor utiliza o cookie dedicado `witiquetas_dcc_session` (ou cabeçalho `x-dcc-session`).
   - Possuir uma sessão válida de tenant não concede acesso ao DCC.
   - Possuir uma sessão válida de desenvolvedor não concede acesso a dados comerciais de tenants.
2. **Tokens Criptográficos:**
   - Gerados com 256 bits de entropia (`crypto.randomBytes(32).toString('hex')`).
   - Armazenados na memória do processo backend via hash criptográfico SHA-256 (prevenindo vazamentos em caso de dump de memória).
3. **Tempo de Expiração (TTL):**
   - 4 horas de inatividade.
   - Revogação explícita suportada via endpoint `POST /api/development-control/auth/logout`.

---

## 5. Rotação de Segredo do Desenvolvedor

Para rotacionar a chave de autenticação do desenvolvedor em produção:
1. Gerar uma nova chave Base32 aleatória de 160 bits (20 bytes / 32 caracteres Base32):
   ```bash
   openssl rand -hex 20
   ```
2. Atualizar a variável de ambiente no orquestrador (ex: Portainer / Docker Compose / Kubernetes Secrets):
   ```env
   DCC_TOTP_SECRET="<NOVA_CHAVE_BASE32>"
   ```
3. Cadastrar a nova chave em seu aplicativo autenticador RFC 6238 compatível (Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden, etc.):
   ```text
   otpauth://totp/Witiquetas:Marcel?secret=<NOVA_CHAVE_BASE32>&issuer=Witiquetas%20Platform
   ```
4. Reiniciar o serviço backend para aplicação imediata. Sessões ativas permanecerão até expirarem ou podem ser revogadas reiniciando os containers.
