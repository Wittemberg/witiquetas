# Witiquetas — Security Policy

## 1. Objetivo

Este documento registra requisitos mínimos de segurança para desenvolvimento e operação do Witiquetas.

O sistema armazenará dados empresariais, usuários, CNPJs, configurações, integrações e credenciais técnicas. Segurança deve ser tratada como requisito arquitetural.

---

## 2. Repositório

Nunca versionar:

```text
.env
.env.*
*.pem
*.key
*.p12
*.pfx
secrets/
credentials/
database dumps
tokens
app passwords
access keys
private updater keys
```

Exceção:

```text
.env.example
```

somente com nomes de variáveis e valores fictícios.

---

## 3. Segredos

Responsabilidades:

```text
GitHub Secrets
→ credenciais necessárias ao CI/CD

Portainer / ambiente de runtime
→ segredos da aplicação em produção

Windows Credential Manager / DPAPI
→ credencial do Agente Local
```

Nunca usar segredo root do MinIO na aplicação.

Nunca usar usuário `postgres` na aplicação.

---

## 4. PostgreSQL

Witiquetas deve possuir:

```text
database: witiquetas
user: witiquetas_app
```

Princípio de menor privilégio.

Porta 5432 não deve ser publicada publicamente.

Backups devem ser criptografados/protegidos conforme ambiente e não versionados.

---

## 5. MinIO / S3

Usar:

- access key própria;
- policy restrita ao bucket do Witiquetas;
- URLs assinadas para conteúdo privado;
- validação de MIME e tamanho;
- nomes internos por UUID.

Nunca expor `MINIO_ROOT_USER` ou `MINIO_ROOT_PASSWORD` ao frontend/backend da aplicação.

---

## 6. Autenticação

Requisitos:

- hash Argon2;
- JWT access token curto;
- refresh token rotacionável;
- revogação;
- recuperação de senha com token de uso único;
- validação de e-mail;
- rate limiting;
- auditoria de eventos sensíveis.

---

## 7. Autorização e multi-tenancy

O backend é a autoridade.

O frontend não determina permissão.

Toda operação deve validar:

```text
user
→ role/permission
→ customer
→ company
→ resource
```

IDs conhecidos não concedem acesso.

---

## 8. Agente Local

Cada instalação possui credencial exclusiva.

Requisitos:

- token revogável;
- pareamento temporário;
- TLS;
- armazenamento seguro;
- assinatura de atualização;
- idempotência de impressão;
- nenhuma execução de shell remoto;
- nenhuma porta pública desnecessária.

---

## 9. IA

A IA pode receber somente contexto necessário e sanitizado.

Não enviar:

- passwords;
- tokens completos;
- access keys;
- strings de conexão completas;
- dados pessoais sem necessidade;
- dumps integrais de produção.

A IA não pode aplicar correção diretamente em produção.

Fluxo permitido:

```text
análise
→ patch
→ branch
→ PR
→ CI
→ revisão
→ deploy
```

---

## 10. Uploads

Validar no backend:

- tamanho;
- MIME real;
- extensão;
- nome;
- escopo;
- autorização.

Não confiar somente no `Content-Type` enviado pelo cliente.

---

## 11. Logs

Logs não devem conter:

- senha;
- Authorization header;
- refresh token;
- secret;
- conteúdo sensível desnecessário.

Usar correlation/request ID.

---

## 12. Auditoria

Registrar ações administrativas, incluindo:

- login;
- falhas relevantes de login;
- usuários;
- permissões;
- clientes;
- filiais;
- clonagem;
- modelos;
- publicação/restauração;
- integrações;
- agentes;
- impressoras;
- manutenção.

---

## 13. Dependências

Pipeline deve incluir análise de dependências e atualização controlada.

Não atualizar major versions automaticamente em produção sem validação.

---

## 14. Vulnerabilidades

Vulnerabilidade confirmada deve ser corrigida em branch dedicada e revisada antes do deploy.

Nunca publicar segredo ou detalhe explorável desnecessário em issue pública.

Como o produto tem finalidade comercial, recomenda-se repositório privado antes da inclusão de código proprietário e informações operacionais sensíveis.

---

## 15. Incidente

Fluxo mínimo:

```text
detectar
→ conter
→ preservar evidência
→ revogar credenciais afetadas
→ corrigir
→ testar
→ implantar
→ registrar causa
→ registrar prevenção
```

---

Documento inicial: 13/08/2026.
