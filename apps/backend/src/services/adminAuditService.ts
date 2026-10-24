import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  AdminAuditCategory,
  AdminAuditSeverity,
  AdminAuditLogEntryDTO,
  AdminAuditQueryFilterDTO,
  AdminAuditListResponseDTO,
} from '@witiquetas/contracts';
import { AdminAuditRepository } from '../repositories/adminAuditRepository.js';

export interface AuditActorContext {
  id: string | null;
  name?: string | null;
  email?: string | null;
  ipAddress?: string | null;
}

export interface RecordAuditEventInput {
  companyId: string;
  actor: AuditActorContext;
  action: string;
  category: AdminAuditCategory;
  severity?: AdminAuditSeverity;
  targetId?: string | null;
  targetType?: string | null;
  details?: Record<string, unknown> | null;
}

const SENSITIVE_KEY_REGEX = /(password|token|secret|hash|cookie|auth|credential|key|jwt)/i;

/**
 * Sanitiza recursivamente chaves de objetos para evitar o vazamento de segredos na auditoria.
 */
export function sanitizeAuditDetails(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditDetails(item));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (val !== null && typeof val === 'object') {
      sanitized[key] = sanitizeAuditDetails(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export class AdminAuditService {
  /**
   * Registra um evento administrativo de forma segura, imutável e sanitizada.
   * Lança erro explícito se a persistência falhar, sem retorno enganoso de sucesso.
   * Permite injeção de PoolClient para operações transacionais quando suportadas.
   */
  public static async recordEvent(
    input: RecordAuditEventInput,
    client?: PoolClient
  ): Promise<AdminAuditLogEntryDTO> {
    const sanitizedDetails = input.details ? sanitizeAuditDetails(input.details) : null;

    const entry: AdminAuditLogEntryDTO = {
      id: crypto.randomUUID(),
      companyId: input.companyId,
      userId: input.actor.id || null,
      userName: input.actor.name || null,
      userEmail: input.actor.email || null,
      action: input.action,
      category: input.category,
      severity: input.severity || 'INFO',
      targetId: input.targetId || null,
      targetType: input.targetType || null,
      details: sanitizedDetails,
      ipAddress: input.actor.ipAddress || null,
      createdAt: new Date().toISOString(),
    };

    return await AdminAuditRepository.create(entry, client);
  }

  /**
   * Consulta a trilha de auditoria com garantia estrita de tenant isolation e paginação.
   */
  public static async listAuditLogs(
    companyId: string,
    filter: AdminAuditQueryFilterDTO = {}
  ): Promise<AdminAuditListResponseDTO> {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));

    const { logs, total } = await AdminAuditRepository.list(companyId, {
      ...filter,
      page,
      limit,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      logs,
      total,
      page,
      limit,
      totalPages,
    };
  }
}
