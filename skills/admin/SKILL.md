# Skill — Administração

Use ao alterar Empresa, Nichos & Elementos, Usuários, Perfis, Permissões, Integrações, Impressoras, Agents ou Auditoria.

## Invariantes
- Multiempresa: nunca aceitar referência cruzada entre tenants.
- Backend é autoridade de autorização.
- Não inferir permissão por nome de papel, e-mail ou UI.
- Configuração inicial pode usar presets; depois do bootstrap, estado persistido é autoridade.
- Nunca sobrescrever customização existente durante seed/bootstrap.

## Configuração efetiva
Platform → Company → Niche → Integration → Role → User → Model.

Elementos efetivos:
Platform supported ∩ Company enabled ∩ Niche enabled ∩ Role allowed ∩ User allowed.

Campos integrados:
Canonical Field ∩ Company/Niche enabled ∩ Integration provides.

Documento canônico: `docs/architecture/GOVERNANCE-ADMIN-ARCHITECTURE.md` e `docs/decisions/ADR-002-customer-company.md`.

## DCC
- Developer-only.
- Não expor permissões DCC na matriz comercial.
- PLATFORM_DEVELOPER não é tenant ADMIN.

## UX
- Sem sobreposição de cards/linhas.
- Mudança de toggle deve ter consequência clara e previsível.
- Preview Efetivo deve explicar resultado, não criar uma segunda fonte de verdade.
