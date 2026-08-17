import type { LabelDocument } from '@witiquetas/label-schema';

export type PrinterLanguage = 'PPLA' | 'PPLB' | 'ZPL' | 'EPL';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CompiledLabel {
  language: PrinterLanguage;
  encoding: string;
  command: string;
  warnings: string[];
}

export interface PrinterCompiler {
  language: PrinterLanguage;
  validate(document: LabelDocument): ValidationResult;
  compile(document: LabelDocument, data?: Record<string, string>): CompiledLabel;
}
