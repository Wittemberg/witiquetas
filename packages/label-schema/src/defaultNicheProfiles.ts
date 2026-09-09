/**
 * Matriz Canônica de Perfis e Presets dos 11 Nichos da Plataforma (Pacote 5.5)
 *
 * Presets auditados e padronizados para bootstrap não-destrutivo de empresas.
 * Utiliza estritamente elementos visuais e campos canônicos reais existentes no catálogo.
 */

export type CanonicalElementType =
  | 'text'
  | 'price'
  | 'barcode'
  | 'qrcode'
  | 'line'
  | 'rectangle'
  | 'image';

export interface DefaultNicheFieldPreset {
  fieldId: string;
  fieldKey: string;
  availableForManual: boolean;
  availableForIntegration: boolean;
}

export interface DefaultNicheProfilePreset {
  nicheId: string;
  name: string;
  defaultElements: CanonicalElementType[];
  defaultFields: DefaultNicheFieldPreset[];
  operationalForOperator: boolean;
  roleNichesDefault: string[];
}

export const DEFAULT_NICHE_PROFILES: Record<string, DefaultNicheProfilePreset> = {
  // 1. Gôndola / Supermercado
  'niche-gondola': {
    nicheId: 'niche-gondola',
    name: 'Gôndola / Supermercado',
    defaultElements: ['text', 'price', 'barcode', 'qrcode', 'line', 'rectangle', 'image'],
    defaultFields: [
      { fieldId: 'produto.descricao', fieldKey: 'produto.descricao', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.preco', fieldKey: 'produto.preco', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.precoPromocional', fieldKey: 'produto.precoPromocional', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.ean', fieldKey: 'produto.ean', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.sku', fieldKey: 'produto.sku', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.unidade', fieldKey: 'produto.unidade', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.marca', fieldKey: 'produto.marca', availableForManual: true, availableForIntegration: true },
      { fieldId: 'lote.numero', fieldKey: 'lote.numero', availableForManual: true, availableForIntegration: true },
      { fieldId: 'lote.validade', fieldKey: 'lote.validade', availableForManual: true, availableForIntegration: true },
      { fieldId: 'empresa.nomeFantasia', fieldKey: 'empresa.nomeFantasia', availableForManual: true, availableForIntegration: true },
    ],
    operationalForOperator: true,
    roleNichesDefault: ['ADMIN', 'DESIGNER', 'SUPERVISOR', 'OPERATOR'],
  },

  // 2. Produto / Código de Barras
  'niche-produto': {
    nicheId: 'niche-produto',
    name: 'Produto / Código de Barras',
    defaultElements: ['text', 'price', 'barcode', 'qrcode', 'line', 'rectangle', 'image'],
    defaultFields: [
      { fieldId: 'produto.descricao', fieldKey: 'produto.descricao', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.preco', fieldKey: 'produto.preco', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.ean', fieldKey: 'produto.ean', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.sku', fieldKey: 'produto.sku', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.unidade', fieldKey: 'produto.unidade', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.marca', fieldKey: 'produto.marca', availableForManual: true, availableForIntegration: true },
      { fieldId: 'lote.numero', fieldKey: 'lote.numero', availableForManual: true, availableForIntegration: true },
      { fieldId: 'lote.validade', fieldKey: 'lote.validade', availableForManual: true, availableForIntegration: true },
    ],
    operationalForOperator: true,
    roleNichesDefault: ['ADMIN', 'DESIGNER', 'SUPERVISOR', 'OPERATOR'],
  },

  // 3. Logística / Expedição / E-commerce (price OFF)
  'niche-logistica': {
    nicheId: 'niche-logistica',
    name: 'Logística / Expedição / E-commerce',
    defaultElements: ['text', 'barcode', 'qrcode', 'line', 'rectangle', 'image'],
    defaultFields: [
      { fieldId: 'produto.descricao', fieldKey: 'produto.descricao', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.gtin', fieldKey: 'produto.gtin', availableForManual: true, availableForIntegration: true },
      { fieldId: 'lote.numero', fieldKey: 'lote.numero', availableForManual: true, availableForIntegration: true },
      { fieldId: 'lote.validade', fieldKey: 'lote.validade', availableForManual: true, availableForIntegration: true },
      { fieldId: 'quantidade', fieldKey: 'quantidade', availableForManual: true, availableForIntegration: true },
      { fieldId: 'unidade', fieldKey: 'unidade', availableForManual: true, availableForIntegration: true },
      { fieldId: 'sscc', fieldKey: 'sscc', availableForManual: true, availableForIntegration: true },
      { fieldId: 'destino', fieldKey: 'destino', availableForManual: true, availableForIntegration: true },
      { fieldId: 'origem', fieldKey: 'origem', availableForManual: true, availableForIntegration: true },
    ],
    operationalForOperator: true,
    roleNichesDefault: ['ADMIN', 'DESIGNER', 'SUPERVISOR', 'OPERATOR'],
  },

  // 4. Farmácia / Medicamentos (price OFF)
  'niche-farmacia': {
    nicheId: 'niche-farmacia',
    name: 'Farmácia / Medicamentos',
    defaultElements: ['text', 'barcode', 'qrcode', 'line', 'rectangle', 'image'],
    defaultFields: [
      { fieldId: 'medicamento.nome', fieldKey: 'medicamento.nome', availableForManual: true, availableForIntegration: true },
      { fieldId: 'medicamento.principioAtivo', fieldKey: 'medicamento.principioAtivo', availableForManual: true, availableForIntegration: true },
      { fieldId: 'medicamento.lote', fieldKey: 'medicamento.lote', availableForManual: true, availableForIntegration: true },
      { fieldId: 'medicamento.validade', fieldKey: 'medicamento.validade', availableForManual: true, availableForIntegration: true },
      { fieldId: 'medicamento.registro', fieldKey: 'medicamento.registro', availableForManual: true, availableForIntegration: true },
      { fieldId: 'medicamento.codigo', fieldKey: 'medicamento.codigo', availableForManual: true, availableForIntegration: true },
      { fieldId: 'fabricante', fieldKey: 'fabricante', availableForManual: true, availableForIntegration: true },
    ],
    operationalForOperator: false,
    roleNichesDefault: ['ADMIN', 'DESIGNER', 'SUPERVISOR'],
  },

  // 5. Hospital / Identificação (price OFF)
  'niche-hospital': {
    nicheId: 'niche-hospital',
    name: 'Hospital / Identificação',
    defaultElements: ['text', 'barcode', 'qrcode', 'line', 'rectangle', 'image'],
    defaultFields: [
      { fieldId: 'paciente.nome', fieldKey: 'paciente.nome', availableForManual: true, availableForIntegration: true },
      { fieldId: 'paciente.id', fieldKey: 'paciente.id', availableForManual: true, availableForIntegration: true },
      { fieldId: 'paciente.dataNascimento', fieldKey: 'paciente.dataNascimento', availableForManual: true, availableForIntegration: true },
      { fieldId: 'paciente.sexo', fieldKey: 'paciente.sexo', availableForManual: true, availableForIntegration: true },
      { fieldId: 'atendimento.id', fieldKey: 'atendimento.id', availableForManual: true, availableForIntegration: true },
      { fieldId: 'atendimento.setor', fieldKey: 'atendimento.setor', availableForManual: true, availableForIntegration: true },
      { fieldId: 'atendimento.leito', fieldKey: 'atendimento.leito', availableForManual: true, availableForIntegration: true },
      { fieldId: 'hospital.nome', fieldKey: 'hospital.nome', availableForManual: true, availableForIntegration: true },
    ],
    operationalForOperator: false,
    roleNichesDefault: ['ADMIN', 'DESIGNER', 'SUPERVISOR'],
  },

  // 6. Laboratório (price OFF)
  'niche-laboratorio': {
    nicheId: 'niche-laboratorio',
    name: 'Laboratório',
    defaultElements: ['text', 'barcode', 'qrcode', 'line', 'rectangle', 'image'],
    defaultFields: [
      { fieldId: 'paciente.nome', fieldKey: 'paciente.nome', availableForManual: true, availableForIntegration: true },
      { fieldId: 'paciente.id', fieldKey: 'paciente.id', availableForManual: true, availableForIntegration: true },
      { fieldId: 'coleta.id', fieldKey: 'coleta.id', availableForManual: true, availableForIntegration: true },
      { fieldId: 'coleta.dataHora', fieldKey: 'coleta.dataHora', availableForManual: true, availableForIntegration: true },
      { fieldId: 'amostra.tipo', fieldKey: 'amostra.tipo', availableForManual: true, availableForIntegration: true },
      { fieldId: 'exame.codigo', fieldKey: 'exame.codigo', availableForManual: true, availableForIntegration: true },
      { fieldId: 'exame.nome', fieldKey: 'exame.nome', availableForManual: true, availableForIntegration: true },
      { fieldId: 'laboratorio.nome', fieldKey: 'laboratorio.nome', availableForManual: true, availableForIntegration: true },
    ],
    operationalForOperator: false,
    roleNichesDefault: ['ADMIN', 'DESIGNER', 'SUPERVISOR'],
  },

  // 7. Banco de Sangue / Hemoterapia (price OFF)
  'niche-sangue': {
    nicheId: 'niche-sangue',
    name: 'Banco de Sangue / Hemoterapia',
    defaultElements: ['text', 'barcode', 'qrcode', 'line', 'rectangle', 'image'],
    defaultFields: [
      { fieldId: 'paciente.nome', fieldKey: 'paciente.nome', availableForManual: true, availableForIntegration: true },
      { fieldId: 'paciente.id', fieldKey: 'paciente.id', availableForManual: true, availableForIntegration: true },
      { fieldId: 'paciente.dataNascimento', fieldKey: 'paciente.dataNascimento', availableForManual: true, availableForIntegration: true },
      { fieldId: 'paciente.sexo', fieldKey: 'paciente.sexo', availableForManual: true, availableForIntegration: true },
      { fieldId: 'atendimento.id', fieldKey: 'atendimento.id', availableForManual: true, availableForIntegration: true },
      { fieldId: 'atendimento.setor', fieldKey: 'atendimento.setor', availableForManual: true, availableForIntegration: true },
      { fieldId: 'atendimento.leito', fieldKey: 'atendimento.leito', availableForManual: true, availableForIntegration: true },
      { fieldId: 'hospital.nome', fieldKey: 'hospital.nome', availableForManual: true, availableForIntegration: true },
    ],
    operationalForOperator: false,
    roleNichesDefault: ['ADMIN', 'DESIGNER', 'SUPERVISOR'],
  },

  // 8. Joalheria / Ótica
  'niche-joalheria': {
    nicheId: 'niche-joalheria',
    name: 'Joalheria / Ótica',
    defaultElements: ['text', 'price', 'barcode', 'qrcode', 'line', 'rectangle', 'image'],
    defaultFields: [
      { fieldId: 'produto.descricao', fieldKey: 'produto.descricao', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.preco', fieldKey: 'produto.preco', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.sku', fieldKey: 'produto.sku', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.marca', fieldKey: 'produto.marca', availableForManual: true, availableForIntegration: true },
    ],
    operationalForOperator: false,
    roleNichesDefault: ['ADMIN', 'DESIGNER', 'SUPERVISOR'],
  },

  // 9. Confecção / Vestuário
  'niche-confeccao': {
    nicheId: 'niche-confeccao',
    name: 'Confecção / Vestuário',
    defaultElements: ['text', 'price', 'barcode', 'qrcode', 'line', 'rectangle', 'image'],
    defaultFields: [
      { fieldId: 'produto.descricao', fieldKey: 'produto.descricao', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.preco', fieldKey: 'produto.preco', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.ean', fieldKey: 'produto.ean', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.sku', fieldKey: 'produto.sku', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.marca', fieldKey: 'produto.marca', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.unidade', fieldKey: 'produto.unidade', availableForManual: true, availableForIntegration: true },
    ],
    operationalForOperator: false,
    roleNichesDefault: ['ADMIN', 'DESIGNER', 'SUPERVISOR'],
  },

  // 10. Patrimônio / Inventário (price OFF)
  'niche-patrimonio': {
    nicheId: 'niche-patrimonio',
    name: 'Patrimônio / Inventário',
    defaultElements: ['text', 'barcode', 'qrcode', 'line', 'rectangle', 'image'],
    defaultFields: [
      { fieldId: 'produto.codigo', fieldKey: 'produto.codigo', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.descricao', fieldKey: 'produto.descricao', availableForManual: true, availableForIntegration: true },
      { fieldId: 'lote.numero', fieldKey: 'lote.numero', availableForManual: true, availableForIntegration: true },
      { fieldId: 'operador', fieldKey: 'operador', availableForManual: true, availableForIntegration: true },
      { fieldId: 'linhaProducao', fieldKey: 'linhaProducao', availableForManual: true, availableForIntegration: true },
    ],
    operationalForOperator: false,
    roleNichesDefault: ['ADMIN', 'DESIGNER', 'SUPERVISOR'],
  },

  // 11. Uso Geral (price OFF)
  'niche-uso-geral': {
    nicheId: 'niche-uso-geral',
    name: 'Uso Geral',
    defaultElements: ['text', 'barcode', 'qrcode', 'line', 'rectangle', 'image'],
    defaultFields: [
      { fieldId: 'produto.descricao', fieldKey: 'produto.descricao', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.sku', fieldKey: 'produto.sku', availableForManual: true, availableForIntegration: true },
      { fieldId: 'produto.marca', fieldKey: 'produto.marca', availableForManual: true, availableForIntegration: true },
      { fieldId: 'lote.numero', fieldKey: 'lote.numero', availableForManual: true, availableForIntegration: true },
      { fieldId: 'lote.validade', fieldKey: 'lote.validade', availableForManual: true, availableForIntegration: true },
      { fieldId: 'empresa.nomeFantasia', fieldKey: 'empresa.nomeFantasia', availableForManual: true, availableForIntegration: true },
    ],
    operationalForOperator: true,
    roleNichesDefault: ['ADMIN', 'DESIGNER', 'SUPERVISOR', 'OPERATOR'],
  },
};

export function getDefaultNicheProfile(nicheId?: string): DefaultNicheProfilePreset | undefined {
  if (!nicheId) return DEFAULT_NICHE_PROFILES['niche-gondola'];
  if (DEFAULT_NICHE_PROFILES[nicheId]) return DEFAULT_NICHE_PROFILES[nicheId];
  // Fallback by slug
  const entry = Object.values(DEFAULT_NICHE_PROFILES).find(
    (p) => p.nicheId === nicheId || p.nicheId === `niche-${nicheId}`
  );
  return entry || DEFAULT_NICHE_PROFILES['niche-gondola'];
}

export function getAllDefaultNicheProfiles(): DefaultNicheProfilePreset[] {
  return Object.values(DEFAULT_NICHE_PROFILES);
}
