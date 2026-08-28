import {
  type ElementBinding,
} from './canonicalFields.js';
import type { VisibilityRule, LabelDocument } from './types.js';
import { normalizeNicheId, type CanonicalNicheId } from './niches.js';

// MOCK DATASETS CANÔNICOS POR NICHO (PACOTE 4.5)
export const MOCK_NICHE_DATASETS: Record<CanonicalNicheId, Record<string, string>> = {
  retail: {
    'produto.codigo': '789123',
    'produto.descricao': 'REFRIGERANTE COCA-COLA 2L',
    'produto.preco': '9.99',
    'produto.precoPromocional': '7.99',
    'produto.ean': '7894900011517',
    'produto.sku': 'SKU-789123',
    'produto.unidade': 'UN',
    'produto.marca': 'COCA-COLA',
    'produto.promocao': '7.99',
    'produto.promocao.preco': '7.99',
    'retail.code': '789123',
    'retail.description': 'REFRIGERANTE COCA-COLA 2L',
    'retail.price': '9.99',
    'retail.promoPrice': '7.99',
    'retail.ean': '7894900011517',
    'retail.unit': 'UN',
    'retail.brand': 'COCA-COLA',
    'empresa.nomeFantasia': 'SUPERMERCADO WR',
  },
  hospital: {
    'paciente.nome': 'MARIA APARECIDA SILVA',
    'paciente.id': 'PAC-847291',
    'paciente.dataNascimento': '14/03/1982',
    'paciente.sexo': 'F',
    'atendimento.id': 'ATD-2026-9041',
    'atendimento.setor': 'ENFERMARIA',
    'atendimento.leito': '304-B',
    'hospital.nome': 'HOSPITAL SANTA CRUZ',
    'hospital.patientName': 'MARIA APARECIDA SILVA',
    'hospital.medicalRecord': 'PAC-847291',
    'hospital.bed': 'LEITO 304-B',
    'hospital.doctor': 'DRA. CARLA MENDES',
    'hospital.bloodType': 'O POSITIVO (O+)',
  },
  laboratory: {
    'paciente.nome': 'JOÃO CARLOS PEREIRA',
    'paciente.id': 'PAC-49102',
    'coleta.id': 'COL-88412',
    'coleta.dataHora': '28/08/2026 08:35',
    'amostra.tipo': 'SORO / SANGUE TOTAL',
    'exame.codigo': 'HEM-01',
    'exame.nome': 'HEMOGRAMA COMPLETO',
    'laboratorio.nome': 'LABORATÓRIO CENTRAL',
    'laboratory.patientName': 'JOÃO CARLOS PEREIRA',
    'laboratory.sampleId': 'COL-88412',
  },
  logistics: {
    'produto.descricao': 'CAIXA PRODUTO ACABADO',
    'produto.gtin': '07891234567890',
    'lote.numero': 'LT260828A',
    'lote.validade': '28/02/2027',
    'quantidade': '50',
    'unidade': 'CX',
    'sscc': '178912345678901234',
    'destino': 'CENTRO DE DISTRIBUIÇÃO SP',
    'origem': 'FÁBRICA MATRIZ',
    'logistics.orderNumber': 'PED-99482',
    'logistics.trackingCode': 'BR884910293PT',
    'logistics.recipient': 'JOÃO PEDRO OLIVEIRA',
  },
  industry: {
    'produto.codigo': 'PRD-8840',
    'produto.descricao': 'PLACA ELETRÔNICA PRINCIPAL',
    'lote.numero': 'LT-IND-2026',
    'ordemProducao': 'OP-4491',
    'dataFabricacao': '28/08/2026',
    'dataValidade': '28/08/2031',
    'operador': 'MARCOS SOUZA',
    'linhaProducao': 'LINHA 02 - MONTAGEM',
  },
  food: {
    'produto.descricao': 'QUEIJO MUSSARELA FATIADO',
    'lote.numero': 'LT-ALM-102',
    'dataFabricacao': '28/08/2026',
    'dataValidade': '15/09/2026',
    'peso': '0.450 kg',
    'preco': '18.90',
    'ingredientes': 'Leite pasteurizado, fermento lácteo, sal e coalho.',
  },
  pharmacy: {
    'medicamento.nome': 'AMOXICILINA 500MG',
    'medicamento.principioAtivo': 'AMOXICILINA TRI-HIDRATADA',
    'medicamento.lote': 'FAR-2026-X',
    'medicamento.validade': '31/12/2027',
    'medicamento.registro': 'MS 1.0043.0912',
    'medicamento.codigo': '7896004701122',
    'fabricante': 'FARMACÊUTICA BRASIL S.A.',
  },
};

