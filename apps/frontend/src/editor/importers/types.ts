import type { LabelDocument } from '@witiquetas/label-schema';

export type DiagnosticStatus = 'converted' | 'partial' | 'unrecognized';

export interface ImportDiagnosticItem {
  status: DiagnosticStatus;
  originalSnippet: string;
  message: string;
  targetElementId?: string;
}

export interface ImportResult {
  formatId: string;
  formatName: string;
  document: LabelDocument;
  diagnostics: ImportDiagnosticItem[];
  rawContent: string;
  elementsCount: number;
  warningsCount: number;
}

export interface ImportAdapter {
  id: string;
  name: string;
  detect: (content: string) => boolean;
  parse: (content: string) => Promise<ImportResult>;
}
