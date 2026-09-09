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

import { NICHES, normalizeNicheId } from '@witiquetas/label-schema';

export interface SessionUser {
  id: string;
  companyId: string;
  name: string;
  email: string;
  status: string;
  isDccMaster?: boolean;
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
  defaultNicheId?: string;
  enabledElementsByNiche?: Record<string, string[]>;
  enabledFieldsByNiche?: Record<string, string[]>;
  fieldsAvailabilityByNiche?: Record<string, Record<string, { manual: boolean; integration: boolean }>>;
  csrfToken: string;
  dccEnabled?: boolean;
  canAccessDcc?: boolean;
  isDeveloper?: boolean;
}

// Estados conceituais da configuração efetiva (Fail-Safe P0)
export type ConfigStatus = 'LOADING' | 'READY' | 'ERROR';

// Armazena o contexto em memória local da aba
let activeSessionContext: SessionContext | null = null;
let currentConfigStatus: ConfigStatus = 'READY';

type SessionListener = (context: SessionContext | null, status: ConfigStatus) => void;
const listeners = new Set<SessionListener>();

export function getCachedSessionContext(): SessionContext | null {
  return activeSessionContext;
}

export function getConfigStatus(): ConfigStatus {
  return currentConfigStatus;
}

export function subscribeSessionContext(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setManualSessionContext(ctx: any, status: ConfigStatus = 'READY'): void {
  if (ctx && ctx.effectiveConfiguration) {
    activeSessionContext = {
      ...ctx,
      ...ctx.effectiveConfiguration,
      user: ctx.user || ctx.principal?.user,
      company: ctx.company || ctx.principal?.company,
    };
  } else {
    activeSessionContext = ctx;
  }
  currentConfigStatus = status;
  notifyListeners();
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(activeSessionContext, currentConfigStatus);
    } catch (e) {
      console.error('[Session] Error in listener:', e);
    }
  }
}

export function resolveCanonicalNicheId(nicheIdOrSlug?: string): string {
  if (!nicheIdOrSlug) return 'niche-gondola';
  const match = NICHES.find((n) => n.id === nicheIdOrSlug || n.slug === nicheIdOrSlug);
  if (match) return match.id;
  const slug = normalizeNicheId(nicheIdOrSlug);
  const bySlug = NICHES.find((n) => n.slug === slug);
  return bySlug ? bySlug.id : 'niche-gondola';
}

/**
 * Fail-Safe: Verifica se um tipo de elemento é permitido no nicho.
 * Se status for LOADING ou ERROR, preserva permissão (Fail-Safe: UNKNOWN != EVERYTHING DISABLED).
 * Suporta tanto (nicheId, elementType) quanto (elementType, nicheId).
 */
export function isElementAllowed(arg1?: string, arg2?: string): boolean {
  let nicheId = arg1;
  let elementType = arg2;

  if (arg1 && !arg2) {
    elementType = arg1;
    nicheId = undefined;
  } else if (arg1 && arg2) {
    if (arg2.startsWith('niche-') || ['text', 'price', 'barcode', 'qrcode', 'line', 'rectangle', 'image', 'table', 'date', 'promotional-price'].includes(arg1)) {
      elementType = arg1;
      nicheId = arg2;
    }
  }

  if (!elementType) return false;
  // Fail-safe: se carregando, em erro ou sem contexto, nunca desabilita tudo
  if (currentConfigStatus !== 'READY' || !activeSessionContext) {
    return true;
  }
  const canonicalNiche = resolveCanonicalNicheId(nicheId);
  const allowedMap = activeSessionContext.enabledElementsByNiche;
  if (!allowedMap) return true;

  const allowedList = allowedMap[canonicalNiche] || (nicheId ? allowedMap[nicheId] : undefined);
  if (!allowedList) return true;

  return allowedList.includes(elementType);
}

