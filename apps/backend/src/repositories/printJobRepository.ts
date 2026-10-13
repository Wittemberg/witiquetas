import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pgPool, isProduction } from '../db.js';
import type {
  PrintJobDTO,
  PrintJobItemDTO,
  PrintJobDeliveryStatus,
  UpdatePrintJobStatusDTO,
  PrintJobEventDTO,
  CopyStrategy,
  TransportType,
} from '@witiquetas/contracts';

export const VALID_DELIVERY_STATUSES: PrintJobDeliveryStatus[] = [
  'PENDING',
  'CLAIMED',
  'DOWNLOADED',
  'DELIVERING',
  'DELIVERED_TO_TRANSPORT',
  'PRINTED',
  'FAILED',
  'CANCELLED',
  'UNKNOWN_RESULT',
  'EXPIRED_LEASE',
];

const VALID_TRANSITIONS: Record<PrintJobDeliveryStatus, PrintJobDeliveryStatus[]> = {
  PENDING: ['CLAIMED', 'CANCELLED'],
  CLAIMED: ['DOWNLOADED', 'DELIVERING', 'FAILED', 'CANCELLED', 'EXPIRED_LEASE'],
  DOWNLOADED: ['DELIVERING', 'FAILED', 'CANCELLED', 'EXPIRED_LEASE'],
  DELIVERING: ['DELIVERED_TO_TRANSPORT', 'PRINTED', 'FAILED', 'UNKNOWN_RESULT', 'CANCELLED'],
  DELIVERED_TO_TRANSPORT: ['PRINTED', 'UNKNOWN_RESULT', 'FAILED'],
  PRINTED: [],
  FAILED: ['PENDING'],
  CANCELLED: [],
  UNKNOWN_RESULT: ['DELIVERED_TO_TRANSPORT', 'PRINTED', 'FAILED'],
  EXPIRED_LEASE: ['PENDING', 'FAILED', 'UNKNOWN_RESULT'],
};

export function isValidStatusTransition(from: PrintJobDeliveryStatus, to: PrintJobDeliveryStatus): boolean {
  if (from === to) return true;
  const allowed = VALID_TRANSITIONS[from];
  return !!allowed && allowed.includes(to);
}

export interface CreateJobResult {
  job: PrintJobDTO;
  idempotentReplay: boolean;
}

export interface UpdateJobResult {
  status: number;
  job?: PrintJobDTO;
  error?: string;
  code?: string;
  idempotentReplay?: boolean;
}

function mapRowToDTO(row: any): PrintJobDTO {
  return {
    id: row.id,
    companyId: row.company_id,
    printerId: row.printer_id,
    printerName: row.printer_name || row.printer_id,
    status: row.status as PrintJobDeliveryStatus,
    language: row.language,
    encoding: row.encoding,
    copies: Number(row.copies || 1),
    copyStrategy: (row.copy_strategy || 'EMBEDDED_IN_PAYLOAD') as CopyStrategy,
    payload: row.payload,
    payloadBase64: row.payload_base64,
    payloadBytesLength: Number(row.payload_bytes_length),
    checksumSha256: row.checksum_sha256,
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 3),
    idempotencyKey: row.idempotency_key || undefined,
    leaseId: row.lease_id || undefined,
    claimedByAgentId: row.claimed_by_agent_id || undefined,
    claimedAt: row.claimed_at instanceof Date ? row.claimed_at.toISOString() : (row.claimed_at || undefined),
    leaseExpiresAt: row.lease_expires_at instanceof Date ? row.lease_expires_at.toISOString() : (row.lease_expires_at || undefined),
    attemptId: row.attempt_id || undefined,
    error: row.error || undefined,
    executionTimeMs: row.execution_time_ms !== null && row.execution_time_ms !== undefined ? Number(row.execution_time_ms) : undefined,
    deliveredToTransportAt: row.delivered_to_transport_at instanceof Date ? row.delivered_to_transport_at.toISOString() : (row.delivered_to_transport_at || undefined),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : (row.completed_at || undefined),
  };
}

