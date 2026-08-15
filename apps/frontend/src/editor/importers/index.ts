import { ImportAdapter, ImportResult } from './types';
import { legacyAdapter } from './legacyParser';
import { zplAdapter } from './zplParser';
import { PPLBParser } from './pplbParser';
import { LegacyCompiler } from './legacyCompiler';

export * from './types';
export * from './astTypes';
export * from './legacyPreprocessor';
export * from './pplbParser';
export * from './legacyCompiler';

const pplbAdapter: ImportAdapter = {
  id: 'pplb-legacy',
  name: 'PPLB / Eltron / Legado ERP (2 Camadas + AST)',
  detect: (content: string): boolean => {
    return /^(I8|Q\d+|q\d+|N|A\d+,\d+|B\d+,\d+|\[\[SE\]\])/m.test(content) || /\[\[(PRECO|PROMOCAO|NOME|BARRA)/i.test(content);
  },
  parse: async (content: string): Promise<ImportResult> => {
    return PPLBParser.parse(content);
  },
};

const ADAPTERS: ImportAdapter[] = [pplbAdapter, legacyAdapter, zplAdapter];

export function detectAdapter(content: string): ImportAdapter | null {
  for (const adapter of ADAPTERS) {
    if (adapter.detect(content)) {
      return adapter;
    }
  }
  return null;
}

export async function parseImportContent(content: string, preferredAdapterId?: string): Promise<ImportResult> {
  let adapter: ImportAdapter | null = null;

  if (preferredAdapterId) {
    adapter = ADAPTERS.find((a) => a.id === preferredAdapterId) || null;
  }

  if (!adapter) {
    adapter = detectAdapter(content);
  }

  // Se nenhum formato específico for detectado, usa o adapter PPLB por padrão
  if (!adapter) {
    adapter = pplbAdapter;
  }

  return adapter.parse(content);
}
