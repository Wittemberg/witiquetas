import { pgPool } from '../db.js';

export interface SessionRecord {
  id: string;
  token_hash: string;
  csrf_token: string;
  user_id: string;
  company_id: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date;
  ip_address?: string;
  user_agent?: string;
}

export interface CreateSessionParams {
  id: string;
  tokenHash: string;
  csrfToken: string;
  userId: string;
  companyId: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

const memSessions: Map<string, SessionRecord> = new Map();

export function clearSessionMemoryStores(): void {
  memSessions.clear();
}

export class SessionRepository {
  static async create(params: CreateSessionParams): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: params.id,
      token_hash: params.tokenHash,
      csrf_token: params.csrfToken,
      user_id: params.userId,
      company_id: params.companyId,
      created_at: new Date(),
      expires_at: params.expiresAt,
      revoked_at: null,
      last_seen_at: new Date(),
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
    };

    if (pgPool) {
      const query = `
        INSERT INTO sessions (id, token_hash, csrf_token, user_id, company_id, created_at, expires_at, revoked_at, last_seen_at, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *;
      `;
      const res = await pgPool.query(query, [
        record.id,
        record.token_hash,
        record.csrf_token,
        record.user_id,
        record.company_id,
        record.created_at,
        record.expires_at,
        record.revoked_at,
        record.last_seen_at,
        record.ip_address || null,
        record.user_agent || null,
      ]);
      const row = res.rows[0];
      return {
        ...row,
        created_at: new Date(row.created_at),
        expires_at: new Date(row.expires_at),
        revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
        last_seen_at: new Date(row.last_seen_at),
      };
    }

    memSessions.set(record.id, record);
    return record;
  }

  static async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    if (pgPool) {
      const query = `
        SELECT * FROM sessions
        WHERE token_hash = $1;
      `;
      const res = await pgPool.query(query, [tokenHash]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        ...row,
        created_at: new Date(row.created_at),
        expires_at: new Date(row.expires_at),
        revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
        last_seen_at: new Date(row.last_seen_at),
      };
    }

    for (const s of memSessions.values()) {
      if (s.token_hash === tokenHash) {
        return s;
      }
    }
    return null;
  }

  static async revoke(id: string): Promise<boolean> {
    const now = new Date();
    if (pgPool) {
      const query = `
        UPDATE sessions
        SET revoked_at = $1
        WHERE id = $2 AND revoked_at IS NULL;
      `;
      const res = await pgPool.query(query, [now, id]);
      return (res.rowCount ?? 0) > 0;
    }

    const session = memSessions.get(id);
    if (session && !session.revoked_at) {
      session.revoked_at = now;
      return true;
    }
    return false;
  }

  static async revokeAllForUser(companyId: string, userId: string): Promise<number> {
    const now = new Date();
    if (pgPool) {
      const query = `
        UPDATE sessions
        SET revoked_at = $1
        WHERE company_id = $2 AND user_id = $3 AND revoked_at IS NULL;
      `;
      const res = await pgPool.query(query, [now, companyId, userId]);
      return res.rowCount ?? 0;
    }

    let count = 0;
    for (const session of memSessions.values()) {
      if (session.company_id === companyId && session.user_id === userId && !session.revoked_at) {
        session.revoked_at = now;
        count++;
      }
    }
    return count;
  }

  static async touch(id: string): Promise<void> {
    const now = new Date();
    if (pgPool) {
      const query = `
        UPDATE sessions
        SET last_seen_at = $1
        WHERE id = $2;
      `;
      await pgPool.query(query, [now, id]);
      return;
    }

    const session = memSessions.get(id);
    if (session) {
      session.last_seen_at = now;
    }
  }
}