function mapRowToEventDTO(row: any): PrintJobEventDTO {
  return {
    id: Number(row.id),
    jobId: row.job_id,
    companyId: row.company_id,
    fromStatus: row.from_status || null,
    toStatus: row.to_status,
    agentId: row.agent_id || null,
    leaseId: row.lease_id || null,
    attemptId: row.attempt_id || null,
    executionTimeMs: row.execution_time_ms !== null && row.execution_time_ms !== undefined ? Number(row.execution_time_ms) : null,
    error: row.error || null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

// Memory store exclusivamente para testes sem PostgreSQL ativo
export const testMemJobs = new Map<string, PrintJobDTO>();
export const testMemEvents: PrintJobEventDTO[] = [];

export class PrintJobRepository {
  /**
   * Limpa o store de testes em memória (isolamento de suítes de teste)
   */
  static clearMemory(): void {
    testMemJobs.clear();
    testMemEvents.length = 0;
  }

  /**
   * Cria um novo job de impressão de forma transacional e com suporte a Idempotency-Key.
   * Regra 1: PROIBIDO fallback silencioso. Falha no PostgreSQL interrompe a operação imediatamente.
   * Regra 6: Mesma chave e mesmo payload -> retorna existente. Mesma chave e payload diferente -> HTTP 409.
   */
  static async createJob(job: PrintJobDTO, idempotencyKey?: string): Promise<CreateJobResult> {
    if (pgPool) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        // Verificação de idempotência se chave fornecida
        if (idempotencyKey) {
          const existingRes = await client.query(
            `SELECT * FROM print_jobs WHERE company_id = $1 AND idempotency_key = $2 FOR UPDATE`,
            [job.companyId, idempotencyKey]
          );

          if (existingRes.rows.length > 0) {
            const existingRow = existingRes.rows[0];
            if (existingRow.checksum_sha256 === job.checksumSha256) {
              await client.query('COMMIT');
              return {
                job: mapRowToDTO(existingRow),
                idempotentReplay: true,
              };
            } else {
              await client.query('ROLLBACK');
              const err: any = new Error(
                `Conflito de idempotência: a chave '${idempotencyKey}' já foi utilizada para outro payload.`
              );
              err.statusCode = 409;
              err.code = 'IDEMPOTENCY_PAYLOAD_MISMATCH';
              throw err;
            }
          }
        }

        // Inserção atômica do job
        const insertSql = `
          INSERT INTO print_jobs (
            id, company_id, printer_id, status, language, encoding, copies, copy_strategy,
            payload, payload_base64, payload_bytes_length, checksum_sha256, attempts, max_attempts,
            idempotency_key, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
          ) RETURNING *
        `;

        const values = [
          job.id,
          job.companyId,
          job.printerId,
          job.status,
          job.language,
          job.encoding,
          job.copies,
          job.copyStrategy,
          job.payload,
          job.payloadBase64,
          job.payloadBytesLength,
          job.checksumSha256,
          job.attempts || 0,
          job.maxAttempts || 3,
          idempotencyKey || null,
          job.createdAt,
          job.updatedAt,
        ];

        const inserted = await client.query(insertSql, values);

        // Registro atômico do evento inicial
        await client.query(
          `INSERT INTO print_job_events (job_id, company_id, from_status, to_status, created_at)
           VALUES ($1, $2, NULL, $3, $4)`,
          [job.id, job.companyId, job.status, job.createdAt]
        );

        await client.query('COMMIT');
        const createdJob = mapRowToDTO(inserted.rows[0]);
        createdJob.printerName = job.printerName;
        return {
          job: createdJob,
          idempotentReplay: false,
        };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    if (isProduction) {
      throw new Error('Persistência indisponível: pool PostgreSQL não inicializado em produção.');
    }

    // Modo de testes sem PostgreSQL
    if (idempotencyKey) {
      for (const existing of testMemJobs.values()) {
        if (existing.companyId === job.companyId && existing.idempotencyKey === idempotencyKey) {
          if (existing.checksumSha256 === job.checksumSha256) {
            return { job: existing, idempotentReplay: true };
          } else {
            const err: any = new Error(
              `Conflito de idempotência: a chave '${idempotencyKey}' já foi utilizada para outro payload.`
            );
            err.statusCode = 409;
            err.code = 'IDEMPOTENCY_PAYLOAD_MISMATCH';
            throw err;
          }
        }
      }
    }

    const saved: PrintJobDTO = { ...job, idempotencyKey };
    testMemJobs.set(saved.id, saved);
    testMemEvents.push({
      id: testMemEvents.length + 1,
      jobId: saved.id,
      companyId: saved.companyId,
      fromStatus: null,
      toStatus: saved.status,
      agentId: null,
      leaseId: null,
      attemptId: null,
      executionTimeMs: null,
      error: null,
      createdAt: saved.createdAt,
    });

    return { job: saved, idempotentReplay: false };
  }

  /**
   * Reivindica atomicamente jobs pendentes para o agente com transação FOR UPDATE SKIP LOCKED.
   * Regra 4: Ownership por agentId, leaseId e attemptId.
   * Regra 5: Transações PostgreSQL e FOR UPDATE SKIP LOCKED.
   * Regra 7: Persiste transições atomicamente na mesma transação.
   */
  static async claimPendingJobsForAgent(
    companyId: string,
    agentId: string,
    limit = 10,
    leaseDurationSecs = 60
  ): Promise<PrintJobItemDTO[]> {
    if (pgPool) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        // Query atômica com SKIP LOCKED evitando contenção concorrente
        const selectSql = `
          SELECT j.*, p.name as printer_name, p.protocol as printer_protocol, p.host as printer_host,
                 p.port as printer_port, p.serial_port as printer_serial_port, p.baud_rate as printer_baud_rate,
                 p.spooler_name as printer_spooler_name
          FROM print_jobs j
          JOIN printers p ON p.id = j.printer_id AND p.company_id = j.company_id
          WHERE j.company_id = $1
            AND j.status = 'PENDING'
            AND (p.agent_id IS NULL OR p.agent_id = $2)
          ORDER BY j.created_at ASC
          LIMIT $3
          FOR UPDATE OF j SKIP LOCKED
        `;

        const res = await client.query(selectSql, [companyId, agentId, limit]);
        const claimedItems: PrintJobItemDTO[] = [];
        const now = new Date().toISOString();

        for (const row of res.rows) {
          const maxAttempts = Number(row.max_attempts || 3);
          const currentAttempts = Number(row.attempts || 0);

          if (currentAttempts >= maxAttempts) {
            // Limite de tentativas atingido: move para FAILED atomicamente
            await client.query(
              `UPDATE print_jobs
               SET status = 'FAILED', error = $1, updated_at = $2
               WHERE id = $3`,
              [`Limite máximo de tentativas (${maxAttempts}) atingido sem sucesso.`, now, row.id]
            );

            await client.query(
              `INSERT INTO print_job_events (job_id, company_id, from_status, to_status, created_at, error)
               VALUES ($1, $2, 'PENDING', 'FAILED', $3, $4)`,
              [row.id, companyId, now, `Limite máximo de tentativas atingido.`]
            );
            continue;
          }

          const leaseId = `lease-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
          const nextAttemptNumber = currentAttempts + 1;
          const attemptId = `att-${row.id}-${nextAttemptNumber}`;
          const leaseExpiresAt = new Date(Date.now() + leaseDurationSecs * 1000).toISOString();

          await client.query(
            `UPDATE print_jobs
             SET status = 'CLAIMED',
                 claimed_by_agent_id = $1,
                 lease_id = $2,
                 attempt_id = $3,
                 attempts = $4,
                 claimed_at = $5,
                 lease_expires_at = $6,
                 updated_at = $7
             WHERE id = $8`,
            [agentId, leaseId, attemptId, nextAttemptNumber, now, leaseExpiresAt, now, row.id]
          );

          await client.query(
            `INSERT INTO print_job_events (job_id, company_id, from_status, to_status, agent_id, lease_id, attempt_id, created_at)
             VALUES ($1, $2, 'PENDING', 'CLAIMED', $3, $4, $5, $6)`,
            [row.id, companyId, agentId, leaseId, attemptId, now]
          );

          claimedItems.push({
            jobId: row.id,
            leaseId,
            attemptId,
            printerId: row.printer_id,
            printerName: row.printer_name || row.printer_id,
            protocol: (row.printer_protocol || 'RAW_TCP') as TransportType,
            host: row.printer_host || undefined,
            port: row.printer_port ? Number(row.printer_port) : undefined,
            serialPort: row.printer_serial_port || undefined,
            baudRate: row.printer_baud_rate ? Number(row.printer_baud_rate) : undefined,
            spoolerName: row.printer_spooler_name || undefined,
            language: row.language,
            encoding: row.encoding,
            payload: row.payload,
            payloadBase64: row.payload_base64,
            payloadBytesLength: Number(row.payload_bytes_length),
            checksumSha256: row.checksum_sha256,
            copyStrategy: row.copy_strategy as CopyStrategy,
            copies: Number(row.copies),
          });
        }

        await client.query('COMMIT');
        return claimedItems;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    if (isProduction) {
      throw new Error('Persistência indisponível: pool PostgreSQL não inicializado em produção.');
    }

    // Modo de testes sem PostgreSQL
    const claimedItems: PrintJobItemDTO[] = [];
    const now = new Date().toISOString();

    for (const job of testMemJobs.values()) {
      if (claimedItems.length >= limit) break;
      if (job.companyId === companyId && job.status === 'PENDING') {
        const maxAttempts = job.maxAttempts || 3;
        if (job.attempts >= maxAttempts) {
          job.status = 'FAILED';
          job.error = `Limite máximo de tentativas (${maxAttempts}) atingido sem sucesso.`;
          job.updatedAt = now;
          testMemEvents.push({
            id: testMemEvents.length + 1,
            jobId: job.id,
            companyId,
            fromStatus: 'PENDING',
            toStatus: 'FAILED',
            agentId,
            leaseId: null,
            attemptId: null,
            executionTimeMs: null,
            error: job.error,
            createdAt: now,
          });
          continue;
        }

        const leaseId = `lease-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const nextAttempt = job.attempts + 1;
        const attemptId = `att-${job.id}-${nextAttempt}`;
        const leaseExpiresAt = new Date(Date.now() + leaseDurationSecs * 1000).toISOString();

        job.status = 'CLAIMED';
        job.claimedByAgentId = agentId;
        job.leaseId = leaseId;
        job.attemptId = attemptId;
        job.attempts = nextAttempt;
        job.claimedAt = now;
        job.leaseExpiresAt = leaseExpiresAt;
        job.updatedAt = now;

        testMemEvents.push({
          id: testMemEvents.length + 1,
          jobId: job.id,
          companyId,
          fromStatus: 'PENDING',
          toStatus: 'CLAIMED',
          agentId,
          leaseId,
          attemptId,
          executionTimeMs: null,
          error: null,
          createdAt: now,
        });

        claimedItems.push({
          jobId: job.id,
          leaseId,
          attemptId,
          printerId: job.printerId,
          printerName: job.printerName,
          protocol: 'RAW_TCP' as TransportType,
          language: job.language,
          encoding: job.encoding,
          payload: job.payload,
          payloadBase64: job.payloadBase64,
          payloadBytesLength: job.payloadBytesLength,
          checksumSha256: job.checksumSha256,
          copyStrategy: job.copyStrategy,
          copies: job.copies,
        });
      }
    }

    return claimedItems;
  }

  /**
   * Atualiza o status do job com validação estrita de ownership, lease, attempt e máquina de estados.
   * Regra 4: Proteção contra agentes antigos e atualizações tardias.
   * Regra 7: Evento de transição gravado atomicamente.
   * Regra 10: DELIVERED_TO_TRANSPORT é mantido como status próprio (nunca assume PRINTED).
   */
  static async updateJobStatus(
    jobId: string,
    agentId: string,
    body: UpdatePrintJobStatusDTO
  ): Promise<UpdateJobResult> {
    if (!VALID_DELIVERY_STATUSES.includes(body.status)) {
      return {
        status: 400,
        error: `Status de entrega '${body.status}' inválido.`,
        code: 'INVALID_STATUS',
      };
    }

    if (pgPool) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        const selectRes = await client.query(
          `SELECT * FROM print_jobs WHERE id = $1 FOR UPDATE`,
          [jobId]
        );

        if (selectRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return { status: 404, error: `Job '${jobId}' não encontrado.`, code: 'JOB_NOT_FOUND' };
        }

        const job = selectRes.rows[0];

        // 1. Validação do agente detentor do claim
        if (job.claimed_by_agent_id && job.claimed_by_agent_id !== agentId) {
          await client.query('ROLLBACK');
          return {
            status: 403,
            error: `Agente autenticado ('${agentId}') não é o detentor do claim do job (detentor: '${job.claimed_by_agent_id}').`,
            code: 'NOT_CLAIM_HOLDER',
          };
        }

        // 2. Validação de leaseId
        if (job.status !== 'PENDING' && job.status !== 'CANCELLED') {
          if (!body.leaseId) {
            await client.query('ROLLBACK');
            return {
              status: 400,
              error: 'Campo leaseId é obrigatório para atualização de status de jobs reivindicados.',
              code: 'LEASE_ID_REQUIRED',
            };
          }

          if (job.lease_id && body.leaseId !== job.lease_id) {
            await client.query('ROLLBACK');
            return {
              status: 409,
              error: `Lease ID mismatch: o lease '${body.leaseId}' não corresponde ao lease ativo '${job.lease_id}'.`,
              code: 'LEASE_MISMATCH',
            };
          }

          // Verificação de expiração do lease
          if (job.lease_expires_at && new Date(job.lease_expires_at).getTime() < Date.now()) {
            await client.query('ROLLBACK');
            return {
              status: 409,
              error: `Lease expirado em ${job.lease_expires_at}. O job não pode mais ser atualizado sob este lease.`,
              code: 'LEASE_EXPIRED',
            };
          }
        }

        // 3. Validação de attemptId
        const physicalAttemptStatuses: PrintJobDeliveryStatus[] = [
          'DOWNLOADED',
          'DELIVERING',
          'DELIVERED_TO_TRANSPORT',
          'PRINTED',
          'FAILED',
          'UNKNOWN_RESULT',
        ];

        if (physicalAttemptStatuses.includes(body.status)) {
          if (!body.attemptId) {
            await client.query('ROLLBACK');
            return {
              status: 400,
              error: `Campo attemptId é obrigatório para o status '${body.status}'.`,
              code: 'ATTEMPT_ID_REQUIRED',
            };
          }

          if (job.attempt_id && body.attemptId !== job.attempt_id) {
            await client.query('ROLLBACK');
            return {
              status: 409,
              error: `Attempt ID mismatch: a tentativa '${body.attemptId}' não corresponde à tentativa ativa '${job.attempt_id}'.`,
              code: 'ATTEMPT_MISMATCH',
            };
          }
        }

        // 4. Idempotência se status já é o mesmo
        if (job.status === body.status) {
          await client.query('COMMIT');
          return {
            status: 200,
            job: mapRowToDTO(job),
            idempotentReplay: true,
          };
        }

        // 5. Validação da máquina de estados
        if (!isValidStatusTransition(job.status, body.status)) {
          await client.query('ROLLBACK');
          return {
            status: 409,
            error: `Transição de estado inválida: não é permitido transicionar de '${job.status}' para '${body.status}'.`,
            code: 'INVALID_STATUS_TRANSITION',
          };
        }

        // 6. Atualização atômica
        const now = new Date().toISOString();
        let deliveredAt: string | null = job.delivered_to_transport_at ? new Date(job.delivered_to_transport_at).toISOString() : null;
        let completedAt: string | null = job.completed_at ? new Date(job.completed_at).toISOString() : null;
        let errorMsg: string | null = body.error || job.error || null;

        if (body.status === 'DELIVERED_TO_TRANSPORT') {
          deliveredAt = now;
        } else if (body.status === 'PRINTED') {
          completedAt = now;
        } else if (body.status === 'FAILED') {
          errorMsg = body.error || 'Erro durante a transmissão para a impressora.';
        } else if (body.status === 'UNKNOWN_RESULT') {
          errorMsg = body.error || 'Resultado da impressão ambíguo (queda de conexão durante o envio).';
        }

        const updateSql = `
          UPDATE print_jobs
          SET status = $1,
              updated_at = $2,
              execution_time_ms = COALESCE($3, execution_time_ms),
              delivered_to_transport_at = $4,
              completed_at = $5,
              error = $6
          WHERE id = $7
          RETURNING *
        `;

        const updatedRes = await client.query(updateSql, [
          body.status,
          now,
          body.executionTimeMs !== undefined ? body.executionTimeMs : null,
          deliveredAt,
          completedAt,
          errorMsg,
          jobId,
        ]);

        // 7. Registro do evento de transição na mesma transação
        await client.query(
          `INSERT INTO print_job_events (
            job_id, company_id, from_status, to_status, agent_id, lease_id, attempt_id,
            execution_time_ms, error, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            jobId,
            job.company_id,
            job.status,
            body.status,
            agentId,
            body.leaseId || job.lease_id,
            body.attemptId || job.attempt_id,
            body.executionTimeMs || null,
            errorMsg,
            now,
          ]
        );

        await client.query('COMMIT');
        return {
          status: 200,
          job: mapRowToDTO(updatedRes.rows[0]),
          idempotentReplay: false,
        };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    if (isProduction) {
      throw new Error('Persistência indisponível: pool PostgreSQL não inicializado em produção.');
    }

    // Modo de testes sem PostgreSQL
    const job = testMemJobs.get(jobId);
    if (!job) {
      return { status: 404, error: `Job '${jobId}' não encontrado.`, code: 'JOB_NOT_FOUND' };
    }

    if (job.claimedByAgentId && job.claimedByAgentId !== agentId) {
      return {
        status: 403,
        error: `Agente autenticado ('${agentId}') não é o detentor do claim do job (detentor: '${job.claimedByAgentId}').`,
        code: 'NOT_CLAIM_HOLDER',
      };
    }

    if (job.status !== 'PENDING' && job.status !== 'CANCELLED') {
      if (!body.leaseId) {
        return { status: 400, error: 'Campo leaseId é obrigatório.', code: 'LEASE_ID_REQUIRED' };
      }
      if (job.leaseId && body.leaseId !== job.leaseId) {
        return { status: 409, error: 'Lease ID mismatch.', code: 'LEASE_MISMATCH' };
      }
      if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < Date.now()) {
        return { status: 409, error: 'Lease expirado.', code: 'LEASE_EXPIRED' };
      }
    }

    const physicalAttemptStatuses: PrintJobDeliveryStatus[] = [
      'DOWNLOADED',
      'DELIVERING',
      'DELIVERED_TO_TRANSPORT',
      'PRINTED',
      'FAILED',
      'UNKNOWN_RESULT',
    ];

    if (physicalAttemptStatuses.includes(body.status)) {
      if (!body.attemptId) {
        return {
          status: 400,
          error: `Campo attemptId é obrigatório para o status '${body.status}'.`,
          code: 'ATTEMPT_ID_REQUIRED',
        };
      }

      if (job.attemptId && body.attemptId !== job.attemptId) {
        return {
          status: 409,
          error: `Attempt ID mismatch: a tentativa '${body.attemptId}' não corresponde à tentativa ativa '${job.attemptId}'.`,
          code: 'ATTEMPT_MISMATCH',
        };
      }
    }

    if (job.status === body.status) {
      return { status: 200, job, idempotentReplay: true };
    }

    if (!isValidStatusTransition(job.status, body.status)) {
      return {
        status: 409,
        error: `Transição inválida de '${job.status}' para '${body.status}'.`,
        code: 'INVALID_STATUS_TRANSITION',
      };
    }

    const now = new Date().toISOString();
    const fromStatus = job.status;
    job.status = body.status;
    job.updatedAt = now;
    if (body.executionTimeMs !== undefined) job.executionTimeMs = body.executionTimeMs;
    if (body.status === 'DELIVERED_TO_TRANSPORT') job.deliveredToTransportAt = now;
    if (body.status === 'PRINTED') job.completedAt = now;
    if (body.error) job.error = body.error;

    testMemEvents.push({
      id: testMemEvents.length + 1,
      jobId,
      companyId: job.companyId,
      fromStatus,
      toStatus: body.status,
      agentId,
      leaseId: body.leaseId || job.leaseId || null,
      attemptId: body.attemptId || job.attemptId || null,
      executionTimeMs: body.executionTimeMs || null,
      error: body.error || null,
      createdAt: now,
    });

    return { status: 200, job, idempotentReplay: false };
  }

  /**
   * Sweeper / Reaper de leases expirados.
   * Regra 2: PROIBIDA reimpressão automática quando houver possibilidade de bytes já enviados.
   * Regra 3: Lease expirado não comprova ausência de envio. Exigir evidência positiva de não envio antes de retornar um job para PENDING.
   * Consequência: Jobs em DELIVERING com lease expirado vão para UNKNOWN_RESULT.
   * Jobs em CLAIMED/DOWNLOADED com lease expirado vão para EXPIRED_LEASE (não PENDING direto sem prova).
   */
  static async reapExpiredLeases(): Promise<{ reaped: number; unknownResultCount: number; expiredCount: number }> {
    let reaped = 0;
    let unknownResultCount = 0;
    let expiredCount = 0;

    if (pgPool) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        const selectSql = `
          SELECT * FROM print_jobs
          WHERE status IN ('CLAIMED', 'DOWNLOADED', 'DELIVERING')
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at < NOW()
          FOR UPDATE SKIP LOCKED
        `;

        const res = await client.query(selectSql);
        const now = new Date().toISOString();

        for (const job of res.rows) {
          reaped++;
          const fromStatus = job.status;

          if (fromStatus === 'DELIVERING') {
            // Regra 2 & 3: Bytes podem ter sido transferidos. Não pode voltar a PENDING.
            unknownResultCount++;
            await client.query(
              `UPDATE print_jobs
               SET status = 'UNKNOWN_RESULT',
                   error = 'Lease expirado durante transmissão física. Resultado ambíguo para prevenir duplicação de etiquetas.',
                   updated_at = $1
               WHERE id = $2`,
              [now, job.id]
            );

            await client.query(
              `INSERT INTO print_job_events (job_id, company_id, from_status, to_status, agent_id, lease_id, attempt_id, created_at, error)
               VALUES ($1, $2, $3, 'UNKNOWN_RESULT', $4, $5, $6, $7, $8)`,
              [job.id, job.company_id, fromStatus, job.claimed_by_agent_id, job.lease_id, job.attempt_id, now, 'Lease expirado em DELIVERING.']
            );
          } else {
            // CLAIMED ou DOWNLOADED: sem comprovação positiva de não-envio, move para EXPIRED_LEASE
            expiredCount++;
            await client.query(
              `UPDATE print_jobs
               SET status = 'EXPIRED_LEASE',
                   error = 'Lease expirado sem conclusão da entrega pelo agente.',
                   updated_at = $1
               WHERE id = $2`,
              [now, job.id]
            );

            await client.query(
              `INSERT INTO print_job_events (job_id, company_id, from_status, to_status, agent_id, lease_id, attempt_id, created_at, error)
               VALUES ($1, $2, $3, 'EXPIRED_LEASE', $4, $5, $6, $7, $8)`,
              [job.id, job.company_id, fromStatus, job.claimed_by_agent_id, job.lease_id, job.attempt_id, now, 'Lease expirado em ' + fromStatus]
            );
          }
        }

        await client.query('COMMIT');
        return { reaped, unknownResultCount, expiredCount };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    if (isProduction) {
      throw new Error('Persistência indisponível: pool PostgreSQL não inicializado em produção.');
    }

    // Modo de testes sem PostgreSQL
    const now = new Date().toISOString();
    for (const job of testMemJobs.values()) {
      if (['CLAIMED', 'DOWNLOADED', 'DELIVERING'].includes(job.status)) {
        if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < Date.now()) {
          reaped++;
          const fromStatus = job.status;
          if (fromStatus === 'DELIVERING') {
            unknownResultCount++;
            job.status = 'UNKNOWN_RESULT';
            job.error = 'Lease expirado durante transmissão física. Resultado ambíguo para prevenir duplicação de etiquetas.';
          } else {
            expiredCount++;
            job.status = 'EXPIRED_LEASE';
            job.error = 'Lease expirado sem conclusão da entrega pelo agente.';
          }
          job.updatedAt = now;
          testMemEvents.push({
            id: testMemEvents.length + 1,
            jobId: job.id,
            companyId: job.companyId,
            fromStatus,
            toStatus: job.status,
            agentId: job.claimedByAgentId || null,
            leaseId: job.leaseId || null,
            attemptId: job.attemptId || null,
            executionTimeMs: null,
            error: job.error,
            createdAt: now,
          });
        }
      }
    }

    return { reaped, unknownResultCount, expiredCount };
  }

  /**
   * Retorna um job para PENDING somente com EVIDÊNCIA POSITIVA de que nenhum byte foi transmitido.
   * Regra 3: Exigir evidência positiva de não envio antes de retornar um job para PENDING.
   */
  static async recoverToPendingWithPositiveEvidence(
    companyId: string,
    jobId: string,
    evidenceReason: string
  ): Promise<PrintJobDTO> {
    if (!evidenceReason || evidenceReason.trim().length < 5) {
      throw new Error('Evidência positiva de não envio é obrigatória e deve ser fundamentada.');
    }

    if (pgPool) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        const selectRes = await client.query(
          `SELECT * FROM print_jobs WHERE id = $1 AND company_id = $2 FOR UPDATE`,
          [jobId, companyId]
        );

        if (selectRes.rows.length === 0) {
          await client.query('ROLLBACK');
          throw new Error(`Job '${jobId}' não encontrado para o tenant.`);
        }

        const job = selectRes.rows[0];
        const allowedSources: PrintJobDeliveryStatus[] = ['EXPIRED_LEASE', 'FAILED'];

        if (!allowedSources.includes(job.status)) {
          await client.query('ROLLBACK');
          throw new Error(
            `Job com status '${job.status}' não pode ser reconduzido a PENDING. Apenas status comprovadamente sem envio (${allowedSources.join(', ')}) são elegíveis.`
          );
        }

        const now = new Date().toISOString();
        const updateRes = await client.query(
          `UPDATE print_jobs
           SET status = 'PENDING',
               lease_id = NULL,
               claimed_by_agent_id = NULL,
               claimed_at = NULL,
               lease_expires_at = NULL,
               attempt_id = NULL,
               error = $1,
               updated_at = $2
           WHERE id = $3
           RETURNING *`,
          [`Reconduzido a PENDING sob evidência positiva: ${evidenceReason}`, now, jobId]
        );

        await client.query(
          `INSERT INTO print_job_events (job_id, company_id, from_status, to_status, created_at, error)
           VALUES ($1, $2, $3, 'PENDING', $4, $5)`,
          [jobId, companyId, job.status, now, `Recuperado sob evidência positiva: ${evidenceReason}`]
        );

        await client.query('COMMIT');
        return mapRowToDTO(updateRes.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    if (isProduction) {
      throw new Error('Persistência indisponível: pool PostgreSQL não inicializado em produção.');
    }

    const job = testMemJobs.get(jobId);
    if (!job || job.companyId !== companyId) {
      throw new Error(`Job '${jobId}' não encontrado.`);
    }

    const fromStatus = job.status;
    const now = new Date().toISOString();
    job.status = 'PENDING';
    job.leaseId = undefined;
    job.claimedByAgentId = undefined;
    job.claimedAt = undefined;
    job.leaseExpiresAt = undefined;
    job.attemptId = undefined;
    job.error = `Reconduzido a PENDING sob evidência positiva: ${evidenceReason}`;
    job.updatedAt = now;

    testMemEvents.push({
      id: testMemEvents.length + 1,
      jobId,
      companyId,
      fromStatus,
      toStatus: 'PENDING',
      agentId: null,
      leaseId: null,
      attemptId: null,
      executionTimeMs: null,
      error: job.error,
      createdAt: now,
    });

    return job;
  }

  /**
   * Busca um job por ID com isolamento multi-tenant estrito
   */
  static async findById(companyId: string, id: string): Promise<PrintJobDTO | null> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT j.*, p.name as printer_name
         FROM print_jobs j
         LEFT JOIN printers p ON p.id = j.printer_id AND p.company_id = j.company_id
         WHERE j.company_id = $1 AND j.id = $2`,
        [companyId, id]
      );
      if (res.rows.length === 0) return null;
      return mapRowToDTO(res.rows[0]);
    }

    if (isProduction) {
      throw new Error('Persistência indisponível: pool PostgreSQL não inicializado em produção.');
    }

    const job = testMemJobs.get(id);
    if (!job || (companyId !== '*' && job.companyId !== companyId)) return null;
    return job;
  }

  /**
   * Lista histórico de jobs filtrado por tenant
   */
  static async listByCompany(companyId: string, limit = 100): Promise<PrintJobDTO[]> {
    if (pgPool) {
      let sql = `
        SELECT j.*, p.name as printer_name
        FROM print_jobs j
        LEFT JOIN printers p ON p.id = j.printer_id AND p.company_id = j.company_id
      `;
      const params: any[] = [];

      if (companyId !== '*') {
        sql += ` WHERE j.company_id = $1`;
        params.push(companyId);
      }

      sql += ` ORDER BY j.created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const res = await pgPool.query(sql, params);
      return res.rows.map(mapRowToDTO);
    }

    if (isProduction) {
      throw new Error('Persistência indisponível: pool PostgreSQL não inicializado em produção.');
    }

    let jobs = Array.from(testMemJobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (companyId !== '*') {
      jobs = jobs.filter((j) => j.companyId === companyId);
    }

    return jobs.slice(0, limit);
  }

  /**
   * Lista a trilha imutável de eventos de auditoria de um job
   */
  static async getEventsForJob(companyId: string, jobId: string): Promise<PrintJobEventDTO[]> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT * FROM print_job_events
         WHERE company_id = $1 AND job_id = $2
         ORDER BY created_at ASC`,
        [companyId, jobId]
      );
      return res.rows.map(mapRowToEventDTO);
    }

    if (isProduction) {
      throw new Error('Persistência indisponível: pool PostgreSQL não inicializado em produção.');
    }

    return testMemEvents.filter((e) => (companyId === '*' || e.companyId === companyId) && e.jobId === jobId);
  }
}
