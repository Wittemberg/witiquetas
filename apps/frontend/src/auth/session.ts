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

import { useState, useEffect } from 'react';
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
let sessionContextVersion = 0;

type SessionListener = (context: SessionContext | null, status: ConfigStatus) => void;
const listeners = new Set<SessionListener>();

export function getCachedSessionContext(): SessionContext | null {
  return activeSessionContext;
}

export function getConfigStatus(): ConfigStatus {
  return currentConfigStatus;
}

export function getSessionContextVersion(): number {
  return sessionContextVersion;
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
  sessionContextVersion++;
  for (const listener of listeners) {
    try {
      listener(activeSessionContext, currentConfigStatus);
    } catch (e) {
      console.error('[Session] Error in listener:', e);
    }
  }
}

/**
 * Hook do React para sincronização reativa com o contexto de sessão.
 */
export function useSessionContext(): { context: SessionContext | null; status: ConfigStatus; version: number } {
  const [state, setState] = useState(() => ({
    context: activeSessionContext,
    status: currentConfigStatus,
    version: sessionContextVersion,
  }));

  useEffect(() => {
    return subscribeSessionContext((context, status) => {
      setState({ context, status, version: sessionContextVersion });
    });
  }, []);

  return state;
}

/**
 * Canal Multi-Aba (BroadcastChannel + Fallback localStorage)
 */
export const SESSION_SYNC_CHANNEL = 'witiquetas_session_sync';
let syncChannel: BroadcastChannel | null = null;
if (typeof BroadcastChannel !== 'undefined') {
  try {
    syncChannel = new BroadcastChannel(SESSION_SYNC_CHANNEL);
    if (typeof (syncChannel as any).unref === 'function') {
      (syncChannel as any).unref();
    }
    syncChannel.onmessage = (ev) => {
      if (ev?.data?.type === 'SESSION_CONFIG_INVALIDATED') {
        revalidateSessionContext(true);
      }
    };
  } catch {
    // BroadcastChannel não suportado ou restrito
  }
}

/**
 * Dispara sinal de invalidação para outras abas abertas
 */
export function broadcastSessionContextInvalidation(): void {
  try {
    if (syncChannel) {
      syncChannel.postMessage({ type: 'SESSION_CONFIG_INVALIDATED', timestamp: Date.now() });
    }
  } catch {
    // ignore
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SESSION_SYNC_CHANNEL, Date.now().toString());
    }
  } catch {
    // ignore
  }
}

let lastRevalidateTime = 0;
const REVALIDATE_THROTTLE_MS = 300;

/**
 * Revalida o contexto da sessão (/api/session/context) de forma segura e não destrutiva.
 */
export async function revalidateSessionContext(force = false): Promise<SessionContext | null> {
  const now = Date.now();
  if (!force && now - lastRevalidateTime < REVALIDATE_THROTTLE_MS) {
    return activeSessionContext;
  }
  lastRevalidateTime = now;

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

    // Fail-Safe: Erro 5xx ou inesperado preserva activeSessionContext existente
    currentConfigStatus = 'ERROR';
    notifyListeners();
    return activeSessionContext;
  } catch (err) {
    console.warn('[Session] Falha de rede ao revalidar contexto:', err);
    currentConfigStatus = 'ERROR';
    notifyListeners();
    return activeSessionContext;
  }
}

let isSyncInitialized = false;

/**
 * Inicializa ouvintes automáticos de foco, visibilidade de aba e storage multi-aba.
 */
export function initSessionSync(): () => void {
  if (typeof window === 'undefined' || isSyncInitialized) return () => {};
  isSyncInitialized = true;

  const handleFocus = () => {
    revalidateSessionContext();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      revalidateSessionContext();
    }
  };

  const handleStorage = (ev: StorageEvent) => {
    if (ev.key === SESSION_SYNC_CHANNEL) {
      revalidateSessionContext(true);
    }
  };

  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('storage', handleStorage);
    isSyncInitialized = false;
  };
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
 * Auxiliar: normaliza argumentos (nicheId, fieldId) ou (fieldId, nicheId).
 */
function parseNicheAndField(arg1?: string, arg2?: string): { nicheId?: string; fieldId?: string } {
  if (!arg1 && !arg2) return {};
  if (arg1 && !arg2) {
    if (arg1.includes('.') || arg1.startsWith('system.')) {
      return { fieldId: arg1 };
    }
    return { nicheId: arg1 };
  }
  // Se arg1 possui ponto (ex: product.description) e arg2 não, foi passado como (fieldId, nicheId)
  if (arg1 && arg2 && (arg1.includes('.') || arg1.startsWith('system.')) && !arg2.includes('.')) {
    return { fieldId: arg1, nicheId: arg2 };
  }
  // Caso padrão canônico: (nicheId, fieldId)
  return { nicheId: arg1, fieldId: arg2 };
}

/**
 * Fail-Safe: Verifica se um campo de dados está habilitado para o nicho atual.
 * Suporta tanto (nicheId, fieldId) quanto (fieldId, nicheId).
 */
export function isFieldAllowed(arg1?: string, arg2?: string, source?: 'manual' | 'integration' | 'system'): boolean {
  const { nicheId, fieldId } = parseNicheAndField(arg1, arg2);

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
  const { nicheId, fieldId } = parseNicheAndField(arg1, arg2);

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
  const match = NICHES.find((n) => n.id === nicheId || n.slug === nicheId);
  return (
    allowedNiches.includes(nicheId) ||
    allowedNiches.includes(canonical) ||
    Boolean(match && (allowedNiches.includes(match.id) || allowedNiches.includes(match.slug)))
  );
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

  // Fail-Safe: Erro 5xx ou de rede preserva activeSessionContext existente
  return activeSessionContext;
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
