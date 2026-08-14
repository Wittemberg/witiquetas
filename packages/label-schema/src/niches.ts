export interface Niche {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconName: string;
  active: boolean;
  order: number;
}

export interface LabelSize {
  id: string;
  widthMm: number;
  heightMm: number;
  name: string;
  active: boolean;
}

export interface NicheSizeRelation {
  nicheId: string;
  sizeId: string;
  featured?: boolean;
  order: number;
}

export type LabelOrientation = 'horizontal' | 'vertical' | 'quadrada';

export const THERMAL_STANDARD_MAX_WIDTH_MM = 104; // Largura máxima do cabeçote padrão de 4 polegadas

export function calculateOrientation(widthMm: number, heightMm: number): LabelOrientation {
  if (widthMm > heightMm) return 'horizontal';
  if (heightMm > widthMm) return 'vertical';
  return 'quadrada';
}

export function formatDimension(widthMm: number, heightMm: number): string {
  const formatNum = (n: number) => (Number.isInteger(n) ? n.toString() : n.toString().replace('.', ','));
  return `${formatNum(widthMm)} × ${formatNum(heightMm)} mm`;
}

// 1. Catálogo de Nichos (Sem Balanças)
export const NICHES: Niche[] = [
  {
    id: 'niche-gondola',
    slug: 'gondola-supermercado',
    name: 'Gôndola / Supermercado',
    description: 'Etiquetas de gôndola, preços, ofertas e identificação de prateleiras.',
    iconName: 'ShoppingCart',
    active: true,
    order: 1,
  },
  {
    id: 'niche-produto',
    slug: 'produto-codigo-barras',
    name: 'Produto / Código de Barras',
    description: 'Rótulos de produtos, precificação e código de barras EAN-13/Code128.',
    iconName: 'Barcode',
    active: true,
    order: 2,
  },
  {
    id: 'niche-logistica',
    slug: 'logistica-expedicao-ecommerce',
    name: 'Logística / Expedição / E-commerce',
    description: 'Envios, correios, volumes, DANFE simplificada e despacho.',
    iconName: 'Truck',
    active: true,
    order: 3,
  },
  {
    id: 'niche-farmacia',
    slug: 'farmacia-medicamentos',
    name: 'Farmácia / Medicamentos',
    description: 'Medicamentos manipulados, posologia, lote e controle farmacêutico.',
    iconName: 'Pill',
    active: true,
    order: 4,
  },
  {
    id: 'niche-hospital',
    slug: 'hospital-identificacao',
    name: 'Hospital / Identificação',
    description: 'Pulseiras, prontuários e identificação segura de pacientes.',
    iconName: 'Activity',
    active: true,
    order: 5,
  },
  {
    id: 'niche-laboratorio',
    slug: 'laboratorio',
    name: 'Laboratório',
    description: 'Tubos de ensaio, amostras biológicas e lâminas laboratoriais.',
    iconName: 'FlaskConical',
    active: true,
    order: 6,
  },
  {
    id: 'niche-sangue',
    slug: 'banco-sangue-hemoterapia',
    name: 'Banco de Sangue / Hemoterapia',
    description: 'Bolsas de sangue, hemoderivados e rastreamento hematológico.',
    iconName: 'Droplet',
    active: true,
    order: 7,
  },
  {
    id: 'niche-joalheria',
    slug: 'joalheria-otica',
    name: 'Joalheria / Ótica',
    description: 'Etiquetas tipo borboleta/haste para jóias, relógios e armações.',
    iconName: 'Sparkles',
    active: true,
    order: 8,
  },
  {
    id: 'niche-confeccao',
    slug: 'confeccao-vestuario',
    name: 'Confecção / Vestuário',
    description: 'Tags de roupas, composição têxtil, tamanhos e identificação de peças.',
    iconName: 'Tag',
    active: true,
    order: 9,
  },
  {
    id: 'niche-patrimonio',
    slug: 'patrimonio-inventario',
    name: 'Patrimônio / Inventário',
    description: 'Plaquetas de patrimônio, inventário de ativos e código de controle.',
    iconName: 'Archive',
    active: true,
    order: 10,
  },
  {
    id: 'niche-uso-geral',
    slug: 'uso-geral',
    name: 'Uso Geral',
    description: 'Identificação genérica, caixas, envelopes, pastas e avisos.',
    iconName: 'Layers',
    active: true,
    order: 11,
  },
];

