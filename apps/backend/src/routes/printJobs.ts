import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import {
  encodePayload,
  type PrintJobDTO,
  type CreatePrintJobDTO,
  type PrintJobItemDTO,
  type UpdatePrintJobStatusDTO,
  type PrintJobDeliveryStatus,
  type CopyStrategy,
  type BatchPrintRequestDTO,
  type PrintJobBatchDTO,
  type PrintJobBatchItemDTO,
  type PrintJobBatchStatus,
} from '@witiquetas/contracts';
import { type LabelDocument, LabelDocumentSchema } from '@witiquetas/label-schema';
import { compilerRegistry, type PrinterLanguage } from '@witiquetas/printer-core';
import { templateRepository } from '../repositories/templateRepository.js';
import { printersStore } from './printers.js';
import {
  agentsStore,
  hashToken,
  authenticateAgent,
  authenticateWebUser,
  type AgentRecord,
  type AuthWebUser,
} from './agents.js';

// Compiladores PPLA e PPLB
import '@witiquetas/printer-ppla';
import '@witiquetas/printer-pplb';

const router = Router();

export const DEFAULT_PRINT_JOB_MAX_ATTEMPTS = 3;

import {
  PrintJobRepository,
  testMemJobs,
  VALID_DELIVERY_STATUSES,
  isValidStatusTransition,
} from '../repositories/printJobRepository.js';

export { VALID_DELIVERY_STATUSES, isValidStatusTransition };

const printJobsStore = testMemJobs;

export function detectCopyStrategy(payload: string, language: string): CopyStrategy {
  const normLang = (language || 'PPLB').toUpperCase();
  if (normLang === 'PPLB') {
    const hasPplbCopies = /^P(\d+|\[\[.*\]\])/m.test(payload);
    return hasPplbCopies ? 'EMBEDDED_IN_PAYLOAD' : 'TRANSPORT_REPEAT';
  }
  if (normLang === 'ZPL') {
    const hasZplCopies = /(\^PQ|~PQ)\d+/m.test(payload);
    return hasZplCopies ? 'EMBEDDED_IN_PAYLOAD' : 'TRANSPORT_REPEAT';
  }
  if (normLang === 'PPLA') {
    const hasPplaCopies = /^Q\d+/m.test(payload);
    return hasPplaCopies ? 'EMBEDDED_IN_PAYLOAD' : 'TRANSPORT_REPEAT';
  }
  return 'TRANSPORT_REPEAT';
}

