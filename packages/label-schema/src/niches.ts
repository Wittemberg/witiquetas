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
  profileId: CanonicalNicheId;
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
  profileId: CanonicalNicheId;
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

export interface NicheSizeItem extends LabelSize {
  featured: boolean;
  order: number;
  label?: string;
  description?: string;
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

// 1. PERFIS OPERACIONAIS CANÔNICOS (CAMADA INTERNA DE INTEGRAÇÃO)
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
    recommendedElements: ['text', 'barcode', 'qrcode', 'shape', 'image'],
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
    recommendedElements: ['text', 'barcode', 'qrcode', 'shape', 'image'],
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

// 2. CATÁLOGO COMPLETO DE 11 NICHOS CONCRETOS DE APLICAÇÃO
export const NICHES: NicheDefinition[] = [
  {
    id: 'niche-gondola',
    slug: 'gondola-supermercado',
    name: 'Gôndola / Supermercado',
    description: 'Etiquetas de gôndola, preços, ofertas e identificação de prateleiras.',
    iconName: 'ShoppingCart',
    profileId: 'retail',
    tags: ['gondola', 'supermercado', 'varejo', 'preco'],
    active: true,
    order: 1,
  },
  {
    id: 'niche-produto',
    slug: 'produto-codigo-barras',
    name: 'Produto / Código de Barras',
    description: 'Rótulos de produtos, precificação e código de barras EAN-13/Code128.',
    iconName: 'Barcode',
    profileId: 'retail',
    tags: ['produto', 'ean', 'barcode', 'varejo'],
    active: true,
    order: 2,
  },
  {
    id: 'niche-logistica',
    slug: 'logistica-expedicao-ecommerce',
    name: 'Logística / Expedição / E-commerce',
    description: 'Envios, correios, volumes, DANFE simplificada e despacho.',
    iconName: 'Truck',
    profileId: 'logistics',
    tags: ['logistica', 'expedicao', 'ecommerce', 'correios', 'sscc'],
    active: true,
    order: 3,
  },
  {
    id: 'niche-farmacia',
    slug: 'farmacia-medicamentos',
    name: 'Farmácia / Medicamentos',
    description: 'Medicamentos manipulados, posologia, lote e controle farmacêutico.',
    iconName: 'Pill',
    profileId: 'pharmacy',
    tags: ['farmacia', 'medicamento', 'manipulacao', 'lote'],
    active: true,
    order: 4,
  },
  {
    id: 'niche-hospital',
    slug: 'hospital-identificacao',
    name: 'Hospital / Identificação',
    description: 'Pulseiras, prontuários e identificação segura de pacientes.',
    iconName: 'Activity',
    profileId: 'hospital',
    tags: ['hospital', 'paciente', 'prontuario', 'pulseira'],
    active: true,
    order: 5,
  },
  {
    id: 'niche-laboratorio',
    slug: 'laboratorio',
    name: 'Laboratório',
    description: 'Tubos de ensaio, amostras biológicas e lâminas laboratoriais.',
    iconName: 'FlaskConical',
    profileId: 'laboratory',
    tags: ['laboratorio', 'amostra', 'tubo', 'exame'],
    active: true,
    order: 6,
  },
  {
    id: 'niche-sangue',
    slug: 'banco-sangue-hemoterapia',
    name: 'Banco de Sangue / Hemoterapia',
    description: 'Bolsas de sangue, hemoderivados e rastreamento hematológico.',
    iconName: 'Droplet',
    profileId: 'hospital',
    tags: ['sangue', 'hemoterapia', 'bolsa', 'doacao'],
    active: true,
    order: 7,
  },
  {
    id: 'niche-joalheria',
    slug: 'joalheria-otica',
    name: 'Joalheria / Ótica',
    description: 'Etiquetas tipo borboleta/haste para jóias, relógios e armações.',
    iconName: 'Sparkles',
    profileId: 'retail',
    tags: ['joalheria', 'otica', 'relogio', 'joia'],
    active: true,
    order: 8,
  },
  {
    id: 'niche-confeccao',
    slug: 'confeccao-vestuario',
    name: 'Confecção / Vestuário',
    description: 'Tags de roupas, composição têxtil, tamanhos e identificação de peças.',
    iconName: 'Tag',
    profileId: 'retail',
    tags: ['confeccao', 'vestuario', 'roupa', 'tag'],
    active: true,
    order: 9,
  },
  {
    id: 'niche-patrimonio',
    slug: 'patrimonio-inventario',
    name: 'Patrimônio / Inventário',
    description: 'Plaquetas de patrimônio, inventário de ativos e código de controle.',
    iconName: 'Archive',
    profileId: 'industry',
    tags: ['patrimonio', 'inventario', 'ativo', 'plaqueta'],
    active: true,
    order: 10,
  },
  {
    id: 'niche-uso-geral',
    slug: 'uso-geral',
    name: 'Uso Geral',
    description: 'Identificação genérica, caixas, envelopes, pastas e avisos.',
    iconName: 'Layers',
    profileId: 'retail',
    tags: ['geral', 'envelope', 'pasta', 'caixa'],
    active: true,
    order: 11,
  },
];

// 3. FUNÇÕES DE NORMALIZAÇÃO SEPARADAS (PROFILE vs NICHE)

export function normalizeOperationalProfileId(nicheIdOrSlugOrName?: string): CanonicalNicheId {
  if (!nicheIdOrSlugOrName) return 'retail';
  const lower = nicheIdOrSlugOrName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (lower.includes('banco-sangue') || lower.includes('hemoterapia') || lower.includes('sangue')) return 'hospital';
  if (lower.includes('hospital') || lower.includes('paciente') || lower.includes('leito') || lower.includes('prontuario')) return 'hospital';
  if (lower.includes('laborator') || lower.includes('specimen') || lower.includes('amostra') || lower.includes('exame')) return 'laboratory';
  if (lower.includes('logistic') || lower.includes('expedicao') || lower.includes('armazem') || lower.includes('volume')) return 'logistics';
  if (lower.includes('patrimonio') || lower.includes('inventario') || lower.includes('industr') || lower.includes('producao') || lower.includes('fabrica')) return 'industry';
  if (lower.includes('food') || lower.includes('alimento') || lower.includes('perecivel') || lower.includes('restaurante')) return 'food';
  if (lower.includes('pharmac') || lower.includes('farmacia') || lower.includes('medicamento') || lower.includes('drogaria')) return 'pharmacy';
  if (lower.startsWith('retail') || lower.includes('gondola') || lower.includes('supermercado') || lower.includes('varejo') || lower.includes('produto') || lower.includes('joalheria') || lower.includes('confeccao') || lower.includes('geral')) return 'retail';

  return 'retail';
}

export function normalizeNicheId(nicheIdOrSlugOrName?: string): string {
  if (!nicheIdOrSlugOrName) return 'gondola-supermercado';
  const lower = nicheIdOrSlugOrName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // Mapeamento direto de ID ou slug exato
  const exactMatch = NICHES.find((n) => n.id === lower || n.slug === lower);
  if (exactMatch) return exactMatch.slug;

  if (lower.includes('sangue') || lower.includes('hemoterapia')) return 'banco-sangue-hemoterapia';
  if (lower.includes('hospital') || lower.includes('paciente') || lower.includes('leito') || lower.includes('prontuario')) return 'hospital-identificacao';
  if (lower.includes('laborator') || lower.includes('specimen') || lower.includes('amostra')) return 'laboratorio';
  if (lower.includes('logistic') || lower.includes('expedicao') || lower.includes('ecommerce')) return 'logistica-expedicao-ecommerce';
  if (lower.includes('farmacia') || lower.includes('medicamento') || lower.includes('manipula')) return 'farmacia-medicamentos';
  if (lower.includes('joalheria') || lower.includes('otica') || lower.includes('relogio')) return 'joalheria-otica';
  if (lower.includes('confeccao') || lower.includes('vestuario') || lower.includes('roupa')) return 'confeccao-vestuario';
  if (lower.includes('patrimonio') || lower.includes('inventario') || lower.includes('ativo')) return 'patrimonio-inventario';
  if (lower.includes('gondola') || lower.includes('prateleira')) return 'gondola-supermercado';
  if (lower.includes('produto') || lower.includes('codigo-barras')) return 'produto-codigo-barras';
  if (lower.includes('geral')) return 'uso-geral';

  // Fallback por profile
  const profileId = normalizeOperationalProfileId(lower);
  if (profileId === 'hospital') return 'hospital-identificacao';
  if (profileId === 'laboratory') return 'laboratorio';
  if (profileId === 'logistics') return 'logistica-expedicao-ecommerce';
  if (profileId === 'pharmacy') return 'farmacia-medicamentos';
  if (profileId === 'industry') return 'patrimonio-inventario';

  return 'gondola-supermercado';
}

export function getNicheProfile(nicheIdOrSlugOrName?: string): NicheProfile {
  const canonicalId = normalizeOperationalProfileId(nicheIdOrSlugOrName);
  return CANONICAL_NICHE_PROFILES.find((p) => p.id === canonicalId) || CANONICAL_NICHE_PROFILES[0];
}

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

// 4. BANCO COMPLETO HISTÓRICO COM OS 66 TAMANHOS FÍSICOS ÚNICOS
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
  const niche = NICHES.find((n) => n.slug === nicheSlug || n.id === nicheSlug) || NICHES[0];
  const sizeId = `size-${w.toString().replace('.', '_')}x${h.toString().replace('.', '_')}`;
  return {
    nicheId: niche.id,
    sizeId,
    featured,
    order,
  };
}

