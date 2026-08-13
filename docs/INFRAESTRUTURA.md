# Witiquetas — Infraestrutura Inicial

## 1. Base analisada

A infraestrutura do projeto deve seguir o padrão já utilizado na WRTEC:

```text
GitHub
→ GitHub Actions
→ GHCR
→ Portainer / Docker Swarm
→ Traefik
```

Rede externa já utilizada:

```text
interna
```

TLS:

```text
letsencryptresolver
```

Domínio:

```text
witiquetas.wrtec.com.br
```

---

## 2. MinIO atual

Stack recebida:

```text
image: quay.io/minio/minio:RELEASE.2024-01-13T07-53-03Z-cpuv1
data: /data
volume: minio_data
network: interna
S3: https://s3.wrtec.com.br
console: https://storage.wrtec.com.br
region: eu-south
placement: manager
```

Recomendação:

- manter a stack MinIO separada;
- Witiquetas usa credencial própria;
- criar bucket `witiquetas`;
- não usar `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` na aplicação;
- política mínima de acesso;
- considerar versionamento;
- fazer backup externo.

---

## 3. PostgreSQL atual

Stack recebida:

```text
image: postgres:14
max_connections=500
shared_buffers=512MB
timezone=America/Sao_Paulo
volume: postgres_data
network: interna
placement: manager
CPU limit: 1
RAM limit: 1024M
```

Recomendação:

- database `witiquetas`;
- usuário `witiquetas_app`;
- senha exclusiva;
- porta não publicada;
- acesso apenas pela rede `interna`;
- migrations pelo backend.

### Atenção de capacidade

`shared_buffers=512MB` com limite total de `1024M` deixa relativamente pouco espaço para conexões, work memory, processos auxiliares e overhead. Antes de aumento de carga, revisar limites e consumo real.

---

## 4. Volumes

Volumes atuais são externos:

```text
minio_data
postgres_data
```

Não criar volumes duplicados dentro da stack Witiquetas para esses serviços.

O backend deverá ser essencialmente stateless. Arquivos persistentes pertencem ao MinIO; dados relacionais pertencem ao PostgreSQL.

---

## 5. Stack Witiquetas

Arquivo de referência:

```text
infrastructure/portainer/witiquetas-stack.yml
```

Serviços:

```text
witiquetas_frontend
witiquetas_backend
```

MinIO e PostgreSQL ficam em stacks próprias, compartilhando `interna`.

---

## 6. DNS

Criar apontamento para o mesmo endpoint público/Traefik:

```text
witiquetas.wrtec.com.br
```

Certificado gerenciado pelo resolver existente.

---

## 7. CI/CD

Seguir o modelo do `admin-ofertas-front`:

```text
push main
→ build
→ push GHCR
→ POST Portainer webhook
```

Secrets:

```text
GHCR_TOKEN
PORTAINER_WEBHOOK_URL
```

Para monorepo, o workflow deve reconstruir frontend e backend conforme alteração de paths ou, inicialmente, ambos para simplicidade.

---

## 8. Backups

### PostgreSQL

Volume não é backup.

Implementar:

```text
pg_dump
→ compactação
→ armazenamento externo
→ retenção
→ teste de restore
```

### MinIO

Definir cópia periódica para destino externo.

---

## 9. Ambientes

Inicialmente:

```text
development
production
```

Recomendável futuramente:

```text
staging
```

Subdomínio possível:

```text
witiquetas-hml.wrtec.com.br
```

Não criar staging apontando para o mesmo banco de produção.

---

Documento inicial: 13/08/2026.