// 1. Criar novo Job de Impressão (Exclusivo Web/Admin / ERP Autenticado — Agents NÃO podem criar jobs)
router.post('/', authenticateWebUser, async (req: Request, res: Response) => {
  const user = (req as any).user as AuthWebUser;
  const authCompanyId = user.companyId;

  const body = req.body as CreatePrintJobDTO;

  if (!body.printerId) {
    return res.status(400).json({ error: 'ID da impressora (printerId) é obrigatório.' });
  }

  const printer = printersStore.get(body.printerId);
  if (!printer) {
    return res.status(404).json({ error: `Impressora '${body.printerId}' não encontrada.` });
  }

  // Validação de isolamento de tenant
  if (authCompanyId && authCompanyId !== '*' && printer.companyId !== authCompanyId) {
    return res.status(403).json({
      error: `Não autorizado a enviar jobs para impressora da empresa '${printer.companyId}'. Seu escopo autorizado é '${authCompanyId}'.`,
    });
  }

  // Validação estrita de transporte de hardware para RAW_TCP
  if (printer.protocol === 'RAW_TCP') {
    const host = printer.host?.trim();
    if (!host) {
      return res.status(400).json({
        error: `Impressora '${printer.name}' (${printer.id}) não possui Host/IP configurado para o protocolo RAW TCP.`,
      });
    }
    if (!printer.port) {
      printer.port = 9100;
    }
  }

  let finalPayload = body.compiledCommand || '';
  let encoding = body.encoding || 'windows-1252';
  const targetLanguage = (body.language || printer.language || 'PPLB') as PrinterLanguage;

  // Se o documento abstrato foi enviado, compilar no backend
  if (body.document) {
    const docValidation = LabelDocumentSchema.safeParse(body.document);
    if (!docValidation.success) {
      return res.status(400).json({
        error: 'Estrutura de LabelDocument inválida para compilação.',
        details: docValidation.error.format(),
      });
    }

    const compiler = compilerRegistry.get(targetLanguage);
    if (!compiler) {
      return res.status(400).json({
        error: `Compilador para a linguagem '${targetLanguage}' não suportado.`,
      });
    }

    const validation = compiler.validate(body.document as LabelDocument);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Falha na validação do layout.',
        errors: validation.errors,
      });
    }

    const compiled = compiler.compile(body.document as LabelDocument, body.data || {});
    finalPayload = compiled.command;
    encoding = compiled.encoding;
  }

  if (!finalPayload) {
    return res.status(400).json({ error: 'Nenhum comando ou documento foi fornecido para impressão.' });
  }

  // Codificação exata de bytes usando o utilitário centralizado
  const payloadBytes = encodePayload(finalPayload, encoding);
  const payloadBuffer = Buffer.from(payloadBytes.buffer, payloadBytes.byteOffset, payloadBytes.byteLength);
  const payloadBytesLength = payloadBuffer.length;
  const checksumSha256 = crypto.createHash('sha256').update(payloadBuffer).digest('hex');
  const payloadBase64 = payloadBuffer.toString('base64');

  // CopyStrategy: análise específica da linguagem
  const copyStrategy = detectCopyStrategy(finalPayload, targetLanguage);

  const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const idempotencyKey = (req.headers['idempotency-key'] as string) || (body as any)?.idempotencyKey;

  const newJob: PrintJobDTO = {
    id: jobId,
    companyId: printer.companyId,
    printerId: printer.id,
    printerName: printer.name,
    status: 'PENDING',
    language: targetLanguage,
    encoding,
    copies: body.copies || 1,
    copyStrategy,
    payload: finalPayload,
    payloadBase64,
    payloadBytesLength,
    checksumSha256,
    attempts: 0,
    maxAttempts: DEFAULT_PRINT_JOB_MAX_ATTEMPTS,
    idempotencyKey: idempotencyKey || undefined,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await PrintJobRepository.createJob(newJob, idempotencyKey);
    if (result.idempotentReplay) {
      return res.status(200).json({
        success: true,
        job: result.job,
        idempotentReplay: true,
        message: `Job de impressão '${result.job.id}' recuperado via Idempotency-Key.`,
      });
    }

    return res.status(201).json({
      success: true,
      job: result.job,
      message: `Job de impressão '${result.job.id}' enfileirado com sucesso para a impressora '${printer.name}'.`,
    });
  } catch (err: any) {
    if (err?.code === 'IDEMPOTENCY_PAYLOAD_MISMATCH' || err?.statusCode === 409) {
      return res.status(409).json({
        error: err.message,
        code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
      });
    }
    console.error('[PrintJobs] Erro transacional ao criar job:', err);
    return res.status(500).json({
      error: 'Falha de persistência transacional no PostgreSQL ao salvar o job de impressão.',
      code: 'PERSISTENCE_ERROR',
    });
  }
});

// 2. Função Centralizada de Claim de Jobs Pendentes para o Agente Autenticado
/**
 * NOTA TÉCNICA DO PROTOCOLO V1:
 * O claim de jobs pendentes é realizado durante a requisição GET /pending para manter retrocompatibilidade
 * do ciclo de vida de transição atômica (PENDING -> CLAIMED). A evolução para POST /claim explícito
 * está documentada no roadmap para versões futuras.
 */
