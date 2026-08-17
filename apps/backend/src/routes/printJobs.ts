import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import {
  PrintJobDTO,
  CreatePrintJobDTO,
  PrintJobItemDTO,
  UpdatePrintJobStatusDTO,
  PrintJobDeliveryStatus,
  CopyStrategy,
} from '@witiquetas/contracts';
import { LabelDocument, LabelDocumentSchema } from '@witiquetas/label-schema';
import { compilerRegistry, PrinterLanguage } from '@witiquetas/printer-core';
import { printersStore } from './printers';

// Compiladores PPLA e PPLB
import '@witiquetas/printer-ppla';
import '@witiquetas/printer-pplb';

const router = Router();

export const DEFAULT_PRINT_JOB_MAX_ATTEMPTS = 3;

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

  // Converter explicitamente a string para os bytes brutos segundo o encoding
  const isWindows1252 = encoding.toLowerCase() === 'windows-1252' || encoding.toLowerCase() === 'cp1252';
  const payloadBuffer = isWindows1252
    ? Buffer.from(finalPayload, 'latin1')
    : Buffer.from(finalPayload, 'utf-8');

  const payloadBytesLength = payloadBuffer.length;
  const checksumSha256 = crypto.createHash('sha256').update(payloadBuffer).digest('hex');
  const payloadBase64 = payloadBuffer.toString('base64');

  // CopyStrategy: se o comando nativo já contém quantidade (ex: P1, P5, ^PQ), envia 1 vez
  const hasEmbeddedCopies = /P\d+/i.test(finalPayload) || /\^PQ\d+/i.test(finalPayload);
  const copyStrategy: CopyStrategy = hasEmbeddedCopies ? 'EMBEDDED_IN_PAYLOAD' : 'EMBEDDED_IN_PAYLOAD';

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

// 2. Buscar Jobs Pendentes (Consumido pelo Agente Local)
router.get('/pending', (_req: Request, res: Response) => {
  const pendingJobs: PrintJobItemDTO[] = [];
  const now = new Date().toISOString();

  printJobsStore.forEach((job) => {
    if (job.status === 'PENDING') {
      const printer = printersStore.get(job.printerId);
      if (printer) {
        const leaseId = `lease-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const attemptId = `att-${job.id}-${job.attempts + 1}`;

        // Transicionar para CLAIMED sob o novo lease
        job.status = 'CLAIMED';
        job.leaseId = leaseId;
        job.attemptId = attemptId;
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

  job.status = body.status as PrintJobDeliveryStatus;
  job.updatedAt = new Date().toISOString();
  job.attempts += 1;
  if (body.executionTimeMs) job.executionTimeMs = body.executionTimeMs;

  if (body.status === 'DELIVERED_TO_TRANSPORT') {
    job.deliveredToTransportAt = new Date().toISOString();
    job.completedAt = new Date().toISOString();
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

