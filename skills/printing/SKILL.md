# Skill — Impressão e Agent

Use ao alterar Central de Impressão, filas, jobs, Agent local, descoberta ou transporte de impressora.

## Semântica de status
Nunca confundir:
- ACCEPTED/QUEUED
- SENT
- DELIVERED_TO_TRANSPORT
- PRINTED

Sem feedback físico confiável, o sistema não pode afirmar `PRINTED`.

## Segurança
- Porta RAW TCP/9100 permanece somente em rede local.
- Agent autentica como máquina, separado de autenticação humana/developer.
- Não introduzir terminal remoto arbitrário.
- Operações administrativas devem ser tipadas, auditáveis e com menor privilégio.

## Responsabilidade
Backend/compiladores produzem payload.
Agent transporta payload.
Agent não deve reinterpretar ZPL/PPLB/PPLA/Argox/Elgin.
Documento canônico: `DOCUMENTACAO-AGENTE-LOCAL.md` e `packages/printer-core`.

## Testes
- idempotência e prevenção de impressão física duplicada;
- retry sem duplicar job;
- offline/reconnect;
- timeout/transporte;
- compilador correto;
- nenhuma mudança de status para PRINTED sem evidência.
