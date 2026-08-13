# Witiquetas

Plataforma Web para criação, gestão, compilação e impressão de etiquetas térmicas de gôndola.

## Produção

```text
https://witiquetas.wrtec.com.br
```

## Repositório

```text
https://github.com/Wittemberg/witiquetas
```

## Três pilares

1. **Frontend Web** — editor visual e gestão.
2. **Backend/API** — segurança, dados, compiladores e jobs.
3. **Agente Local** — comunicação com impressoras e atualização local.

## Documentação

- `DOCUMENTACAO-FRONTEND.md`
- `DOCUMENTACAO-BACKEND.md`
- `DOCUMENTACAO-GENTE-LOCAL.md`
- `docs/INFRAESTRUTURA.md`

## Arquitetura

```text
Browser
  ↓ HTTPS
Frontend
  ↓ /api
Backend
  ├── PostgreSQL
  ├── MinIO/S3
  └── Jobs
        ↓
   Agente Local
        ↓
   Impressora térmica
```

## Infraestrutura

Padrão operacional:

```text
GitHub → Actions → GHCR → Portainer/Swarm → Traefik
```

Rede compartilhada:

```text
interna
```

TLS:

```text
letsencryptresolver
```

Documento inicial: 13/08/2026.