// Helper para criar ou reutilizar tamanhos no catálogo
function createSize(w: number, h: number): LabelSize {
  const id = `size-${w.toString().replace('.', '_')}x${h.toString().replace('.', '_')}`;
  return {
    id,
    widthMm: w,
    heightMm: h,
    name: formatDimension(w, h),
    active: true,
  };
}

// 2. Banco de Tamanhos Únicos (Sem Duplicações)
export const LABEL_SIZES_CATALOG: LabelSize[] = [
  createSize(15, 50),
  createSize(19.05, 6.35),
  createSize(20.6, 7),
  createSize(25, 10),
  createSize(25, 12),
  createSize(25, 15),
  createSize(25, 50),
  createSize(25.4, 25.4),
  createSize(27, 13),
  createSize(30, 10),
  createSize(30, 15),
  createSize(30, 20),
  createSize(30, 50),
  createSize(30, 60),
  createSize(33, 22),
  createSize(33.34, 9.53),
  createSize(35, 60),
  createSize(38, 13),
  createSize(38, 19),
  createSize(40, 10),
  createSize(40, 20),
  createSize(40, 25),
  createSize(40, 30),
  createSize(40, 40),
  createSize(40, 60),
  createSize(40, 70),
  createSize(50, 10),
  createSize(50, 15),
  createSize(50, 20),
  createSize(50, 25),
  createSize(50, 30),
  createSize(50, 40),
  createSize(50, 70),
  createSize(50, 80),
  createSize(50, 100),
  createSize(50.8, 15.9),
  createSize(50.8, 25.4),
  createSize(50.8, 31.75),
  createSize(50.8, 50.8),
  createSize(51, 6),
  createSize(60, 20),
  createSize(60, 30),
  createSize(60, 40),
  createSize(63.5, 88.9),
  createSize(70, 30),
  createSize(70, 40),
  createSize(80, 30),
  createSize(80, 40),
  createSize(80, 50),
  createSize(100, 30),
  createSize(100, 40),
  createSize(100, 50),
  createSize(100, 60),
  createSize(100, 70),
  createSize(100, 80),
  createSize(100, 100),
  createSize(100, 110),
  createSize(100, 120),
  createSize(100, 130),
  createSize(100, 150),
  createSize(100, 200),
  createSize(101.6, 50.8),
  createSize(101.6, 101.6),
  createSize(105, 30),
  createSize(105, 40),
  createSize(150, 100),
];

const sizeMap = new Map<string, LabelSize>();
LABEL_SIZES_CATALOG.forEach((s) => sizeMap.set(s.id, s));

function rel(nicheSlug: string, w: number, h: number, order: number, featured = false): NicheSizeRelation {
  const niche = NICHES.find((n) => n.slug === nicheSlug)!;
  const sizeId = `size-${w.toString().replace('.', '_')}x${h.toString().replace('.', '_')}`;
  return {
    nicheId: niche.id,
    sizeId,
    featured,
    order,
  };
}

