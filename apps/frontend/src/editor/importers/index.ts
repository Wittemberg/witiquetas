import { ImportAdapter, ImportResult } from './types';
import { legacyAdapter } from './legacyParser';
import { zplAdapter } from './zplParser';

export * from './types';

const ADAPTERS: ImportAdapter[] = [legacyAdapter, zplAdapter];

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

  // Se nenhum formato específico for detectado, usa o adapter legado por padrão
  if (!adapter) {
    adapter = legacyAdapter;
  }

  return adapter.parse(content);
}
