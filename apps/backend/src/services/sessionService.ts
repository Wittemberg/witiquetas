import crypto from 'crypto';
import { SessionRepository, SessionRecord, clearSessionMemoryStores } from '../repositories/sessionRepository.js';
import { UserRepository, CompanyRepository, RoleRepository } from '../repositories/adminRepositories.js';
import type { RoleDTO } from '@witiquetas/contracts';

export { SessionRepository, clearSessionMemoryStores };

export interface AuthenticatedPrincipal {
  sessionId: string;
  csrfToken: string;
  user: {
    id: string;
    companyId: string;
    name: string;
    email: string;
    status: string;
  };
  company: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  roles: RoleDTO[];
  permissions: string[];
}

export interface SessionCreationResult {
  sessionId: string;
  rawToken: string;
  csrfToken: string;
  expiresAt: Date;
}

const DEFAULT_SESSION_TTL_HOURS = 8;

export class SessionService {
  /**
   * Hashes a raw session token using SHA-256
   */
  static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Generates a cryptographically strong random token with 256 bits of entropy (32 bytes)
   */
  static generateRandomToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Creates a new authenticated session for a validated active user.
   * Generates high-entropy token and CSRF token.
   * Only token_hash is stored in the database.
   */
  static async createAuthenticatedSession(params: {
    userId: string;
    companyId: string;
    ipAddress?: string;
    userAgent?: string;
    ttlHours?: number;
  }): Promise<SessionCreationResult> {
    const rawToken = this.generateRandomToken();
    const csrfToken = this.generateRandomToken();
    const tokenHash = this.hashToken(rawToken);

    const ttlHours = params.ttlHours || DEFAULT_SESSION_TTL_HOURS;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const sessionId = `sess-${crypto.randomBytes(16).toString('hex')}`;

    await SessionRepository.create({
      id: sessionId,
      tokenHash,
      csrfToken,
      userId: params.userId,
      companyId: params.companyId,
      expiresAt,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return {
      sessionId,
      rawToken,
      csrfToken,
      expiresAt,
    };
  }

  /**
   * Resolves the authenticated principal from a raw session token.
   * Enforces immediate session revocation if user or company status is not ACTIVE.
   */
  static async resolvePrincipalFromRawToken(rawToken: string): Promise<AuthenticatedPrincipal | null> {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim() === '') {
      return null;
    }

    const tokenHash = this.hashToken(rawToken.trim());
    const session = await SessionRepository.findByTokenHash(tokenHash);

    if (!session) {
      return null;
    }

    // Check if session is expired or revoked
    const now = new Date();
    if (session.revoked_at !== null || session.expires_at <= now) {
      return null;
    }

    // Touch session for activity tracking
    await SessionRepository.touch(session.id);

    // Fetch user and company
    const user = await UserRepository.findById(session.user_id);
    const company = await CompanyRepository.findById(session.company_id);

    // REFINEMENT P0 (SESSION INVALIDATION):
    // Ao detectar user.status != ACTIVE OU company.status != ACTIVE OU mismatch de tenant,
    // não apenas retornar 401/403: revogar/inutilizar a sessão no banco imediatamente.
    if (!user || user.companyId !== session.company_id || user.status !== 'ACTIVE' || !company || company.status !== 'ACTIVE') {
      await SessionRepository.revoke(session.id);
      return null;
    }

    // Dynamic resolution of roles and permissions
    const roles = await RoleRepository.getUserRoles(session.company_id, session.user_id);
    const permissionSet = new Set<string>();

    for (const role of roles) {
      const perms = await RoleRepository.getRolePermissions(role.id);
      for (const p of perms) {
        permissionSet.add(p);
      }
    }

    return {
      sessionId: session.id,
      csrfToken: session.csrf_token,
      user: {
        id: user.id,
        companyId: user.companyId,
        name: user.name,
        email: user.email,
        status: user.status,
      },
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        status: company.status,
      },
      roles,
      permissions: Array.from(permissionSet),
    };
  }

  /**
   * Revokes a session by ID
   */
  static async revokeSession(sessionId: string): Promise<boolean> {
    return SessionRepository.revoke(sessionId);
  }

  /**
   * Revokes all active sessions for a given user in a company
   */
  static async revokeAllUserSessions(companyId: string, userId: string): Promise<number> {
    return SessionRepository.revokeAllForUser(companyId, userId);
  }
}
