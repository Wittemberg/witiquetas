export type CanonicalNicheId =
  | 'retail'
  | 'hospital'
  | 'laboratory'
  | 'logistics'
  | 'industry'
  | 'food'
  | 'pharmacy';

export interface NicheProfile {
  id: CanonicalNicheId;
  slug: string;
  name: string;
  description: string;
  iconName: string;
  active: boolean;
  order: number;
  recommendedElements: Array<'text' | 'price' | 'barcode' | 'qrcode' | 'shape' | 'image' | 'line' | 'rectangle'>;
  defaultPreset: { widthMm: number; heightMm: number; name: string };
  recommendedPresets: Array<{ widthMm: number; heightMm: number; name: string }>;
}

export interface NicheDefinition {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconName: string;
  tags: string[];
  active: boolean;
  order: number;
}

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

export interface NicheSizeItem {
  id: string;
  widthMm: number;
  heightMm: number;
  label: string;
  description?: string;
  featured?: boolean;
}

export interface NicheSizeRelation {
  nicheId: string;
  sizeId: string;
  featured?: boolean;
  order: number;
}

export type LabelOrientation = 'horizontal' | 'vertical' | 'quadrada';

export const THERMAL_STANDARD_MAX_WIDTH_MM = 104;

export function calculateOrientation(widthMm: number, heightMm: number): LabelOrientation {
  if (widthMm > heightMm) return 'horizontal';
  if (heightMm > widthMm) return 'vertical';
  return 'quadrada';
}

export function formatDimension(widthMm: number, heightMm: number): string {
  const formatNum = (n: number) => (Number.isInteger(n) ? n.toString() : n.toString().replace('.', ','));
  return `${formatNum(widthMm)} × ${formatNum(heightMm)} mm`;
}

export function formatDimensionLabel(widthMm: number, heightMm: number): string {
  return formatDimension(widthMm, heightMm);
}

