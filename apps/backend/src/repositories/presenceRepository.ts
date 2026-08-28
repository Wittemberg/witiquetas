import { pgPool, isProduction } from '../db.ts';

export interface EditingSessionDTO {
  id: string;
  modelId: string;
  companyId: string;
  sessionId: string;
  userIdentifier: string;
  os?: string;
  browser?: string;
  deviceName?: string;
  openedAt: string;
  lastSeenAt: string;
}

export interface RegisterSessionOptions {
  modelId: string;
  companyId: string;
  sessionId: string;
  userIdentifier: string;
  os?: string;
  browser?: string;
  deviceName?: string;
}

// Memory store fallback para testes e dev sem Postgres
const memorySessions = new Map<string, EditingSessionDTO>();

export class ActiveEditingSessionError extends Error {
  activeSessions: EditingSessionDTO[];
  constructor(activeSessions: EditingSessionDTO[]) {
    super('Este modelo está sendo editado no momento por outra sessão.');
    this.name = 'ActiveEditingSessionError';
    this.activeSessions = activeSessions;
  }
}

export const presenceRepository = {
  /**
   * Registra ou atualiza o heartbeat de uma sessão de edição
   */
  async registerOrHeartbeatSession(opts: RegisterSessionOptions): Promise<EditingSessionDTO> {
    const { modelId, companyId, sessionId, userIdentifier, os, browser, deviceName } = opts;
    const now = new Date().toISOString();
    const compositeKey = `${companyId}:${modelId}:${sessionId}`;

    // Limpeza oportunística
    await this.performOpportunisticCleanup().catch(() => {});

    if (!pgPool) {
      if (isProduction) {
        throw new Error('FAIL-CLOSED: Conexão PostgreSQL indisponível em ambiente de produção.');
      }
      const existing = memorySessions.get(compositeKey);
      const session: EditingSessionDTO = {
        id: existing ? existing.id : `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        modelId,
        companyId,
        sessionId,
        userIdentifier: userIdentifier || 'Sessão de Edição',
        os,
        browser,
        deviceName: deviceName || undefined,
        openedAt: existing ? existing.openedAt : now,
        lastSeenAt: now,
      };
      memorySessions.set(compositeKey, session);
      return JSON.parse(JSON.stringify(session));
    }

    const id = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const res = await pgPool.query(
      `INSERT INTO editing_sessions (
        id, model_id, company_id, session_id, user_identifier, os, browser, device_name, opened_at, last_seen_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (company_id, model_id, session_id) DO UPDATE
      SET last_seen_at = EXCLUDED.last_seen_at,
          user_identifier = EXCLUDED.user_identifier,
          os = EXCLUDED.os,
          browser = EXCLUDED.browser,
          device_name = EXCLUDED.device_name
      RETURNING id, model_id, company_id, session_id, user_identifier, os, browser, device_name, opened_at, last_seen_at`,
      [id, modelId, companyId, sessionId, userIdentifier, os || null, browser || null, deviceName || null, now, now]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      modelId: row.model_id,
      companyId: row.company_id,
      sessionId: row.session_id,
      userIdentifier: row.user_identifier,
      os: row.os || undefined,
      browser: row.browser || undefined,
      deviceName: row.device_name || undefined,
      openedAt: new Date(row.opened_at).toISOString(),
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
    };
  },

  /**
   * Remove a sessão de edição ao sair do editor
   */
  async leaveSession(opts: { modelId: string; companyId: string; sessionId: string }): Promise<void> {
    const { modelId, companyId, sessionId } = opts;
    const compositeKey = `${companyId}:${modelId}:${sessionId}`;

    if (!pgPool) {
      if (isProduction) {
        throw new Error('FAIL-CLOSED: Conexão PostgreSQL indisponível em ambiente de produção.');
      }
      memorySessions.delete(compositeKey);
      return;
    }

    await pgPool.query(
      `DELETE FROM editing_sessions
       WHERE company_id = $1 AND model_id = $2 AND session_id = $3`,
      [companyId, modelId, sessionId]
    );
  },

  /**
   * Consulta sessões ativas (last_seen_at >= NOW() - 45s) com isolamento estrito de tenant
   */
  async getActiveSessions(modelId: string, companyId: string): Promise<EditingSessionDTO[]> {
    const thresholdMs = Date.now() - 45 * 1000;

    if (!pgPool) {
      if (isProduction) {
        throw new Error('FAIL-CLOSED: Conexão PostgreSQL indisponível em ambiente de produção.');
      }
      const active: EditingSessionDTO[] = [];
      for (const s of memorySessions.values()) {
        if (s.companyId === companyId && s.modelId === modelId) {
          const lastSeenMs = new Date(s.lastSeenAt).getTime();
          if (lastSeenMs >= thresholdMs) {
            active.push(JSON.parse(JSON.stringify(s)));
          }
        }
      }
      return active;
    }

    const res = await pgPool.query(
      `SELECT id, model_id, company_id, session_id, user_identifier, os, browser, device_name, opened_at, last_seen_at
       FROM editing_sessions
       WHERE company_id = $1 AND model_id = $2 AND last_seen_at >= NOW() - INTERVAL '45 seconds'`,
      [companyId, modelId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      modelId: row.model_id,
      companyId: row.company_id,
      sessionId: row.session_id,
      userIdentifier: row.user_identifier,
      os: row.os || undefined,
      browser: row.browser || undefined,
      deviceName: row.device_name || undefined,
      openedAt: new Date(row.opened_at).toISOString(),
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
    }));
  },

  /**
   * Limpeza oportunística de sessões abandonadas a mais de 1 hora
   */
  async performOpportunisticCleanup(): Promise<void> {
    const oneHourAgoMs = Date.now() - 60 * 60 * 1000;

    if (!pgPool) {
      for (const [key, s] of memorySessions.entries()) {
        if (new Date(s.lastSeenAt).getTime() < oneHourAgoMs) {
          memorySessions.delete(key);
        }
      }
      return;
    }

    await pgPool.query(
      `DELETE FROM editing_sessions WHERE last_seen_at < NOW() - INTERVAL '1 hour'`
    );
  },
};
