/**
 * Módulo Canônico de Sessão Web e RBAC (Pacote 5.2)
 *
 * Gerencia o ciclo de vida da sessão do usuário no frontend:
 * - Cookie HttpOnly seguro para identificação da sessão
 * - Obtenção do contexto efetivo via GET /api/session/context
 * - Login canônico via POST /api/auth/login
 * - Logout canônico via POST /api/auth/logout
 * - CSRF Token para mutações com cookie
 */

export interface SessionUser {
  id: string;
  companyId: string;
  name: string;
  email: string;
  status: string;
}

export interface SessionCompany {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface SessionContext {
  user: SessionUser;
  company: SessionCompany;
  roles: string[];
  permissions: string[];
  allowedNiches: string[];
  enabledNiches?: string[];
  enabledElementsByNiche?: Record<string, string[]>;
  enabledFieldsByNiche?: Record<string, string[]>;
  csrfToken: string;
}

// Armazena o contexto em memória local da aba
let activeSessionContext: SessionContext | null = null;

export function getCachedSessionContext(): SessionContext | null {
  return activeSessionContext;
}

export function getCsrfToken(): string | null {
  return activeSessionContext?.csrfToken || null;
}

export function hasPermission(permissionCode: string): boolean {
  if (!activeSessionContext) return false;
  const { permissions } = activeSessionContext;
  return permissions.includes('*') || permissions.includes(permissionCode);
}

/**
 * Consulta o contexto de sessão efetivo no backend via GET /api/session/context
 */
export async function fetchSessionContext(): Promise<SessionContext | null> {
  try {
    const res = await fetch('/api/session/context', {
      method: 'GET',
      credentials: 'include',
    });

    if (res.status === 200) {
      const data: SessionContext = await res.json();
      activeSessionContext = data;
      return data;
    }

    if (res.status === 401 || res.status === 403) {
      activeSessionContext = null;
      return null;
    }
  } catch (err) {
    console.warn('[Session] Falha ao consultar contexto de sessão:', err);
  }

  activeSessionContext = null;
  return null;
}

/**
 * Realiza login canônico no backend
 */
export async function loginUser(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; context?: SessionContext }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      // Alimenta a sessão do frontend obtendo o contexto seguro
      const context = await fetchSessionContext();
      if (context) {
        return { success: true, context };
      }
      return { success: true };
    }

    const errData = await res.json().catch(() => ({}));
    return {
      success: false,
      error: errData.error || 'Credenciais inválidas.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Erro de conexão com o servidor.',
    };
  }
}

/**
 * Realiza logout canônico no backend
 */
export async function logoutUser(): Promise<void> {
  try {
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {};
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }

    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers,
    });
  } catch (err) {
    console.warn('[Session] Falha ao executar logout:', err);
  } finally {
    activeSessionContext = null;
  }
}

/**
 * Compatibilidade legada
 */
export async function checkWebSession(): Promise<{ authenticated: boolean; user?: any }> {
  const ctx = await fetchSessionContext();
  if (ctx) {
    return {
      authenticated: true,
      user: {
        id: ctx.user.id,
        companyId: ctx.company.id,
        role: ctx.roles[0] || 'ADMIN',
      },
    };
  }
  return { authenticated: false };
}

export async function ensurePreRbacSession(): Promise<{ authenticated: boolean }> {
  const ctx = await fetchSessionContext();
  return { authenticated: Boolean(ctx) };
}