// 7 PERFIS CANÔNICOS DE NICHO (PACOTE 4.5)
export const CANONICAL_NICHE_PROFILES: NicheProfile[] = [
  {
    id: 'retail',
    slug: 'retail',
    name: 'Varejo / Supermercado',
    description: 'Etiquetas de gôndola, preços, ofertas, código de barras EAN e gôndola.',
    iconName: 'ShoppingCart',
    active: true,
    order: 1,
    recommendedElements: ['text', 'price', 'barcode', 'qrcode', 'shape', 'image'],
    defaultPreset: { widthMm: 100, heightMm: 30, name: '100 × 30 mm (Gôndola)' },
    recommendedPresets: [
      { widthMm: 100, heightMm: 30, name: '100 × 30 mm (Gôndola)' },
      { widthMm: 60, heightMm: 40, name: '60 × 40 mm (Etiqueta Produto)' },
      { widthMm: 50, heightMm: 30, name: '50 × 30 mm (Gôndola Compacta)' },
    ],
  },
  {
    id: 'hospital',
    slug: 'hospital',
    name: 'Hospital / Identificação',
    description: 'Prontuários, identificação segura de pacientes, leitos e triagem.',
    iconName: 'Activity',
    active: true,
    order: 2,
    recommendedElements: ['text', 'barcode', 'qrcode', 'shape', 'image'], // Sem Preço por padrão
    defaultPreset: { widthMm: 100, heightMm: 30, name: '100 × 30 mm (Prontuário / Leito)' },
    recommendedPresets: [
      { widthMm: 100, heightMm: 30, name: '100 × 30 mm (Prontuário / Leito)' },
      { widthMm: 100, heightMm: 50, name: '100 × 50 mm (Prontuário Completo)' },
      { widthMm: 50, heightMm: 25, name: '50 × 25 mm (Pulseira / Identificação)' },
    ],
  },
  {
    id: 'laboratory',
    slug: 'laboratory',
    name: 'Laboratório Clínico',
    description: 'Tubos de ensaio, amostras biológicas, soro, sangue e exames.',
    iconName: 'FlaskConical',
    active: true,
    order: 3,
    recommendedElements: ['text', 'barcode', 'qrcode', 'shape', 'image'], // Sem Preço por padrão
    defaultPreset: { widthMm: 50.8, heightMm: 25.4, name: '50,8 × 25,4 mm (Specimen Label)' },
    recommendedPresets: [
      { widthMm: 50.8, heightMm: 25.4, name: '50,8 × 25,4 mm (Specimen Label)' },
      { widthMm: 50, heightMm: 20, name: '50 × 20 mm (Tubo de Ensaio)' },
      { widthMm: 40, heightMm: 20, name: '40 × 20 mm (Lâmina)' },
    ],
  },
  {
    id: 'logistics',
    slug: 'logistics',
    name: 'Logística / Expedição',
    description: 'Identificação de volumes, paletes, lotes, códigos SSCC e transporte.',
    iconName: 'Truck',
    active: true,
    order: 4,
    recommendedElements: ['text', 'barcode', 'qrcode', 'shape', 'image'],
    defaultPreset: { widthMm: 100, heightMm: 100, name: '100 × 100 mm (Logística / GS1)' },
    recommendedPresets: [
      { widthMm: 100, heightMm: 100, name: '100 × 100 mm (Logística / GS1)' },
      { widthMm: 100, heightMm: 150, name: '100 × 150 mm (Caixa / Palete GS1)' },
      { widthMm: 100, heightMm: 50, name: '100 × 50 mm (Volume Médio)' },
    ],
  },
  {
    id: 'industry',
    slug: 'industry',
    name: 'Indústria / Produção',
    description: 'Ordens de produção, número de lote, operadores e rastreabilidade.',
    iconName: 'Factory',
    active: true,
    order: 5,
    recommendedElements: ['text', 'barcode', 'qrcode', 'shape', 'image'],
    defaultPreset: { widthMm: 100, heightMm: 50, name: '100 × 50 mm (Ordem de Produção)' },
    recommendedPresets: [
      { widthMm: 100, heightMm: 50, name: '100 × 50 mm (Ordem de Produção)' },
      { widthMm: 80, heightMm: 50, name: '80 × 50 mm (Identificação Peça)' },
      { widthMm: 60, heightMm: 40, name: '60 × 40 mm (Caixa Componente)' },
    ],
  },
  {
    id: 'food',
    slug: 'food',
    name: 'Alimentos / Perecíveis',
    description: 'Rótulos de alimentos, datas de fabricação/validade, peso e ingredientes.',
    iconName: 'Utensils',
    active: true,
    order: 6,
    recommendedElements: ['text', 'price', 'barcode', 'qrcode', 'shape', 'image'],
    defaultPreset: { widthMm: 60, heightMm: 40, name: '60 × 40 mm (Rótulo Alimento)' },
    recommendedPresets: [
      { widthMm: 60, heightMm: 40, name: '60 × 40 mm (Rótulo Alimento)' },
      { widthMm: 50, heightMm: 40, name: '50 × 40 mm (Fracionado)' },
      { widthMm: 100, heightMm: 50, name: '100 × 50 mm (Tabela / Ingredientes)' },
    ],
  },
  {
    id: 'pharmacy',
    slug: 'pharmacy',
    name: 'Farmácia / Medicamentos',
    description: 'Medicamentos manipulados, princípio ativo, lote e registro Anvisa.',
    iconName: 'Pill',
    active: true,
    order: 7,
    recommendedElements: ['text', 'barcode', 'qrcode', 'shape', 'image'],
    defaultPreset: { widthMm: 50, heightMm: 30, name: '50 × 30 mm (Frasco / Medicamento)' },
    recommendedPresets: [
      { widthMm: 50, heightMm: 30, name: '50 × 30 mm (Frasco / Medicamento)' },
      { widthMm: 60, heightMm: 40, name: '60 × 40 mm (Manipulado)' },
      { widthMm: 40, heightMm: 25, name: '40 × 25 mm (Caixa Pequena)' },
    ],
  },
];