// Dicionário Legado Unificado para Retrocompatibilidade
export const MOCK_PRODUCT_DATA: Record<string, string> = {
  ...MOCK_NICHE_DATASETS.retail,
  ...MOCK_NICHE_DATASETS.hospital,
  ...MOCK_NICHE_DATASETS.laboratory,
  ...MOCK_NICHE_DATASETS.logistics,
  ...MOCK_NICHE_DATASETS.industry,
  ...MOCK_NICHE_DATASETS.food,
  ...MOCK_NICHE_DATASETS.pharmacy,
  'system.printDateTime': '28/08/2026 14:30',
  'system.printDate': '28/08/2026',
  'system.printTime': '14:30',
};

export function getMockDataByNiche(nicheId?: string): Record<string, string> {
  const canonicalId = normalizeNicheId(nicheId);
  return {
    ...MOCK_NICHE_DATASETS[canonicalId],
    'system.printDateTime': '28/08/2026 14:30',
    'system.printDate': '28/08/2026',
    'system.printTime': '14:30',
  };
}

export function getRequiredIntegrationFields(doc?: LabelDocument | null): string[] {
  if (!doc || !doc.elements) return [];
  const fields = new Set<string>();
  for (const el of doc.elements) {
    if (el.binding && el.binding.source === 'integration') {
      const fieldId = el.binding.fieldId || el.binding.field;
      if (fieldId) fields.add(fieldId);
    } else if ('field' in el && typeof (el as any).field === 'string' && (el as any).field) {
      fields.add((el as any).field);
    }
  }
  return Array.from(fields);
}

export interface ResolveBindingContext {
  mode?: 'preview' | 'print';
  timestamp?: Date;
  catalogData?: Record<string, string>;
  nicheId?: string;
}

export function resolveFieldValue(
  bindingOrField?: ElementBinding | string,
  context: ResolveBindingContext | Record<string, string> = {}
): string | undefined {
  if (!bindingOrField) return undefined;

  let fieldId: string | undefined;
  let source: 'integration' | 'system' | 'manual' | undefined;

  if (typeof bindingOrField === 'string') {
    fieldId = bindingOrField;
  } else {
    source = bindingOrField.source;
    fieldId = bindingOrField.fieldId || bindingOrField.field;
    if (source === 'manual') {
      return bindingOrField.value;
    }
  }

  if (!fieldId) return undefined;

  // Extrair dicionário de dados
  let dataMap: Record<string, string> = MOCK_PRODUCT_DATA;
  if ('catalogData' in context && typeof context.catalogData === 'object' && context.catalogData !== null) {
    dataMap = context.catalogData;
  } else if ('nicheId' in context && typeof context.nicheId === 'string' && context.nicheId) {
    dataMap = getMockDataByNiche(context.nicheId);
  } else if (typeof context === 'object' && context !== null && !('mode' in context) && !('catalogData' in context)) {
    dataMap = context as Record<string, string>;
  }

  const getTimeObj = (): Date => {
    if ('timestamp' in context && context.timestamp instanceof Date) {
      return context.timestamp;
    }
    return new Date();
  };

  // Resolução de datas de sistema
  if (fieldId === 'system.printDateTime') {
    return dataMap['system.printDateTime'] || getTimeObj().toLocaleString('pt-BR');
  }
  if (fieldId === 'system.printDate') {
    return dataMap['system.printDate'] || getTimeObj().toLocaleDateString('pt-BR');
  }
  if (fieldId === 'system.printTime') {
    return dataMap['system.printTime'] || getTimeObj().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // Resolução do dicionário de dados
  if (dataMap[fieldId] !== undefined) {
    return dataMap[fieldId];
  }

  // Fallbacks de Aliases Legados
  if (fieldId === 'produto.preco' && dataMap['retail.price']) return dataMap['retail.price'];
  if (fieldId === 'produto.descricao' && dataMap['retail.description']) return dataMap['retail.description'];
  if (fieldId === 'produto.ean' && dataMap['retail.ean']) return dataMap['retail.ean'];

  return undefined;
}

export function evaluateVisibilityRule(
  rule?: VisibilityRule,
  context: ResolveBindingContext | Record<string, string> = {}
): boolean {
  if (!rule || !rule.field) return true;

  const actualValue = resolveFieldValue(rule.field, context) || '';
  const expectedValue = rule.value || '';

  switch (rule.operator) {
    case '=':
      return actualValue.toLowerCase() === expectedValue.toLowerCase();
    case '!=':
      return actualValue.toLowerCase() !== expectedValue.toLowerCase();
    case '>':
      return parseFloat(actualValue) > parseFloat(expectedValue);
    case '<':
      return parseFloat(actualValue) < parseFloat(expectedValue);
    case '>=':
      return parseFloat(actualValue) >= parseFloat(expectedValue);
    case '<=':
      return parseFloat(actualValue) <= parseFloat(expectedValue);
    case 'empty':
      return actualValue.trim() === '';
    case 'not_empty':
      return actualValue.trim() !== '';
    default:
      return true;
  }
}
