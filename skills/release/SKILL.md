# Skill — Release, CI/CD e Homologação

Use em qualquer tarefa que finalize pacote/hotfix/deploy.

## Sequência
1. Confirmar working tree/HEAD e escopo.
2. Rodar testes do pacote + regressões adjacentes.
3. Build frontend, backend e workspaces.
4. Criar checkpoint quando exigido em `docs/development-control/checkpoints.json`.
5. Commit sem misturar mudanças fora de escopo.
6. Push.
7. CI GREEN.
8. Deploy.
9. Confirmar convergência:
   - HEAD/origin;
   - frontend `/version.json`;
   - backend `/api/version`;
   - `/api/health`.
10. Executar smoke real de runtime quando o bug anterior escapou do build.
11. Solicitar testes manuais exatos.
12. STOP RULE.

Documento canônico: `docs/operations/RELEASE-SAFETY.md`.

## Regra
`IMPLEMENTED` não significa `HOMOLOGATED`.
Só marcar homologado após evidência automatizada + manual quando aplicável.

## P0
Crash de runtime, build quebrado, corrupção, isolamento de tenant, autenticação insegura, impressão física duplicada ou violação de lease/status bloqueiam avanço.