export function normalizeNicheId(nicheIdOrSlugOrName?: string): CanonicalNicheId {
  if (!nicheIdOrSlugOrName) return 'retail';
  const lower = nicheIdOrSlugOrName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (lower.includes('hospital') || lower.includes('paciente') || lower.includes('leito') || lower.includes('prontuario')) return 'hospital';
  if (lower.includes('laborator') || lower.includes('specimen') || lower.includes('amostra') || lower.includes('exame')) return 'laboratory';
  if (lower.includes('logistic') || lower.includes('expedicao') || lower.includes('armazem') || lower.includes('volume')) return 'logistics';
  if (lower.includes('industr') || lower.includes('producao') || lower.includes('fabrica')) return 'industry';
  if (lower.includes('food') || lower.includes('alimento') || lower.includes('perecivel') || lower.includes('restaurante')) return 'food';
  if (lower.includes('pharmac') || lower.includes('farmacia') || lower.includes('medicamento') || lower.includes('drogaria')) return 'pharmacy';
  if (lower.startsWith('retail') || lower.includes('gondola') || lower.includes('supermercado') || lower.includes('varejo') || lower.includes('produto') || lower.includes('geral')) return 'retail';

  return 'retail';
}

export function getNicheProfile(nicheIdOrSlugOrName?: string): NicheProfile {
  const canonicalId = normalizeNicheId(nicheIdOrSlugOrName);
  return CANONICAL_NICHE_PROFILES.find((p) => p.id === canonicalId) || CANONICAL_NICHE_PROFILES[0];
}

export function getSizesByNiche(nicheId: string): NicheSizeItem[] {
  const profile = getNicheProfile(nicheId);
  return profile.recommendedPresets.map((preset, idx) => ({
    id: `size-${preset.widthMm}x${preset.heightMm}`,
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    label: preset.name,
    description: formatDimension(preset.widthMm, preset.heightMm),
    featured: idx === 0,
  }));
}

export const NICHES: NicheDefinition[] = CANONICAL_NICHE_PROFILES.map((p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  description: p.description,
  iconName: p.iconName,
  tags: [p.id, p.slug, p.name],
  active: p.active,
  order: p.order,
}));

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

function rel(nicheSlug: string, w: number, h: number, order: number, featured = false): NicheSizeRelation {
  const niche = CANONICAL_NICHE_PROFILES.find((n) => n.slug === nicheSlug || n.id === nicheSlug) || CANONICAL_NICHE_PROFILES[0];
  const sizeId = `size-${w.toString().replace('.', '_')}x${h.toString().replace('.', '_')}`;
  return {
    nicheId: niche.id,
    sizeId,
    featured,
    order,
  };
}

export const NICHE_SIZE_RELATIONS: NicheSizeRelation[] = [
  rel('retail', 100, 30, 1, true),
  rel('retail', 60, 40, 2),
  rel('retail', 50, 30, 3),
  rel('hospital', 100, 30, 1, true),
  rel('hospital', 100, 50, 2),
  rel('hospital', 50, 25, 3),
  rel('laboratory', 50.8, 25.4, 1, true),
  rel('laboratory', 50, 20, 2),
  rel('laboratory', 40, 20, 3),
  rel('logistics', 100, 100, 1, true),
  rel('logistics', 100, 150, 2),
  rel('logistics', 100, 50, 3),
  rel('industry', 100, 50, 1, true),
  rel('industry', 80, 50, 2),
  rel('industry', 60, 40, 3),
  rel('food', 60, 40, 1, true),
  rel('food', 50, 40, 2),
  rel('food', 100, 50, 3),
  rel('pharmacy', 50, 30, 1, true),
  rel('pharmacy', 60, 40, 2),
  rel('pharmacy', 40, 25, 3),
];
