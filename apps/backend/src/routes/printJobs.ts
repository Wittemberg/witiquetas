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
} from '@witiquetas/contracts';
import { type LabelDocument, LabelDocumentSchema } from '@witiquetas/label-schema';
import { compilerRegistry, type PrinterLanguage } from '@witiquetas/printer-core';
import { printersStore } from './printers.js';
import { agentsStore, hashToken } from './agents.js';

// Compiladores PPLA e PPLB
import '@witiquetas/printer-ppla';
import '@witiquetas/printer-pplb';

const router = Router();

export const DEFAULT_PRINT_JOB_MAX_ATTEMPTS = 3;

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

const printJobsStore = new Map<string, PrintJobDTO>();

// 1. Criar novo Job de Impressão
router.post('/', (req: Request, res: Response) => {
  const body = req.body as CreatePrintJobDTO;

  if (!body.printerId) {
    return res.status(400).json({ error: 'ID da impressora (printerId) é obrigatório.' });
  }

  const printer = printersStore.get(body.printerId);
  if (!printer) {
    return res.status(404).json({ error: `Impressora '${body.printerId}' não encontrada.` });
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
    createdAt: now,
    updatedAt: now,
  };

  printJobsStore.set(jobId, newJob);

  res.status(201).json({
    success: true,
    job: newJob,
    message: `Job de impressão '${jobId}' enfileirado com sucesso para a impressora '${printer.name}'.`,
  });
});

// 2. Buscar Jobs Pendentes (Consumido pelo Agente Local Autenticado)
router.get('/pending', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || (req.headers['x-agent-token'] as string);
  const agentIdHeader = (req.headers['x-agent-id'] as string) || (req.query.agentId as string);

  let agent = (req as any).agent;
  if (!agent && authHeader) {
    const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const tokenHash = hashToken(rawToken);
    agent = Array.from(agentsStore.values()).find((a) => a.tokenHash === tokenHash);
  } else if (!agent && agentIdHeader) {
    agent = agentsStore.get(agentIdHeader);
  }

  if (!agent) {
    return res.status(401).json({ error: 'Agente não autenticado ou token inválido para reivindicar jobs.' });
  }

  const pendingJobs: PrintJobItemDTO[] = [];
  const now = new Date().toISOString();

  printJobsStore.forEach((job) => {
    // Escopo multi-tenant: apenas jobs da mesma empresa/filial
    if (job.status === 'PENDING' && job.companyId === agent.companyId) {
      const printer = printersStore.get(job.printerId);
      // Validar se a impressora pertence à empresa e, se vinculado a um agente específico, ao agente chamador
      if (printer && (!printer.agentId || printer.agentId === agent.id)) {
        const leaseId = `lease-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const attemptNumber = job.attempts + 1;
        const attemptId = `att-${job.id}-${attemptNumber}`;

        // Transição atômica para CLAIMED sob o novo lease
        job.status = 'CLAIMED';
        job.claimedByAgentId = agent.id;
        job.leaseId = leaseId;
        job.attemptId = attemptId;
        job.attempts = attemptNumber; // Incrementa attempts uma única vez no início da tentativa!
        job.claimedAt = now;
        job.leaseExpiresAt = new Date(Date.now() + 60000).toISOString();
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

  res.json({
    total: pendingJobs.length,
    jobs: pendingJobs,
  });
});

// 3. Atualizar Status do Job (Reportado pelo Agente Local)
router.patch('/:id/status', (req: Request, res: Response) => {
  const job = printJobsStore.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: `Job de impressão '${req.params.id}' não encontrado.` });
  }

  const body = req.body as UpdatePrintJobStatusDTO;
  if (!body.status) {
    return res.status(400).json({ error: 'Campo status é obrigatório.' });
  }

  // Validação em runtime de status válido
  if (!VALID_DELIVERY_STATUSES.includes(body.status)) {
    return res.status(400).json({
      error: `Status de entrega '${body.status}' inválido.`,
      allowedStatuses: VALID_DELIVERY_STATUSES,
    });
  }

  // Validação de leaseId
  if (body.leaseId && job.leaseId && body.leaseId !== job.leaseId) {
    return res.status(409).json({
      error: `Lease ID mismatch: o lease '${body.leaseId}' não corresponde ao lease ativo '${job.leaseId}'.`,
    });
  }

  // Validação de attemptId
  if (body.attemptId && job.attemptId && body.attemptId !== job.attemptId) {
    return res.status(409).json({
      error: `Attempt ID mismatch: a tentativa '${body.attemptId}' não corresponde à tentativa ativa '${job.attemptId}'.`,
    });
  }

  // Validação de agente detentor do claim
  if (body.agentId && job.claimedByAgentId && body.agentId !== job.claimedByAgentId) {
    return res.status(403).json({
      error: `Agente '${body.agentId}' não é o detentor do claim do job (detentor: '${job.claimedByAgentId}').`,
    });
  }

  // Validação de transição de estado
  if (!isValidStatusTransition(job.status, body.status)) {
    return res.status(409).json({
      error: `Transição de estado inválida: não é permitido transicionar de '${job.status}' para '${body.status}'.`,
    });
  }

  job.status = body.status;
  job.updatedAt = new Date().toISOString();
  if (body.executionTimeMs !== undefined) job.executionTimeMs = body.executionTimeMs;

  if (body.status === 'DELIVERED_TO_TRANSPORT') {
    job.deliveredToTransportAt = new Date().toISOString();
  } else if (body.status === 'PRINTED') {
    job.completedAt = new Date().toISOString();
  } else if (body.status === 'FAILED') {
    job.error = body.error || 'Erro durante a transmissão dos bytes para a impressora.';
  } else if (body.status === 'UNKNOWN_RESULT') {
    job.error = body.error || 'Resultado da impressão ambíguo (queda de conexão durante o envio).';
  }

  printJobsStore.set(job.id, job);

  res.json({
    success: true,
    job,
  });
});

// 4. Listar Histórico de Jobs
router.get('/', (_req: Request, res: Response) => {
  const jobs = Array.from(printJobsStore.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json({
    total: jobs.length,
    jobs,
  });
});

export { printJobsStore };
export default router;


