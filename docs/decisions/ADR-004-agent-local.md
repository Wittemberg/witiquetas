# ADR-004 — Agente Local para impressão

- Status: Aceito
- Data: 13/08/2026

## Contexto

Navegadores não são uma base adequada para acesso irrestrito a TCP RAW, serial e hardware local.

As impressoras alvo frequentemente recebem comandos diretamente sem driver de sistema operacional.

## Decisão

Criar `Witiquetas Agent` em Tauri/Rust.

O agente:

- autentica a instalação;
- recebe job compilado;
- envia bytes à impressora;
- confirma resultado;
- mantém diagnóstico e fila mínima;
- atualiza-se por mecanismo assinado.

## Consequências

O agente não compila layout e não contém regra de negócio.

Não será permitido shell remoto ou execução arbitrária de scripts.
