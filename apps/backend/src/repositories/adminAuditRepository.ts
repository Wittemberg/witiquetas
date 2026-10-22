import { getPgPool } from '../db.js';
import {
  AdminAuditLogEntryDTO,
  AdminAuditQueryFilterDTO,
} from '@witiquetas/contracts';

/**
 * Repositório para persistência append-only e consulta da trilha de auditoria administrativa.
 * Multi-tenant estrito: toda consulta exige company_id do contexto autenticado.
 * Opera no PostgreSQL ou em memória para testes unitários.
 */
export class AdminAuditRepository {
  private static memoryLogs: AdminAuditLogEntryDTO[] = [];

  /**
   * Limpa os logs em memória (utilizado em testes unitários)
   */
  public static clearMemoryLogs(): void {
    this.memoryLogs = [];
  }

  /**
   * Persiste um novo registro imutável de auditoria.
   */
  public static async create(entry: AdminAuditLogEntryDTO): Promise<AdminAuditLogEntryDTO> {
    const pool = getPgPool();

    if (!pool) {
      this.memoryLogs.unshift({ ...entry });
      return entry;
    }

    const query = `
      INSERT INTO admin_audit_logs (
        id, company_id, user_id, user_name, user_email,
        action, category, severity, target_id, target_type,
        details, ip_address, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;

    const values = [
      entry.id,
      entry.companyId,
      entry.userId,
      entry.userName,
      entry.userEmail,
      entry.action,
      entry.category,
      entry.severity,
      entry.targetId,
      entry.targetType,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.ipAddress,
      entry.createdAt,
    ];

    try {
      await pool.query(query, values);
      return entry;
    } catch (err: any) {
      console.error(`[AdminAuditRepository] Falha ao persistir audit log no PostgreSQL: ${err.message}`);
      throw err;
    }
  }

  /**
   * Consulta paginada com filtros e isolamento rigoroso por company_id.
   */
  public static async list(
    companyId: string,
    filter: AdminAuditQueryFilterDTO = {}
  ): Promise<{ logs: AdminAuditLogEntryDTO[]; total: number }> {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
    const offset = (page - 1) * limit;

    const pool = getPgPool();

    if (!pool) {
      // Filtragem em memória para testes unitários
      let filtered = this.memoryLogs.filter((log) => log.companyId === companyId);

      if (filter.category) {
        filtered = filtered.filter((log) => log.category === filter.category);
      }
      if (filter.action) {
        filtered = filtered.filter((log) => log.action.toLowerCase().includes(filter.action!.toLowerCase()));
      }
      if (filter.userId) {
        filtered = filtered.filter((log) => log.userId === filter.userId);
      }
      if (filter.startDate) {
        const start = new Date(filter.startDate).getTime();
        filtered = filtered.filter((log) => new Date(log.createdAt).getTime() >= start);
      }
      if (filter.endDate) {
        const end = new Date(filter.endDate).getTime();
        filtered = filtered.filter((log) => new Date(log.createdAt).getTime() <= end);
      }

      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + limit);

      return { logs: paginated, total };
    }

    // Consulta SQL com parametrização dinâmica e segura
    const conditions: string[] = ['company_id = $1'];
    const params: any[] = [companyId];
    let paramIndex = 2;

    if (filter.category) {
      conditions.push(`category = $${paramIndex++}`);
      params.push(filter.category);
    }

    if (filter.action) {
      conditions.push(`action ILIKE $${paramIndex++}`);
      params.push(`%${filter.action}%`);
    }

    if (filter.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filter.userId);
    }

    if (filter.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filter.startDate);
    }

    if (filter.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filter.endDate);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countQuery = `SELECT count(*)::int as total FROM admin_audit_logs ${whereClause};`;
    const dataQuery = `
      SELECT
        id, company_id, user_id, user_name, user_email,
        action, category, severity, target_id, target_type,
        details, ip_address, created_at
      FROM admin_audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;

    try {
      const countRes = await pool.query<{ total: number }>(countQuery, params);
      const total = countRes.rows[0]?.total || 0;

      const dataParams = [...params, limit, offset];
      const dataRes = await pool.query<any>(dataQuery, dataParams);

      const logs: AdminAuditLogEntryDTO[] = dataRes.rows.map((row) => ({
        id: row.id,
        companyId: row.company_id,
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        action: row.action,
        category: row.category,
        severity: row.severity,
        targetId: row.target_id,
        targetType: row.target_type,
        details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
        ipAddress: row.ip_address,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      }));

      return { logs, total };
    } catch (err: any) {
      console.error(`[AdminAuditRepository] Falha ao consultar audit logs no PostgreSQL: ${err.message}`);
      throw err;
    }
  }
}
