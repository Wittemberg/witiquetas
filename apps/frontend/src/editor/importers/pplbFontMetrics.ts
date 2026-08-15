/**
 * Catálogo e Métricas Oficiais de Fontes Bitmap PPLB / Eltron
 * Referência: Eltron / Zebra EPL2 & PPLB Programmer's Manual (Page Mode / Thermal Transfer)
 */

export interface PPLBFontMetric {
  fontId: string;
  name: string;
  baseWidthDots: number; // Largura base da matriz em dots (incluindo espaçamento inter-caractere)
  baseHeightDots: number; // Altura base da matriz em dots
  cpi: number; // Caracteres por polegada (em 203 DPI)
  verified: boolean; // Se homologado com especificação oficial
  fallbackFontFamily: string; // Fonte CSS recomendada para emulação no Canvas
  notes?: string;
}

export const PPLB_FONT_CATALOG: Record<string, PPLBFontMetric> = {
  '1': {
    fontId: '1',
    name: 'PPLB Font 1 (8x12)',
    baseWidthDots: 8,
    baseHeightDots: 12,
    cpi: 20.3,
    verified: true,
    fallbackFontFamily: 'Courier New, monospace',
    notes: 'Fonte bitmap padrão 20.3 CPI (Matriz 6x8 + 2 dots de espaçamento = 8x12 dots)',
  },
  '2': {
    fontId: '2',
    name: 'PPLB Font 2 (10x16)',
    baseWidthDots: 10,
    baseHeightDots: 16,
    cpi: 16.9,
    verified: true,
    fallbackFontFamily: 'Courier New, monospace',
    notes: 'Fonte bitmap padrão 16.9 CPI (Matriz 8x12 + 2 dots de espaçamento = 10x16 dots)',
  },
  '3': {
    fontId: '3',
    name: 'PPLB Font 3 (12x20)',
    baseWidthDots: 12,
    baseHeightDots: 20,
    cpi: 14.5,
    verified: true,
    fallbackFontFamily: 'Courier New, monospace',
    notes: 'Fonte bitmap padrão 14.5 CPI (Matriz 10x16 + 2 dots de espaçamento = 12x20 dots)',
  },
  '4': {
    fontId: '4',
    name: 'PPLB Font 4 (14x24)',
    baseWidthDots: 14,
    baseHeightDots: 24,
    cpi: 12.7,
    verified: true,
    fallbackFontFamily: 'Courier New, monospace',
    notes: 'Fonte bitmap padrão 12.7 CPI (Matriz 12x20 + 2 dots de espaçamento = 14x24 dots)',
  },
  '5': {
    fontId: '5',
    name: 'PPLB Font 5 (32x48)',
    baseWidthDots: 32,
    baseHeightDots: 48,
    cpi: 5.6,
    verified: true,
    fallbackFontFamily: 'Roboto, sans-serif',
    notes: 'Fonte numérica grande expandida (Matriz 24x32 + espaçamento = 32x48 dots)',
  },
  '0': {
    fontId: '0',
    name: 'PPLB Scalable Soft Font',
    baseWidthDots: 14,
    baseHeightDots: 24,
    cpi: 12.7,
    verified: false,
    fallbackFontFamily: 'Roboto, sans-serif',
    notes: 'Fonte suave proporcional / aproximada',
  },
};

/**
 * Calcula a geometria física precisa (em mm e pt) para um texto com base na fonte e multiplicadores PPLB
 */
export function calculatePPLBTextGeometry(
  fontId: string | number,
  hMult: number = 1,
  vMult: number = 1,
  charCount: number = 1,
  dpi: number = 203
): {
  widthMm: number;
  heightMm: number;
  fontSizePt: number;
  baseWidthDots: number;
  baseHeightDots: number;
  fontMetric: PPLBFontMetric;
} {
  const metric = PPLB_FONT_CATALOG[String(fontId)] || PPLB_FONT_CATALOG['3'];
  const safeHMult = Math.max(1, Math.min(8, Math.round(hMult)));
  const safeVMult = Math.max(1, Math.min(8, Math.round(vMult)));
  const safeCharCount = Math.max(1, charCount);

  const charWidthDots = metric.baseWidthDots * safeHMult;
  const charHeightDots = metric.baseHeightDots * safeVMult;

  const totalWidthDots = charWidthDots * safeCharCount;
  const totalHeightDots = charHeightDots;

  // Conversão exata de dots para mm: (dots * 25.4) / dpi
  const widthMm = (totalWidthDots * 25.4) / dpi;
  const heightMm = (totalHeightDots * 25.4) / dpi;

  // Tamanho tipográfico em pt: (dots * 72) / dpi
  const fontSizePt = Math.max(6, Math.round((charHeightDots * 72) / dpi));

  return {
    widthMm,
    heightMm,
    fontSizePt,
    baseWidthDots: metric.baseWidthDots,
    baseHeightDots: metric.baseHeightDots,
    fontMetric: metric,
  };
}
