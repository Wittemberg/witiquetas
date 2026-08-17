import type { ImportAdapter, ImportResult } from './types';
import { legacyAdapter } from './legacyParser';
import { zplAdapter } from './zplParser';
import { PPLBParser } from './pplbParser';
import { PPLAParser } from './pplaParser';
import { LegacyCompiler } from './legacyCompiler';
import { detectLabelFormat } from './formatDetector';

export * from './types';
export * from './astTypes';
export * from './legacyPreprocessor';
export * from './pplbParser';
export * from './pplaParser';
export * from './formatDetector';
export * from './legacyCompiler';

export const pplaAdapter: ImportAdapter = {
  id: 'ppla-legacy',
  name: 'PPLA / Argox / Datamax DPL (2 Camadas + AST)',
  detect: (content: string): boolean => {
    const detection = detectLabelFormat(content);
    return detection.language === 'ppla';
  },
  parse: async (content: string, fileMetadata?: { originalFileName?: string; originalExtension?: string }): Promise<ImportResult> => {
    return PPLAParser.parse(content, fileMetadata);
  },
};

export const pplbAdapter: ImportAdapter = {
  id: 'pplb-legacy',
  name: 'PPLB / Eltron / Legado ERP (2 Camadas + AST)',
  detect: (content: string): boolean => {
    const detection = detectLabelFormat(content);
    return detection.language === 'pplb';
  },
  parse: async (content: string, fileMetadata?: { originalFileName?: string; originalExtension?: string }): Promise<ImportResult> => {
    return PPLBParser.parse(content, fileMetadata);
  },
};

const ADAPTERS: ImportAdapter[] = [pplaAdapter, pplbAdapter, zplAdapter, legacyAdapter];

export function detectAdapter(content: string): ImportAdapter | null {
  const detection = detectLabelFormat(content);
  if (detection.language === 'ppla') return pplaAdapter;
  if (detection.language === 'pplb') return pplbAdapter;
  if (detection.language === 'zpl') return zplAdapter;

  for (const adapter of ADAPTERS) {
    if (adapter.detect(content)) {
      return adapter;
    }
  }
  return null;
}

export async function parseImportContent(
  content: string,
  preferredAdapterId?: string,
  fileMetadata?: { originalFileName?: string; originalExtension?: string }
): Promise<ImportResult> {
  let adapter: ImportAdapter | null = null;

  if (preferredAdapterId) {
    adapter = ADAPTERS.find((a) => a.id === preferredAdapterId) || null;
  }

  if (!adapter) {
    adapter = detectAdapter(content);
  }

  // Se nenhum formato específico for detectado, tenta PPLA se tiver O/M ou comandos numéricos, senão PPLB
  if (!adapter) {
    adapter = pplbAdapter;
  }

  return adapter.parse(content, fileMetadata);
}