// 5. BANCO COMPLETO HISTÓRICO DE ASOCIAÇÕES NICHO x TAMANHO (112 ESTRUTURAS)
export const NICHE_SIZE_RELATIONS: NicheSizeRelation[] = [
  // Gôndola / Supermercado (11)
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

  // Produto / Código de Barras (24)
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

  // Logística / Expedição / E-commerce (15)
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
  rel('logistica-expedicao-ecommerce', 100, 150, 13, true),
  rel('logistica-expedicao-ecommerce', 100, 200, 14),
  rel('logistica-expedicao-ecommerce', 150, 100, 15),

  // Farmácia / Medicamentos (11)
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

  // Hospital / Identificação (6)
  rel('hospital-identificacao', 19.05, 6.35, 1),
  rel('hospital-identificacao', 25.4, 25.4, 2),
  rel('hospital-identificacao', 33.34, 9.53, 3),
  rel('hospital-identificacao', 50.8, 25.4, 4),
  rel('hospital-identificacao', 50.8, 31.75, 5),
  rel('hospital-identificacao', 63.5, 88.9, 6),

  // Laboratório (7)
  rel('laboratorio', 20.6, 7, 1),
  rel('laboratorio', 27, 13, 2),
  rel('laboratorio', 38, 13, 3),
  rel('laboratorio', 38, 19, 4),
  rel('laboratorio', 50.8, 25.4, 5),
  rel('laboratorio', 50.8, 31.75, 6),
  rel('laboratorio', 51, 6, 7),

  // Banco de Sangue / Hemoterapia (4)
  rel('banco-sangue-hemoterapia', 50.8, 15.9, 1),
  rel('banco-sangue-hemoterapia', 50.8, 50.8, 2),
  rel('banco-sangue-hemoterapia', 101.6, 50.8, 3),
  rel('banco-sangue-hemoterapia', 101.6, 101.6, 4),

  // Joalheria / Ótica (10)
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

  // Confecção / Vestuário (9)
  rel('confeccao-vestuario', 25, 50, 1),
  rel('confeccao-vestuario', 30, 50, 2),
  rel('confeccao-vestuario', 30, 60, 3),
  rel('confeccao-vestuario', 35, 60, 4),
  rel('confeccao-vestuario', 40, 60, 5),
  rel('confeccao-vestuario', 40, 70, 6),
  rel('confeccao-vestuario', 50, 70, 7),
  rel('confeccao-vestuario', 50, 80, 8),
  rel('confeccao-vestuario', 50, 100, 9),

  // Patrimônio / Inventário (9)
  rel('patrimonio-inventario', 30, 15, 1),
  rel('patrimonio-inventario', 40, 20, 2),
  rel('patrimonio-inventario', 40, 25, 3),
  rel('patrimonio-inventario', 50, 20, 4),
  rel('patrimonio-inventario', 50, 25, 5),
  rel('patrimonio-inventario', 50, 30, 6),
  rel('patrimonio-inventario', 70, 40, 7),
  rel('patrimonio-inventario', 80, 40, 8),
  rel('patrimonio-inventario', 100, 50, 9),

  // Uso Geral (6)
  rel('uso-geral', 30, 20, 1),
  rel('uso-geral', 40, 25, 2),
  rel('uso-geral', 50, 30, 3),
  rel('uso-geral', 60, 40, 4),
  rel('uso-geral', 80, 50, 5),
  rel('uso-geral', 100, 50, 6),
];

// 6. OBTENÇÃO DE TAMANHOS POR NICHO (CONSULTA AO CATÁLOGO COMPLETO)
export function getSizesByNiche(nicheIdOrSlug: string): NicheSizeItem[] {
  const normalizedSlug = normalizeNicheId(nicheIdOrSlug);
  const targetNiches = NICHES.filter((n) => n.slug === normalizedSlug || n.id === nicheIdOrSlug || n.profileId === nicheIdOrSlug);

  const targetNicheIds = new Set(targetNiches.map((n) => n.id));
  if (targetNicheIds.size === 0) {
    const fallbackNiche = NICHES.find((n) => n.slug === 'gondola-supermercado')!;
    targetNicheIds.add(fallbackNiche.id);
  }

  const relations = NICHE_SIZE_RELATIONS.filter((r) => targetNicheIds.has(r.nicheId));

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
        label: formatDimension(size.widthMm, size.heightMm),
        description: r.featured ? 'Mais usado' : undefined,
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
