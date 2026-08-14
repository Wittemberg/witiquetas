import { FontCompatibilityStatus, PrinterDTO } from '@witiquetas/contracts';

export interface CuratedFont {
  family: string;
  category: 'sans-serif' | 'serif' | 'monospace';
  recommended?: boolean;
  weights: number[]; // ex: [400, 500, 600, 700]
  description: string;
}

// 8 Fontes Curadas Oficiais do Witiquetas
export const CURATED_FONTS: CuratedFont[] = [
  {
    family: 'Roboto',
    category: 'sans-serif',
    recommended: true,
    weights: [400, 500, 700],
    description: 'Padrão Oficial Recomendado (Alta legibilidade em 203 DPI e números nítidos)',
  },
  {
    family: 'Inter',
    category: 'sans-serif',
    recommended: true,
    weights: [400, 600, 700],
    description: 'Moderna e compacta, excelente para descrições de produtos e gôndola',
  },
  {
    family: 'Arial',
    category: 'sans-serif',
    recommended: true,
    weights: [400, 700],
    description: 'Universal e nativa na maioria dos cabeçotes térmicos',
  },
  {
    family: 'Noto Sans',
    category: 'sans-serif',
    recommended: false,
    weights: [400, 600, 700],
    description: 'Suporte perfeito a todos os caracteres e símbolos brasileiros',
  },
  {
    family: 'Montserrat',
    category: 'sans-serif',
    recommended: false,
    weights: [400, 600, 700],
    description: 'Destaque visual encorpado, ideal para preços e promoções',
  },
  {
    family: 'Noto Serif',
    category: 'serif',
    recommended: false,
    weights: [400, 700],
    description: 'Serifada elegante, indicada para farmácia de manipulação e joalheria',
  },
  {
    family: 'Courier New',
    category: 'monospace',
    recommended: true,
    weights: [400, 700],
    description: 'Monoespaçada nativa tradicional (alinhamento tabular perfeito)',
  },
  {
    family: 'Roboto Mono',
    category: 'monospace',
    recommended: false,
    weights: [400, 700],
    description: 'Monoespaçada contemporânea para códigos de lote e patrimônio',
  },
];

export interface FontCompatibilityResult {
  status: FontCompatibilityStatus;
  label: string;
  badgeClass: string;
  reason?: string;
  fallbackFamily?: string;
}

// Avaliar compatibilidade da fonte com o perfil da impressora
export function getFontCompatibility(
  fontFamily: string,
  printer?: PrinterDTO | null
): FontCompatibilityResult {
  // Se não houver impressora definida
  if (!printer) {
    return {
      status: 'COMPATIBLE',
      label: 'Compatível (Genérico)',
      badgeClass: 'badge-success',
      reason: 'Compatível com visualização padrão do Witiquetas. Selecione uma impressora para checagem exata de hardware.',
    };
  }

  const nativeList = printer.capabilities?.nativeFonts || ['Roboto', 'Arial', 'Courier New'];
  const supportedList = printer.capabilities?.supportedFonts || [
    'Roboto',
    'Arial',
    'Inter',
    'Noto Sans',
    'Montserrat',
    'Noto Serif',
    'Courier New',
    'Roboto Mono',
  ];

  // 1. Fonte Nativa do Equipamento
  if (nativeList.some((f) => f.toLowerCase() === fontFamily.toLowerCase())) {
    return {
      status: 'NATIVE',
      label: '✓ Nativa',
      badgeClass: 'badge-success',
      reason: `Impressão direta via comandos nativos de alta velocidade da impressora ${printer.name}.`,
    };
  }

  // 2. Fonte Suportada via Renderização/Download
  if (supportedList.some((f) => f.toLowerCase() === fontFamily.toLowerCase())) {
    return {
      status: 'COMPATIBLE',
      label: '✓ Compatível',
      badgeClass: 'badge-info',
      reason: `A impressora ${printer.name} consegue reproduzir com fidelidade através do compilador ${printer.language}.`,
    };
  }

  // 3. Compatibilidade Limitada ou Incompatível
  if (fontFamily === 'Montserrat' && printer.language === 'PPLA') {
    return {
      status: 'LIMITED',
      label: '⚠ Limitada',
      badgeClass: 'badge-warning',
      reason: `A impressora ${printer.name} (PPLA) pode apresentar variação no desenho de pesos grossos.`,
      fallbackFamily: 'Arial',
    };
  }

  return {
    status: 'INCOMPATIBLE',
    label: '✕ Incompatível',
    badgeClass: 'badge-danger',
    reason: `Esta fonte não é suportada pela impressora ${printer.name} (${printer.language} - ${printer.dpi} DPI).`,
    fallbackFamily: 'Roboto',
  };
}
