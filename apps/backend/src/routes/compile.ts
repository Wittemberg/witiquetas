import { Router, Request, Response } from 'express';
import { LabelDocument, LabelDocumentSchema } from '@witiquetas/label-schema';
import { compilerRegistry, PrinterLanguage } from '@witiquetas/printer-core';

// Garantir que os compiladores PPLA e PPLB sejam registrados no registry
import '@witiquetas/printer-ppla';
import '@witiquetas/printer-pplb';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  const { document, language = 'PPLB', data = {} } = req.body;

  if (!document) {
    return res.status(400).json({ error: 'O documento da etiqueta é obrigatório.' });
  }

  // Validação Zod do LabelDocument
  const docValidation = LabelDocumentSchema.safeParse(document);
  if (!docValidation.success) {
    return res.status(400).json({
      error: 'Estrutura do LabelDocument inválida.',
      details: docValidation.error.format(),
    });
  }

  const targetLang = (language as string).toUpperCase() as PrinterLanguage;
  const compiler = compilerRegistry.get(targetLang);

  if (!compiler) {
    return res.status(400).json({
      error: `Compilador para a linguagem '${language}' não suportado.`,
      supportedLanguages: compilerRegistry.getSupportedLanguages(),
    });
  }

  // Validar regras específicas do compilador
  const validation = compiler.validate(document as LabelDocument);
  if (!validation.valid) {
    return res.status(400).json({
      error: `Validação do compilador '${targetLang}' falhou.`,
      errors: validation.errors,
      warnings: validation.warnings,
    });
  }

  // Compilar layout para comandos nativos da impressora
  try {
    const result = compiler.compile(document as LabelDocument, data);
    res.json({
      success: true,
      language: result.language,
      encoding: result.encoding,
      command: result.command,
      warnings: [...validation.warnings, ...result.warnings],
    });
  } catch (err: any) {
    res.status(500).json({
      error: `Falha interna na compilação ${targetLang}.`,
      message: err.message || String(err),
    });
  }
});

export default router;
