import { pgPool } from '../db.js';
import type { AgentDTO } from '@witiquetas/contracts';

export interface AgentRecord extends AgentDTO {
  tokenHash: string;
  osVersion?: string;
  protocolVersion?: number;
  revokedAt?: string | null;
  metadata?: any;
}

export const memoryAgentsStore = new Map<string, AgentRecord>();

export class AgentsRepository {
  /**
   * Salva ou atualiza o agente no PostgreSQL e no cache em memória
   */
  static async save(agent: AgentRecord): Promise<void> {
    if (pgPool) {
      try {
        await pgPool.query(
          `
          INSERT INTO agents (
            id, company_id, installation_id, machine_name, os, os_version,
            architecture, agent_version, protocol_version, token_hash,
            status, last_seen_at, paired_at, created_at, updated_at, revoked_at, metadata
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17
          )
          ON CONFLICT (id) DO UPDATE SET
            company_id = EXCLUDED.company_id,
            installation_id = EXCLUDED.installation_id,
            machine_name = EXCLUDED.machine_name,
            os = EXCLUDED.os,
            os_version = EXCLUDED.os_version,
            architecture = EXCLUDED.architecture,
            agent_version = EXCLUDED.agent_version,
            protocol_version = EXCLUDED.protocol_version,
            token_hash = EXCLUDED.token_hash,
            status = EXCLUDED.status,
            last_seen_at = EXCLUDED.last_seen_at,
            updated_at = NOW(),
            revoked_at = EXCLUDED.revoked_at,
            metadata = EXCLUDED.metadata;
          `,
          [
            agent.id,
            agent.companyId,
            agent.installationId,
            agent.machineName,
            agent.os,
            agent.osVersion || null,
            agent.architecture,
            agent.agentVersion,
            agent.protocolVersion || 1,
            agent.tokenHash,
            agent.status,
            agent.lastSeenAt || new Date().toISOString(),
            agent.createdAt || new Date().toISOString(),
            agent.createdAt || new Date().toISOString(),
            new Date().toISOString(),
            agent.revokedAt || null,
            agent.metadata ? JSON.stringify(agent.metadata) : null,
          ]
        );
      } catch (err: any) {
        console.error(`[AgentsRepository] Erro crítico ao persistir agente no PostgreSQL: ${err.message}`);
        throw err;
      }
    }

    // Atualiza cache em memória após persistência bem-sucedida
    memoryAgentsStore.set(agent.id, agent);
  }

  /**
   * Busca um agente por ID
   */
  static async findById(id: string): Promise<AgentRecord | null> {
    if (pgPool) {
      try {
        const res = await pgPool.query(
          'SELECT * FROM agents WHERE id = $1 AND revoked_at IS NULL',
          [id]
        );
        if (res.rows.length === 0) return null;
        const record = this.mapRowToRecord(res.rows[0]);
        memoryAgentsStore.set(record.id, record);
        return record;
      } catch (err: any) {
        console.error(`[AgentsRepository] Erro ao buscar agente por ID no PostgreSQL: ${err.message}`);
        throw err;
      }
    }

    if (memoryAgentsStore.has(id)) {
      const cached = memoryAgentsStore.get(id)!;
      if (!cached.revokedAt) return cached;
    }

    return null;
  }

  /**
   * Busca um agente por tokenHash
   */
  static async findByTokenHash(tokenHash: string): Promise<AgentRecord | null> {
    // 1. Se PostgreSQL estiver disponível, consulta a fonte da verdade
    if (pgPool) {
      try {
        const res = await pgPool.query(
          'SELECT * FROM agents WHERE token_hash = $1 AND revoked_at IS NULL',
          [tokenHash]
        );
        if (res.rows.length === 0) return null;
        const record = this.mapRowToRecord(res.rows[0]);
        memoryAgentsStore.set(record.id, record);
        return record;
      } catch (err: any) {
        console.error(`[AgentsRepository] Erro ao buscar agente por tokenHash no PostgreSQL: ${err.message}`);
        throw err;
      }
    }

    // 2. Fallback para cache de testes em memória
    for (const agent of memoryAgentsStore.values()) {
      if (agent.tokenHash === tokenHash && !agent.revokedAt) {
        return agent;
      }
    }

    return null;
  }