export function claimPendingJobsForAgent(agent: AgentRecord): PrintJobItemDTO[] {
  const pendingJobs: PrintJobItemDTO[] = [];
  const now = new Date().toISOString();

  printJobsStore.forEach((job) => {
    // A. Filtro estrito de tenant (empresa / filial)
    if (job.status === 'PENDING' && job.companyId === agent.companyId) {
      // B. Proteção contra loops infinitos: não permitir claim se excedeu maxAttempts
      const maxAttempts = job.maxAttempts || DEFAULT_PRINT_JOB_MAX_ATTEMPTS;
      if (job.attempts >= maxAttempts) {
        job.status = 'FAILED';
        job.error = `Limite máximo de tentativas (${maxAttempts}) atingido sem sucesso.`;
        job.updatedAt = now;
        return;
      }

      // C. Validar se a impressora pertence à empresa e se está atribuída a este agente
      const printer = printersStore.get(job.printerId);
      if (printer && (!printer.agentId || printer.agentId === agent.id)) {
        const leaseId = `lease-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const attemptNumber = job.attempts + 1;
        const attemptId = `att-${job.id}-${attemptNumber}`;

        // Transição atômica para CLAIMED sob o novo lease
        job.status = 'CLAIMED';
        job.claimedByAgentId = agent.id;
        job.leaseId = leaseId;
        job.attemptId = attemptId;
        job.attempts = attemptNumber; // Incrementa attempts uma única vez no início da nova tentativa!
        job.claimedAt = now;
        job.leaseExpiresAt = new Date(Date.now() + 60000).toISOString(); // Validade do lease: 60 segundos
        job.updatedAt = now;

        pendingJobs.push({
          jobId: job.id,
          leaseId,
          attemptId,
          printerId: printer.id,
          printerName: printer.name,
          protocol: printer.protocol,
          host: printer.host,
          port: printer.port,
          serialPort: printer.serialPort,
          baudRate: printer.baudRate,
          spoolerName: printer.spoolerName,
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
  });

  return pendingJobs;
}

// 2. Buscar Jobs Pendentes (Consumido pelo Agente Local Obrigatoriamente Autenticado)
router.get('/pending', authenticateAgent, async (req: Request, res: Response) => {
  const agent = (req as any).agent as AgentRecord;
  if (!agent) {
    return res.status(401).json({ error: 'Agente não autenticado.' });
  }

  try {
    const jobs = await PrintJobRepository.claimPendingJobsForAgent(agent.companyId, agent.id);
    return res.json({
      total: jobs.length,
      jobs,
    });
  } catch (err: any) {
    console.error('[PrintJobs] Erro transacional no claim de jobs:', err);
    return res.status(500).json({
      error: 'Falha transacional ao buscar jobs pendentes.',
      code: 'CLAIM_TRANSACTION_ERROR',
    });
  }
});

// 3. Atualizar Status do Job (Reportado pelo Agente Local Obrigatoriamente Autenticado)
router.patch('/:id/status', authenticateAgent, async (req: Request, res: Response) => {
  const agent = (req as any).agent as AgentRecord;
  const body = req.body as UpdatePrintJobStatusDTO;

  if (!body.status) {
    return res.status(400).json({ error: 'Campo status é obrigatório.' });
  }

  if (body.agentId && body.agentId !== agent.id) {
    return res.status(403).json({
      error: `Inconsistência no body: agentId ('${body.agentId}') difere do agente autenticado ('${agent.id}').`,
    });
  }

  try {
    const result = await PrintJobRepository.updateJobStatus(req.params.id, agent.id, body);
    if (result.status !== 200) {
      return res.status(result.status).json({
        error: result.error,
        code: result.code,
      });
    }

    return res.json({
      success: true,
      job: result.job,
      idempotentReplay: result.idempotentReplay,
    });
  } catch (err: any) {
    console.error('[PrintJobs] Erro ao atualizar status do job:', err);
    return res.status(500).json({
      error: 'Falha ao persistir transição de status no PostgreSQL.',
      code: 'STATUS_PERSISTENCE_ERROR',
    });
  }
});

// 4. Listar Histórico de Jobs (Exclusivo Web/Admin e Filtrado por Tenant)
router.get('/', authenticateWebUser, async (req: Request, res: Response) => {
  const user = (req as any).user as AuthWebUser;
  const authCompanyId = user.companyId || '*';

  try {
    const jobs = await PrintJobRepository.listByCompany(authCompanyId, 100);
    return res.json({
      total: jobs.length,
      jobs,
    });
  } catch (err: any) {
    console.error('[PrintJobs] Erro ao listar jobs:', err);
    return res.status(500).json({ error: 'Falha ao consultar fila de impressão.', code: 'QUERY_ERROR' });
  }
});

// 4.1. Trilha Imutável de Eventos de Auditoria do Job
router.get('/:id/events', authenticateWebUser, async (req: Request, res: Response) => {
  const user = (req as any).user as AuthWebUser;
  const authCompanyId = user.companyId || '*';

  try {
    const events = await PrintJobRepository.getEventsForJob(authCompanyId, req.params.id);
    return res.json({
      total: events.length,
      events,
    });
  } catch (err: any) {
    console.error('[PrintJobs] Erro ao consultar eventos do job:', err);
    return res.status(500).json({ error: 'Falha ao consultar auditoria de eventos.', code: 'AUDIT_QUERY_ERROR' });
  }
});

// 4.2. Recuperação Segura para PENDING com Evidência Positiva de Não Envio (Regra 3)
router.post('/:id/recover-pending', authenticateWebUser, async (req: Request, res: Response) => {
  const user = (req as any).user as AuthWebUser;
  const authCompanyId = user.companyId;
  const evidenceReason = req.body?.evidenceReason;

  if (!evidenceReason || typeof evidenceReason !== 'string' || evidenceReason.trim().length < 5) {
    return res.status(400).json({
      error: 'Evidência positiva fundamentada de não envio é obrigatória para recondução a PENDING.',
      code: 'POSITIVE_EVIDENCE_REQUIRED',
    });
  }

  try {
    const job = await PrintJobRepository.recoverToPendingWithPositiveEvidence(
      authCompanyId || '*',
      req.params.id,
      evidenceReason
    );
    return res.json({
      success: true,
      job,
      message: `Job '${job.id}' recuperado para PENDING sob evidência positiva.`,
    });
  } catch (err: any) {
    return res.status(400).json({
      error: err.message,
      code: 'RECOVERY_NOT_ALLOWED',
    });
  }
});

export const printJobBatchesStore = new Map<string, PrintJobBatchDTO>();
export const printJobBatchItemsStore = new Map<string, PrintJobBatchItemDTO[]>();

export function deriveBatchStatus(items: PrintJobBatchItemDTO[]): PrintJobBatchStatus {
  if (!items || items.length === 0) return 'QUEUED';

  let completedCount = 0;
  let failedCount = 0;
  let activeCount = 0;

  for (const item of items) {
    if (item.status === 'PRINTED' || item.status === 'DELIVERED_TO_TRANSPORT') {
      completedCount++;
    } else if (item.status === 'FAILED' || item.status === 'CANCELLED' || item.status === 'EXPIRED_LEASE') {
      failedCount++;
    } else if (item.status === 'CLAIMED' || item.status === 'DOWNLOADED' || item.status === 'DELIVERING') {
      activeCount++;
    }
  }

  if (completedCount === items.length) return 'COMPLETED';
  if (failedCount === items.length) return 'FAILED';
  if (completedCount > 0 && (failedCount > 0 || activeCount > 0)) return 'PARTIAL';
  if (activeCount > 0 || (completedCount > 0 && completedCount < items.length)) return 'PROCESSING';
  return 'QUEUED';
}

// 5. POST /api/print-jobs/batch — Envio de Impressão em Lote
router.post('/batch', authenticateWebUser, async (req: Request, res: Response) => {
  const user = (req as any).user as AuthWebUser;
  const authCompanyId = user.companyId;

  const body = req.body as BatchPrintRequestDTO;

  if (!body.templateId) {
    return res.status(400).json({ error: 'ID do modelo (templateId) é obrigatório.', code: 'MODEL_NOT_FOUND' });
  }

  if (!body.printerId) {
    return res.status(400).json({ error: 'ID da impressora (printerId) é obrigatório.', code: 'PRINTER_NOT_FOUND' });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({ error: 'Nenhum registro foi selecionado para impressão.', code: 'NO_RECORDS_SELECTED' });
  }

  // Validar modelo pertencente ao tenant
  const template = await templateRepository.getTemplateById(body.templateId, authCompanyId || 'comp-default');
  if (!template) {
    return res.status(404).json({ error: `Modelo de etiqueta '${body.templateId}' não encontrado.`, code: 'MODEL_NOT_FOUND' });
  }

  // Validar impressora pertencente ao tenant
  const printer = printersStore.get(body.printerId);
  if (!printer) {
    return res.status(404).json({ error: `Impressora '${body.printerId}' não encontrada.`, code: 'PRINTER_NOT_FOUND' });
  }

  if (authCompanyId && authCompanyId !== '*' && printer.companyId !== authCompanyId) {
    return res.status(403).json({
      error: `Não autorizado a utilizar a impressora da empresa '${printer.companyId}'.`,
      code: 'FORBIDDEN_TENANT',
    });
  }

  // Validar Agente / Hardware da impressora
  if (printer.agentId) {
    const agent = agentsStore.get(printer.agentId);
    if (!agent || agent.status !== 'ONLINE') {
      return res.status(400).json({
        error: `O Agente de impressão '${printer.agentId}' associado à impressora '${printer.name}' está offline ou indisponível.`,
        code: 'AGENT_OFFLINE',
      });
    }
  } else if (printer.protocol === 'RAW_TCP' && !printer.host?.trim()) {
    return res.status(400).json({
      error: `Impressora '${printer.name}' não possui Host/IP válido configurado.`,
      code: 'PRINTER_OFFLINE',
    });
  }

  // Validar quantidades
  for (const item of body.items) {
    const q = Number(item.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 999) {
      return res.status(400).json({
        error: `Quantidade inválida (${item.quantity}) para o registro '${item.sourceRecordId}'. A quantidade deve ser um número inteiro entre 1 e 999.`,
        code: 'INVALID_QUANTITY',
      });
    }
  }

  const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const targetLanguage = (printer.language || 'PPLB') as PrinterLanguage;
  const compiler = compilerRegistry.get(targetLanguage);

  if (!compiler) {
    return res.status(400).json({
      error: `Compilador para a linguagem '${targetLanguage}' não suportado.`,
      code: 'COMPILER_UNSUPPORTED',
    });
  }

  const batchItems: PrintJobBatchItemDTO[] = [];
  let totalLabels = 0;

  for (const item of body.items) {
    const qty = Number(item.quantity);
    totalLabels += qty;

    const recordData = (item.data || {}) as Record<string, string>;
    const compiled = compiler.compile(template.document as LabelDocument, recordData);
    const finalPayload = compiled.command;
    const encoding = compiled.encoding;

    const payloadBytes = encodePayload(finalPayload, encoding);
    const payloadBuffer = Buffer.from(payloadBytes.buffer, payloadBytes.byteOffset, payloadBytes.byteLength);
    const payloadBytesLength = payloadBuffer.length;
    const checksumSha256 = crypto.createHash('sha256').update(payloadBuffer).digest('hex');
    const payloadBase64 = payloadBuffer.toString('base64');
    const copyStrategy = detectCopyStrategy(finalPayload, targetLanguage);

    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const newJob: PrintJobDTO = {
      id: jobId,
      companyId: printer.companyId,
      printerId: printer.id,
      printerName: printer.name,
      status: 'PENDING',
      language: targetLanguage,
      encoding,
      copies: qty,
      copyStrategy,
      payload: finalPayload,
      payloadBase64,
      payloadBytesLength,
      checksumSha256,
      attempts: 0,
      maxAttempts: DEFAULT_PRINT_JOB_MAX_ATTEMPTS,
      createdAt: now,
      updatedAt: now,
    };

    printJobsStore.set(jobId, newJob);

    const batchItem: PrintJobBatchItemDTO = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      batchId,
      printJobId: jobId,
      sourceRecordId: item.sourceRecordId || 'record-1',
      resolvedData: recordData,
      quantity: qty,
      status: 'PENDING',
    };

    batchItems.push(batchItem);
  }

  const batchDto: PrintJobBatchDTO = {
    id: batchId,
    companyId: printer.companyId,
    templateId: template.id,
    printerId: printer.id,
    status: 'QUEUED',
    totalRecords: body.items.length,
    totalLabels,
    completedJobs: 0,
    failedJobs: 0,
    createdAt: now,
    items: batchItems,
  };

  printJobBatchesStore.set(batchId, batchDto);
  printJobBatchItemsStore.set(batchId, batchItems);

  res.status(201).json({
    success: true,
    batch: batchDto,
    items: batchItems,
    message: `Lote de impressão '${batchId}' criado com sucesso com ${body.items.length} registros (${totalLabels} etiquetas).`,
  });
});

// 6. GET /api/print-jobs/batch/:id — Consulta e Acompanhamento de Lote
router.get('/batch/:id', authenticateWebUser, (req: Request, res: Response) => {
  const user = (req as any).user as AuthWebUser;
  const authCompanyId = user.companyId;
  const batchId = req.params.id;

  const batch = printJobBatchesStore.get(batchId);
  if (!batch) {
    return res.status(404).json({ error: `Lote de impressão '${batchId}' não encontrado.`, code: 'BATCH_NOT_FOUND' });
  }

  if (authCompanyId && authCompanyId !== '*' && batch.companyId !== authCompanyId) {
    return res.status(403).json({ error: 'Não autorizado a consultar lote de outro tenant.', code: 'FORBIDDEN_TENANT' });
  }

  const items = printJobBatchItemsStore.get(batchId) || batch.items || [];
  let queued = 0;
  let processing = 0;
  let completed = 0;
  let failed = 0;

  for (const item of items) {
    if (item.printJobId) {
      const childJob = printJobsStore.get(item.printJobId);
      if (childJob) {
        item.status = childJob.status;
        item.error = childJob.error;
      }
    }

    if (item.status === 'PRINTED' || item.status === 'DELIVERED_TO_TRANSPORT') {
      completed++;
    } else if (item.status === 'FAILED' || item.status === 'CANCELLED' || item.status === 'EXPIRED_LEASE') {
      failed++;
    } else if (item.status === 'CLAIMED' || item.status === 'DOWNLOADED' || item.status === 'DELIVERING') {
      processing++;
    } else {
      queued++;
    }
  }

  batch.completedJobs = completed;
  batch.failedJobs = failed;
  batch.status = deriveBatchStatus(items);
  if (batch.status === 'COMPLETED' || batch.status === 'FAILED' || batch.status === 'PARTIAL') {
    if (!batch.finishedAt) {
      batch.finishedAt = new Date().toISOString();
    }
  }

  res.json({
    success: true,
    batch,
    items,
    summary: {
      totalRecords: batch.totalRecords,
      totalLabels: batch.totalLabels,
      queued,
      processing,
      completed,
      failed,
    },
  });
});

export { printJobsStore };
export default router;


