# Witiquetas — DOCUMENTACAO-BACKEND

## 1. Objetivo

O backend do Witiquetas é o núcleo de segurança, persistência, multi-tenancy, autorização, compilação de etiquetas, integrações, controle de jobs de impressão, auditoria e administração da plataforma.

Produção:

```text
https://witiquetas.wrtec.com.br/api
```

---

## 2. Stack

| Tecnologia | Uso |
|---|---|
| Node.js 20 LTS | Runtime |
| TypeScript | Linguagem |
| NestJS | Framework de API |
| PostgreSQL 14 | Banco relacional |
| Prisma | ORM e migrations |
| Redis — opcional/futuro | filas/cache |
| MinIO/S3 | logos, imagens, artefatos e arquivos |
| Zod/class-validator | validações |
| JWT + refresh token | autenticação |
| Argon2 | hash de senha |
| Swagger/OpenAPI | documentação da API |
| Pino | logs estruturados |

PostgreSQL 14 foi escolhido para manter compatibilidade com a stack já utilizada na infraestrutura atual.

---

## 3. Responsabilidades
 
O backend é responsável por:
 
- autenticação e segurança multi-tenant (Customer, Company, Branch);
- validação de e-mail e recuperação de credenciais;
- perfis e permissões RBAC (Administrador, Designer, Operador) e controle de licenças/planos;
- ciclo de vida de modelos ("Meus Modelos") e schemas versionados (`LabelDocument`);
- gestão da **Universal Data Architecture** e **Integration Field Catalog** (`docs/architecture/UNIVERSAL-DATA-ARCHITECTURE.md`);
- resolução de campos do sistema (`system.printDateTime`);
- motor de compilação multi-linguagem (PPLA, PPLB, ZPL, EPL);
- gestão de fila de **Print Jobs** com leases, expiração, re-tentativas e auditoria;
- autenticação, pareamento e comunicação segura com o **Witiquetas Agent**;
- cadastro e monitoramento de impressoras de rede e locais;
- armazenamento de assets, logos e layouts em S3/MinIO;
- contratos de API pública e SDK para ERPs parceiros (`docs/architecture/INTEGRATION-FIELD-CATALOG.md`);
- painel de manutenção e integração assistida por IA.

---

## 4. Modelo multi-tenant

Não usar `CNPJ = tenant`.

Estrutura:

```text
Customer
└── Company
    └── Branch operational scope
```

No Witiquetas, `Company` representa cada CNPJ/filial.

Entidades centrais:

```text
customers
companies
users
user_companies
roles
permissions
role_permissions
user_roles
```

Toda entidade de negócio deve possuir o escopo correto por `customer_id`, `company_id` ou ambos.

A API nunca deve confiar no `customer_id/company_id` recebido pelo frontend sem validar o vínculo do usuário autenticado.

---

## 5. Clonagem de filial

Endpoint conceitual:

```http
POST /admin/companies/:id/clone
```

Payload:

```json
{
  "targetCnpj": "00000000000000",
  "copy": {
    "settings": true,
    "templates": true,
    "printers": false,
    "roles": true,
    "integrationStructure": true
  }
}
```

Segredos e histórico nunca devem ser clonados.

O processo deverá:

1. validar permissão;
2. validar o CNPJ destino;
3. criar nova empresa no mesmo `customer_id`;
4. copiar somente estruturas autorizadas;
5. gerar novos IDs;
6. manter referência de origem para auditoria;
7. registrar `audit_log`.

---

## 6. Modelos e versões

Tabelas sugeridas:

```text
label_templates
label_template_versions
label_elements
```

Campos importantes:

```text
id
customer_id
company_id
scope
name
language_hint
schema_version
current_version_id
is_official
cloned_from_template_id
created_by
created_at
updated_at
```

O conteúdo do layout poderá ser armazenado em `jsonb`.

Não sobrescrever versão publicada. Criar nova versão.

---

## 7. Engine de etiquetas

Arquitetura:

```text
LabelSchema
   ↓
Validator
   ↓
LayoutNormalizer
   ↓
Compiler Interface
   ├── PPLACompiler
   ├── PPLBCompiler
   ├── ZPLCompiler
   ├── EPLCompiler
   └── futuros
```

Contrato:

```ts
interface PrinterCompiler {
  language: PrinterLanguage;
  validate(layout: LabelDocument): ValidationResult;
  compile(layout: LabelDocument, data: LabelData): CompiledLabel;
}
```

Saída:

```ts
interface CompiledLabel {
  language: string;
  encoding: string;
  command: string;
  warnings: string[];
}
```

---

## 8. Dados calculados

O backend deve oferecer campos derivados, por exemplo preço por unidade de referência.

Exemplo:

```text
produto = 900 ml
preço = R$ 3,60
referência = 1 L
resultado = R$ 4,00/L
```

O ERP poderá enviar unidade/fator e o Witiquetas fará o cálculo.

---

## 9. API futura para ERP

O Witiquetas deve definir contrato e não depender do banco do ERP.

Exemplos futuros:

```http
GET /integration/products/:code
GET /integration/price-changes
```

A software house do cliente implementará o endpoint conforme a documentação Witiquetas.

Credenciais de integrações devem ser criptografadas em repouso.

---

## 10. Impressão

Fluxo:

```text
Frontend
→ POST /print-jobs
→ Backend persiste job
→ Agente consulta/recebe job
→ Agente imprime
→ Agente confirma resultado
→ Backend registra log
```

Estados:

```text
PENDING
DISPATCHED
PRINTING
SUCCESS
FAILED
CANCELLED
EXPIRED
```

Tabelas:

```text
print_jobs
print_job_items
print_attempts
printers
local_agents
agent_heartbeats
```

---

## 11. Agentes locais