/**
 * Fail-Safe: Verifica se um campo canônico é permitido no nicho.
 * Campos do sistema 'system.*' são SEMPRE permitidos e resolvidos pela plataforma.
 * Suporta tanto (nicheId, fieldId) quanto (fieldId, nicheId).
 */
export function isFieldAllowed(arg1?: string, arg2?: string, source?: 'manual' | 'integration' | 'system'): boolean {
  let nicheId = arg1;
  let fieldId = arg2;

  if (arg1 && !arg2) {
    fieldId = arg1;
    nicheId = undefined;
  } else if (arg1 && arg2) {
    if (arg2.startsWith('niche-') || arg1.includes('.') || !arg1.startsWith('niche-')) {
      fieldId = arg1;
      nicheId = arg2;
    }
  }

  if (!fieldId) return false;
  if (fieldId.startsWith('system.')) {
    return source ? source === 'system' : true;
  }

  if (source === 'manual') {
    return getFieldAvailability(nicheId, fieldId).manual;
  }
  if (source === 'integration') {
    return getFieldAvailability(nicheId, fieldId).integration;
  }
  if (source === 'system') {
    return fieldId.startsWith('system.');
  }

  // Fail-safe: se carregando, em erro ou sem contexto, nunca desabilita tudo
  if (currentConfigStatus !== 'READY' || !activeSessionContext) {
    return true;
  }
  const canonicalNiche = resolveCanonicalNicheId(nicheId);

  // 1. Checa enabledFieldsByNiche se fornecido
  const allowedMap = activeSessionContext.enabledFieldsByNiche;
  if (allowedMap) {
    const allowedList = allowedMap[canonicalNiche] || (nicheId ? allowedMap[nicheId] : undefined);
    if (allowedList) {
      return allowedList.includes(fieldId);
    }
  }

  // 2. Checa fieldsAvailabilityByNiche se fornecido
  const availMap = activeSessionContext.fieldsAvailabilityByNiche;
  if (availMap) {
    const nicheAvail = availMap[canonicalNiche] || (nicheId ? availMap[nicheId] : undefined);
    if (nicheAvail && nicheAvail[fieldId]) {
      const raw = nicheAvail[fieldId] as any;
      const manual = Boolean(raw.manual ?? raw.availableForManual);
      const integration = Boolean(raw.integration ?? raw.availableForIntegration);
      return manual || integration;
    }
  }

  return true;
}

/**
 * Fail-Safe: Verifica disponibilidade de fontes do campo (MANUAL vs INTEGRATION).
 * Suporta tanto (nicheId, fieldId) quanto (fieldId, nicheId).
 */
export function getFieldAvailability(arg1?: string, arg2?: string): { availableForManual: boolean; availableForIntegration: boolean; manual: boolean; integration: boolean } {
  let nicheId = arg1;
  let fieldId = arg2;

  if (arg1 && !arg2) {
    fieldId = arg1;
    nicheId = undefined;
  } else if (arg1 && arg2) {
    if (arg2.startsWith('niche-') || arg1.includes('.') || !arg1.startsWith('niche-')) {
      fieldId = arg1;
      nicheId = arg2;
    }
  }

  const defaultTrue = { availableForManual: true, availableForIntegration: true, manual: true, integration: true };
  if (!fieldId) return defaultTrue;
  if (fieldId.startsWith('system.')) {
    return { availableForManual: true, availableForIntegration: true, manual: true, integration: true };
  }

  if (currentConfigStatus !== 'READY' || !activeSessionContext) {
    return defaultTrue;
  }

  const canonicalNiche = resolveCanonicalNicheId(nicheId);
  const availMap = activeSessionContext.fieldsAvailabilityByNiche;
  if (!availMap) return defaultTrue;

  const nicheAvail = availMap[canonicalNiche] || (nicheId ? availMap[nicheId] : undefined);
  if (!nicheAvail || !nicheAvail[fieldId]) {
    return defaultTrue;
  }

  const raw = nicheAvail[fieldId] as any;
  const manual = Boolean(raw.manual ?? raw.availableForManual);
  const integration = Boolean(raw.integration ?? raw.availableForIntegration);

  return {
    availableForManual: manual,
    availableForIntegration: integration,
    manual,
    integration,
  };
}

