/**
 * Catálogo e Métricas Oficiais de Códigos de Barras PPLB / Eltron
 * Referência: Eltron EPL2 & PPLB Programmer's Reference Manual (Command B - Barcode Specification)
 */

export interface PPLBBarcodeTypeMetric {
  sourceType: string;
  name: string;
  canonicalFormat: 'AUTO' | 'EAN13' | 'EAN8' | 'UPCA' | 'UPCE' | 'CODE128' | 'ITF14';
  isModular: boolean;
  fixedLength?: number;
  standardModules?: number;
  quietZoneModules: { left: number; right: number };
  verified: boolean;
  notes?: string;
}

export const PPLB_BARCODE_CATALOG: Record<string, PPLBBarcodeTypeMetric> = {
  'E30': {
    sourceType: 'E30',
    name: 'EAN-13 (Com Verificação Automática)',
    canonicalFormat: 'EAN13',
    isModular: true,
    fixedLength: 13,
    standardModules: 95,
    quietZoneModules: { left: 11, right: 7 },
    verified: true,
    notes: 'Padrão EAN-13 GS1 com 95 módulos de símbolo',
  },
  'E': {
    sourceType: 'E',
    name: 'EAN-13',
    canonicalFormat: 'EAN13',
    isModular: true,
    fixedLength: 13,
    standardModules: 95,
    quietZoneModules: { left: 11, right: 7 },
    verified: true,
    notes: 'Sintaxe abreviada EAN-13',
  },
  '3': {
    sourceType: '3',
    name: 'EAN-13 / Code 93',
    canonicalFormat: 'EAN13',
    isModular: true,
    fixedLength: 13,
    standardModules: 95,
    quietZoneModules: { left: 11, right: 7 },
    verified: true,
    notes: 'Mapeado para EAN-13 em etiquetas de gôndola',
  },
  '8': {
    sourceType: '8',
    name: 'EAN-8',
    canonicalFormat: 'EAN8',
    isModular: true,
    fixedLength: 8,
    standardModules: 67,
    quietZoneModules: { left: 7, right: 7 },
    verified: true,
    notes: 'Padrão EAN-8 GS1 com 67 módulos',
  },
  '1': {
    sourceType: '1',
    name: 'Code 128 Auto (A/B/C)',
    canonicalFormat: 'CODE128',
    isModular: true,
    quietZoneModules: { left: 10, right: 10 },
    verified: true,
    notes: 'Code 128 de densidade variável',
  },
  'UA0': {
    sourceType: 'UA0',
    name: 'UPC-A',
    canonicalFormat: 'UPCA',
    isModular: true,
    fixedLength: 12,
    standardModules: 95,
    quietZoneModules: { left: 9, right: 9 },
    verified: true,
    notes: 'Padrão UPC-A de 12 dígitos',
  },
  'K': {
    sourceType: 'K',
    name: 'ITF-14 (Interleaved 2 of 5)',
    canonicalFormat: 'ITF14',
    isModular: false,
    fixedLength: 14,
    quietZoneModules: { left: 10, right: 10 },
    verified: true,
    notes: 'Interleaved 2 de 5 com barras bearer',
  },
};

/**
 * Calcula a geometria física precisa do código de barras a partir da simbologia e parâmetros PPLB
 */
export function calculatePPLBBarcodeGeometry(
  sourceType: string,
  narrowBarDots: number = 2,
  wideBarDots: number = 4,
  barcodeHeightDots: number = 30,
  dataStr: string = '7891234567895',
  showText: boolean = true,
  dpi: number = 203
): {
  widthMm: number;
  heightMm: number;
  symbolWidthDots: number;
  totalModules: number;
  canonicalFormat: 'AUTO' | 'EAN13' | 'EAN8' | 'UPCA' | 'UPCE' | 'CODE128' | 'ITF14';
  metric: PPLBBarcodeTypeMetric;
} {
  const normType = sourceType.trim().toUpperCase();
  const metric = PPLB_BARCODE_CATALOG[normType] || {
    sourceType,
    name: `Simbologia PPLB (${sourceType})`,
    canonicalFormat: 'AUTO' as const,
    isModular: true,
    standardModules: 95,
    quietZoneModules: { left: 10, right: 10 },
    verified: false,
  };

  const safeNarrow = Math.max(1, Math.round(narrowBarDots || 2));
  const safeHeight = Math.max(1, Math.round(barcodeHeightDots || 30));

  let totalModules = metric.standardModules || 95;

  if (metric.canonicalFormat === 'CODE128') {
    const cleanData = dataStr.replace(/^\[\[|\]\]$/g, '') || '12345678';
    // Cada caractere Code 128 = 11 módulos + Start (11) + Check (11) + Stop (13) = (N + 3)*11 + 2
    totalModules = (cleanData.length + 3) * 11 + 2;
  } else if (metric.canonicalFormat === 'EAN8') {
    totalModules = 67;
  } else if (metric.canonicalFormat === 'EAN13' || metric.canonicalFormat === 'UPCA') {
    totalModules = 95;
  }

  // Largura total em dots = total de módulos × narrowBarDots
  const symbolWidthDots = totalModules * safeNarrow;

  // Altura em dots: preserva os dots exatos da barra.
  // Se showText for true, adiciona 12 dots para a legenda legível humana da impressora
  const totalHeightDots = safeHeight + (showText ? 12 : 0);

  const widthMm = parseFloat(((symbolWidthDots * 25.4) / dpi).toFixed(2));
  const heightMm = parseFloat(((totalHeightDots * 25.4) / dpi).toFixed(2));

  return {
    widthMm,
    heightMm,
    symbolWidthDots,
    totalModules,
    canonicalFormat: metric.canonicalFormat,
    metric,
  };
}