Cada agente deverá possuir credencial própria.

Não usar login/senha de usuário no serviço instalado.

Campos:

```text
id
company_id
installation_id
machine_name
version
status
last_seen_at
token_hash
created_at
revoked_at
```

O token do agente deve ser rotacionável e revogável.

---

## 12. Armazenamento S3 / MinIO

A infraestrutura atual disponibiliza:

```text
S3 API: https://s3.wrtec.com.br
Console: https://storage.wrtec.com.br
Região: eu-south
Rede: interna
Volume: minio_data
```

O Witiquetas deve usar usuário/access key próprio, nunca a credencial root do MinIO.

Bucket recomendado:

```text
witiquetas
```

Estrutura lógica:

```text
witiquetas/
├── platform/
│   └── templates/
├── customers/
│   └── {customerId}/
│       ├── branding/
│       └── templates/
├── companies/
│   └── {companyId}/
│       ├── logos/
│       ├── images/
│       └── exports/
└── maintenance/
    └── attachments/
```

Não usar nome/CNPJ como chave física principal; usar UUID.

Para objetos privados, preferir URL assinada temporária.

---

## 13. PostgreSQL

Stack atual analisada:

```text
postgres:14
max_connections=500
shared_buffers=512MB
timezone=America/Sao_Paulo
volume=postgres_data
network=interna
manager node
limit CPU=1
limit RAM=1024M
```

Recomendação para o Witiquetas:

- usar o PostgreSQL existente inicialmente;
- criar database `witiquetas`;
- criar usuário exclusivo `witiquetas_app`;
- não usar `postgres` como usuário da aplicação;
- manter migrations no repositório;
- não expor porta 5432 publicamente;
- conectar pela rede `interna`;
- fazer backup independente do volume Docker;
- validar `shared_buffers=512MB` versus limite total de 1 GB, pois banco + conexões + overhead podem pressionar memória sob carga.

Variável backend:

```env
DATABASE_URL=postgresql://witiquetas_app:***@postgres:5432/witiquetas
```

---

## 14. Migrações

Prisma:

```text
prisma/
├── schema.prisma
└── migrations/
```

Pipeline de produção:

```text
container start
→ prisma migrate deploy
→ start API
```

Nunca usar `prisma db push` como estratégia de produção.

---

## 15. Configuração e secrets

Nenhum segredo deve entrar no Git.

Variáveis:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
S3_ENDPOINT=https://s3.wrtec.com.br
S3_REGION=eu-south
S3_BUCKET=witiquetas
S3_ACCESS_KEY=
S3_SECRET_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
APP_PUBLIC_URL=https://witiquetas.wrtec.com.br
```

Os secrets de infraestrutura ficam no Portainer/GitHub Secrets, conforme responsabilidade.

---

## 16. Portainer / Swarm

Imagem:

```text
ghcr.io/wittemberg/witiquetas-backend:latest
```

Rede:

```text
interna
```

Roteamento:

```text
Host(`witiquetas.wrtec.com.br`) && PathPrefix(`/api`)
```

Backend interno:

```text
3000
```

O proxy pode remover ou preservar `/api`; a escolha deverá ser única e documentada no Nginx/Traefik.

---

## 17. GitHub Actions

O padrão operacional seguirá o repositório de referência:

```text
checkout
→ login GHCR
→ build/push
→ curl POST PORTAINER_WEBHOOK_URL
```

Separar secrets por serviço:

```text
GHCR_TOKEN
PORTAINER_WEBHOOK_URL
```

Idealmente, um webhook dedicado à stack Witiquetas.

Antes do deploy:

- lint;
- test;
- typecheck;
- build;
- migrations validation.

---

## 18. Segurança

Obrigatório:

- Argon2;
- refresh token rotacionável;
- expiração;
- rate limit;
- CORS restritivo;
- Helmet;
- logs de autenticação;
- auditoria;
- isolamento multi-tenant;
- validação de upload;
- criptografia de secrets de integrações;
- token de agente revogável;
- nenhuma execução arbitrária de shell via painel.

---

## 19. IA e manutenção

A IA não deve receber poder de alterar produção diretamente.

Fluxo:

```text
erro
→ coleta contexto
→ análise IA
→ patch sugerido
→ branch
→ PR
→ CI
→ revisão humana
→ merge
→ deploy
```

O painel poderá registrar:

```text
maintenance_incidents
maintenance_ai_analyses
maintenance_patches
```

Nunca armazenar secrets em prompts.

---

## 20. Auditoria

Registrar:

- login;
- alteração de usuário;
- alteração de permissão;
- criação/clonagem de cliente/filial;
- edição/publicação/restauração de modelo;
- alteração de integração;
- revogação de agente;
- configuração de impressora;
- ações de manutenção.

Campos:

```text
actor_user_id
customer_id
company_id
action
entity
entity_id
old_values
new_values
ip
user_agent
created_at
```

---

## 21. Observabilidade

Inicial:

- logs JSON;
- correlation/request ID;
- health endpoint;
- readiness;
- versão do build;
- métricas básicas.

Endpoints:

```text
GET /api/health
GET /api/version
```

---

## 22. Backup

PostgreSQL:

- dump periódico;
- retenção;
- cópia fora do host principal;
- teste periódico de restore.

MinIO:

- política de backup dos objetos;
- evitar tratar volume Docker como backup;
- versionamento de bucket pode ser considerado.

---

## 23. Primeira fase do backend

1. health/version;
2. banco/migrations;
3. estrutura customer/company;
4. usuários/RBAC;
5. modelos e versões;
6. schema abstrato;
7. compilador PPLB/PPLA;
8. geração TXT;
9. API para editor;
10. agentes/jobs depois da validação de impressão manual.

---

Documento inicial: 13/08/2026.
