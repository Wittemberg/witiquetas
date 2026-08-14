import { Router, Request, Response } from 'express';
import {
  PrintJobDTO,
  CreatePrintJobDTO,
  PrintJobItemDTO,
  UpdatePrintJobStatusDTO,
  PrintJobStatus,
} from '@witiquetas/contracts';
import { LabelDocument, LabelDocumentSchema } from '@witiquetas/label-schema';
import { compilerRegistry, PrinterLanguage } from '@witiquetas/printer-core';
import { printersStore } from './printers';

// Compiladores PPLA e PPLB
import '@witiquetas/printer-ppla';
import '@witiquetas/printer-pplb';

const router = Router();

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
    payload: finalPayload,
    attempts: 0,
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

  printJobsStore.forEach((job) => {
    if (job.status === 'PENDING') {
      const printer = printersStore.get(job.printerId);
      if (printer) {
        pendingJobs.push({
          jobId: job.id,
          printerId: printer.id,
          printerName: printer.name,
          protocol: printer.protocol,
          host: printer.host,
          port: printer.port,
          serialPort: printer.serialPort,
          baudRate: printer.baudRate,
          language: job.language,
          encoding: job.encoding,
          payload: job.payload,
          copies: job.copies,
        });

        // Marcar como DISPATCHED
        job.status = 'DISPATCHED';
        job.updatedAt = new Date().toISOString();
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

  job.status = body.status as PrintJobStatus;
  job.updatedAt = new Date().toISOString();
  job.attempts += 1;

  if (body.status === 'SUCCESS') {
    job.completedAt = new Date().toISOString();
  } else if (body.status === 'FAILED') {
    job.error = body.error || 'Erro desconhecido durante o envio dos bytes para a impressora.';
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