  /**
   * Atualiza o heartbeat e status do agente
   */
  static async updateHeartbeat(
    agentId: string,
    status: string,
    agentVersion?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    if (pgPool) {
      try {
        await pgPool.query(
          `
          UPDATE agents SET
            last_seen_at = NOW(),
            status = $1,
            agent_version = COALESCE($2, agent_version),
            updated_at = NOW()
          WHERE id = $3 AND revoked_at IS NULL
          `,
          [status, agentVersion || null, agentId]
        );
      } catch (err: any) {
        console.error(`[AgentsRepository] Erro ao atualizar heartbeat no PostgreSQL: ${err.message}`);
        throw err;
      }
    }

    if (memoryAgentsStore.has(agentId)) {
      const cached = memoryAgentsStore.get(agentId)!;
      cached.lastSeenAt = now;
      cached.status = status as any;
      if (agentVersion) cached.agentVersion = agentVersion;
    }
  }

  /**
   * Lista agentes por empresa (ou todas com '*')
   */
  static async listByCompany(companyId: string): Promise<AgentRecord[]> {
    if (pgPool) {
      try {
        const query =
          companyId && companyId !== '*'
            ? 'SELECT * FROM agents WHERE company_id = $1 AND revoked_at IS NULL ORDER BY last_seen_at DESC'
            : 'SELECT * FROM agents WHERE revoked_at IS NULL ORDER BY last_seen_at DESC';
        const params = companyId && companyId !== '*' ? [companyId] : [];

        const res = await pgPool.query(query, params);
        const records = res.rows.map(this.mapRowToRecord);

        // Atualiza cache em memória
        for (const rec of records) {
          memoryAgentsStore.set(rec.id, rec);
        }

        return records;
      } catch (err: any) {
        console.error(`[AgentsRepository] Erro ao listar agentes no PostgreSQL: ${err.message}`);
        throw err;
      }
    }

    let list = Array.from(memoryAgentsStore.values()).filter((a) => !a.revokedAt);
    if (companyId && companyId !== '*') {
      list = list.filter((a) => a.companyId === companyId);
    }
    return list;
  }

  /**
   * Revoga um agente
   */
  static async revoke(agentId: string, companyId?: string): Promise<boolean> {
    if (pgPool) {
      try {
        const query = companyId && companyId !== '*'
          ? 'UPDATE agents SET revoked_at = NOW(), status = \'UNAUTHORIZED\', updated_at = NOW() WHERE id = $1 AND company_id = $2'
          : 'UPDATE agents SET revoked_at = NOW(), status = \'UNAUTHORIZED\', updated_at = NOW() WHERE id = $1';
        const params = companyId && companyId !== '*' ? [agentId, companyId] : [agentId];

        const res = await pgPool.query(query, params);
        const affected = (res.rowCount ?? 0) > 0;
        if (affected && memoryAgentsStore.has(agentId)) {
          const cached = memoryAgentsStore.get(agentId)!;
          cached.revokedAt = new Date().toISOString();
          cached.status = 'UNAUTHORIZED' as any;
        }
        return affected;
      } catch (err: any) {
        console.error(`[AgentsRepository] Erro ao revogar agente no PostgreSQL: ${err.message}`);
        throw err;
      }
    }

    if (memoryAgentsStore.has(agentId)) {
      const cached = memoryAgentsStore.get(agentId)!;
      cached.revokedAt = new Date().toISOString();
      cached.status = 'UNAUTHORIZED' as any;
      return true;
    }

    return false;
  }

  private static mapRowToRecord(row: any): AgentRecord {
    return {
      id: row.id,
      companyId: row.company_id,
      installationId: row.installation_id,
      machineName: row.machine_name,
      os: row.os,
      osVersion: row.os_version,
      architecture: row.architecture,
      agentVersion: row.agent_version,
      protocolVersion: row.protocol_version,
      tokenHash: row.token_hash,
      status: row.status,
      lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : new Date().toISOString(),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
      metadata: row.metadata,
    };
  }
}