/**
 * Fail-Safe: Verifica se um nicho é autorizado para o perfil/usuário.
 */
export function isNicheAllowed(nicheId?: string): boolean {
  if (!nicheId) return true;
  if (currentConfigStatus !== 'READY' || !activeSessionContext) {
    return true;
  }
  const allowedNiches = activeSessionContext.allowedNiches;
  if (!allowedNiches || allowedNiches.length === 0) {
    return true;
  }
  const canonical = resolveCanonicalNicheId(nicheId);
  return allowedNiches.includes(nicheId) || allowedNiches.includes(canonical);
}

export function getCsrfToken(): string | null {
  return activeSessionContext?.csrfToken || null;
}

export function hasPermission(permissionCode: string): boolean {
  if (!activeSessionContext) return false;
  const { permissions } = activeSessionContext;
  return permissions.includes('*') || permissions.includes(permissionCode);
}

export function hasAnyPermission(permissionCodes: string[]): boolean {
  if (!activeSessionContext) return false;
  const { permissions } = activeSessionContext;
  if (permissions.includes('*')) return true;
  return permissionCodes.some((code) => permissions.includes(code));
}

/**
 * Regra efetiva de acesso ao DCC (Seção 10 do Pacote 5.3.1 / Hotfix 5.3.5):
 * Desenvolvedor de plataforma autenticado acessa diretamente o DCC na mesma sessão.
 */
export function canAccessDevControl(): boolean {
  if (!activeSessionContext) return false;
  if (activeSessionContext.isDeveloper || activeSessionContext.canAccessDcc) {
    return true;
  }
  const isMaster = Boolean(activeSessionContext.user?.isDccMaster);
  const dccEnabled = activeSessionContext.dccEnabled ?? true;
  const hasPerm = hasPermission('devcontrol.view');
  return dccEnabled && isMaster && hasPerm;
}

/**
 * Consulta o contexto de sessão efetivo no backend via GET /api/session/context
 */
export async function fetchSessionContext(): Promise<SessionContext | null> {
  currentConfigStatus = 'LOADING';
  notifyListeners();
  try {
    const res = await fetch('/api/session/context', {
      method: 'GET',
      credentials: 'include',
    });

    if (res.status === 200) {
      const data: SessionContext = await res.json();
      activeSessionContext = data;
      currentConfigStatus = 'READY';
      notifyListeners();
      return data;
    }

    if (res.status === 401 || res.status === 403) {
      activeSessionContext = null;
      currentConfigStatus = 'READY';
      notifyListeners();
      return null;
    }
    currentConfigStatus = 'ERROR';
    notifyListeners();
  } catch (err) {
    console.warn('[Session] Falha ao consultar contexto de sessão:', err);
    currentConfigStatus = 'ERROR';
    notifyListeners();
  }

  activeSessionContext = null;
  return null;
}

/**
 * Resolve o modo de autenticação de forma server-authoritative (Hotfix 5.3.5)
 * POST /api/auth/resolve-mode
 */
export async function resolveLoginMode(
  identifier: string
): Promise<{ authMode: 'DEVELOPER_TOTP' | 'TENANT_PASSWORD'; identifier?: string }> {
  try {
    const res = await fetch('/api/auth/resolve-mode', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identifier: identifier.trim() }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        authMode: data.authMode === 'DEVELOPER_TOTP' ? 'DEVELOPER_TOTP' : 'TENANT_PASSWORD',
        identifier: data.identifier,
      };
    }
  } catch (err) {
    console.warn('[Session] Falha ao resolver modo de autenticação:', err);
  }

  return { authMode: 'TENANT_PASSWORD' };
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
