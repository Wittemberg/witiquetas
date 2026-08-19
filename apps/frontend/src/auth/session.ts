/**
 * Módulo de Sessão Web e Bootstrap Pré-RBAC
 *
 * Gerencia a verificação de sessão e o bootstrap server-side pré-RBAC
 * utilizando exclusivamente cookies HttpOnly seguros.
 * Nenhuma credencial administrativa ou token de agente reside no frontend.
 */

export interface UserSession {
  authenticated: boolean;
  user?: {
    id: string;
    companyId: string;
    role: 'ADMIN' | 'OPERATOR' | 'SUPER_ADMIN';
  };
  expiresAt?: string;
}

/**
 * Consulta o status da sessão web atual no backend
 */
export async function checkWebSession(): Promise<UserSession> {
  try {
    const res = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return { authenticated: false };
}

/**
 * PRE-RBAC / TEMPORÁRIA:
 * Garante que o navegador possua uma sessão web válida emitida server-side.
 * Se a sessão atual não existir, dispara o bootstrap pré-RBAC do backend.
 */
export async function ensurePreRbacSession(): Promise<UserSession> {
  const current = await checkWebSession();
  if (current.authenticated) {
    return current;
  }

  try {
    const res = await fetch('/api/auth/pre-rbac-session', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (res.ok) {
      return await checkWebSession();
    }
  } catch {}

  return { authenticated: false };
}