// 3. Relacionamentos Nicho x Tamanhos com ordem e destaques
export const NICHE_SIZE_RELATIONS: NicheSizeRelation[] = [
  // Gôndola / Supermercado
  rel('gondola-supermercado', 50, 30, 1),
  rel('gondola-supermercado', 50, 40, 2),
  rel('gondola-supermercado', 60, 30, 3),
  rel('gondola-supermercado', 60, 40, 4),
  rel('gondola-supermercado', 80, 30, 5),
  rel('gondola-supermercado', 80, 40, 6),
  rel('gondola-supermercado', 100, 30, 7, true),
  rel('gondola-supermercado', 100, 40, 8),
  rel('gondola-supermercado', 100, 50, 9),
  rel('gondola-supermercado', 105, 30, 10),
  rel('gondola-supermercado', 105, 40, 11),

  // Produto / Código de Barras
  rel('produto-codigo-barras', 25, 12, 1),
  rel('produto-codigo-barras', 25, 15, 2),
  rel('produto-codigo-barras', 30, 15, 3),
  rel('produto-codigo-barras', 30, 20, 4),
  rel('produto-codigo-barras', 33, 22, 5),
  rel('produto-codigo-barras', 40, 20, 6),
  rel('produto-codigo-barras', 40, 25, 7),
  rel('produto-codigo-barras', 40, 30, 8),
  rel('produto-codigo-barras', 40, 40, 9),
  rel('produto-codigo-barras', 50, 25, 10),
  rel('produto-codigo-barras', 50, 30, 11),
  rel('produto-codigo-barras', 50, 40, 12),
  rel('produto-codigo-barras', 60, 20, 13),
  rel('produto-codigo-barras', 60, 30, 14),
  rel('produto-codigo-barras', 60, 40, 15),
  rel('produto-codigo-barras', 70, 30, 16),
  rel('produto-codigo-barras', 70, 40, 17),
  rel('produto-codigo-barras', 80, 30, 18),
  rel('produto-codigo-barras', 80, 40, 19),
  rel('produto-codigo-barras', 80, 50, 20),
  rel('produto-codigo-barras', 100, 30, 21),
  rel('produto-codigo-barras', 100, 40, 22),
  rel('produto-codigo-barras', 100, 50, 23),
  rel('produto-codigo-barras', 100, 60, 24),

  // Logística / Expedição / E-commerce
  rel('logistica-expedicao-ecommerce', 50, 30, 1),
  rel('logistica-expedicao-ecommerce', 60, 40, 2),
  rel('logistica-expedicao-ecommerce', 80, 40, 3),
  rel('logistica-expedicao-ecommerce', 80, 50, 4),
  rel('logistica-expedicao-ecommerce', 100, 50, 5),
  rel('logistica-expedicao-ecommerce', 100, 60, 6),
  rel('logistica-expedicao-ecommerce', 100, 70, 7),
  rel('logistica-expedicao-ecommerce', 100, 80, 8),
  rel('logistica-expedicao-ecommerce', 100, 100, 9),
  rel('logistica-expedicao-ecommerce', 100, 110, 10),
  rel('logistica-expedicao-ecommerce', 100, 120, 11),
  rel('logistica-expedicao-ecommerce', 100, 130, 12),
  rel('logistica-expedicao-ecommerce', 100, 150, 13, true), // Destaque oficial!
  rel('logistica-expedicao-ecommerce', 100, 200, 14),
  rel('logistica-expedicao-ecommerce', 150, 100, 15),

  // Farmácia / Medicamentos
  rel('farmacia-medicamentos', 25, 15, 1),
  rel('farmacia-medicamentos', 30, 20, 2),
  rel('farmacia-medicamentos', 40, 20, 3),
  rel('farmacia-medicamentos', 40, 25, 4),
  rel('farmacia-medicamentos', 50, 25, 5),
  rel('farmacia-medicamentos', 50, 30, 6),
  rel('farmacia-medicamentos', 60, 30, 7),
  rel('farmacia-medicamentos', 60, 40, 8),
  rel('farmacia-medicamentos', 80, 30, 9),
  rel('farmacia-medicamentos', 100, 30, 10),
  rel('farmacia-medicamentos', 100, 40, 11),

  // Hospital / Identificação
  rel('hospital-identificacao', 19.05, 6.35, 1),
  rel('hospital-identificacao', 25.4, 25.4, 2),
  rel('hospital-identificacao', 33.34, 9.53, 3),
  rel('hospital-identificacao', 50.8, 25.4, 4),
  rel('hospital-identificacao', 50.8, 31.75, 5),
  rel('hospital-identificacao', 63.5, 88.9, 6),

  // Laboratório
  rel('laboratorio', 20.6, 7, 1),
  rel('laboratorio', 27, 13, 2),
  rel('laboratorio', 38, 13, 3),
  rel('laboratorio', 38, 19, 4),
  rel('laboratorio', 50.8, 25.4, 5),
  rel('laboratorio', 50.8, 31.75, 6),
  rel('laboratorio', 51, 6, 7),

  // Banco de Sangue / Hemoterapia
  rel('banco-sangue-hemoterapia', 50.8, 15.9, 1),
  rel('banco-sangue-hemoterapia', 50.8, 50.8, 2),
  rel('banco-sangue-hemoterapia', 101.6, 50.8, 3),
  rel('banco-sangue-hemoterapia', 101.6, 101.6, 4),

  // Joalheria / Ótica
  rel('joalheria-otica', 25, 10, 1),
  rel('joalheria-otica', 25, 12, 2),
  rel('joalheria-otica', 25, 15, 3),
  rel('joalheria-otica', 30, 10, 4),
  rel('joalheria-otica', 30, 15, 5),
  rel('joalheria-otica', 40, 10, 6),
  rel('joalheria-otica', 40, 20, 7),
  rel('joalheria-otica', 50, 10, 8),
  rel('joalheria-otica', 50, 15, 9),
  rel('joalheria-otica', 15, 50, 10),

  // Confecção / Vestuário
  rel('confeccao-vestuario', 25, 50, 1),
  rel('confeccao-vestuario', 30, 50, 2),
  rel('confeccao-vestuario', 30, 60, 3),
  rel('confeccao-vestuario', 35, 60, 4),
  rel('confeccao-vestuario', 40, 60, 5),
  rel('confeccao-vestuario', 40, 70, 6),
  rel('confeccao-vestuario', 50, 70, 7),
  rel('confeccao-vestuario', 50, 80, 8),
  rel('confeccao-vestuario', 50, 100, 9),

  // Patrimônio / Inventário
  rel('patrimonio-inventario', 30, 15, 1),
  rel('patrimonio-inventario', 40, 20, 2),
  rel('patrimonio-inventario', 40, 25, 3),
  rel('patrimonio-inventario', 50, 20, 4),
  rel('patrimonio-inventario', 50, 25, 5),
  rel('patrimonio-inventario', 50, 30, 6),
  rel('patrimonio-inventario', 70, 40, 7),
  rel('patrimonio-inventario', 80, 40, 8),
  rel('patrimonio-inventario', 100, 50, 9),

  // Uso Geral
  rel('uso-geral', 30, 20, 1),
  rel('uso-geral', 40, 25, 2),
  rel('uso-geral', 50, 30, 3),
  rel('uso-geral', 60, 40, 4),
  rel('uso-geral', 80, 50, 5),
  rel('uso-geral', 100, 50, 6),
];

export interface NicheSizeItem extends LabelSize {
  featured: boolean;
  order: number;
}

// Obter tamanhos filtrados e ordenados por nicho (Mais Usado primeiro, depois ordem dimensional natural)
export function getSizesByNiche(nicheIdOrSlug: string): NicheSizeItem[] {
  const niche = NICHES.find((n) => n.id === nicheIdOrSlug || n.slug === nicheIdOrSlug);
  if (!niche) return [];

  const relations = NICHE_SIZE_RELATIONS.filter((r) => r.nicheId === niche.id);

  const items: NicheSizeItem[] = [];
  const seenIds = new Set<string>();

  for (const r of relations) {
    const size = sizeMap.get(r.sizeId);
    if (size && !seenIds.has(size.id)) {
      seenIds.add(size.id);
      items.push({
        ...size,
        featured: !!r.featured,
        order: r.order,
      });
    }
  }

  // Ordenação: 1º featured: true; 2º widthMm crescente; 3º heightMm crescente
  items.sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    if (a.widthMm !== b.widthMm) return a.widthMm - b.widthMm;
    return a.heightMm - b.heightMm;
  });

  return items;
}
