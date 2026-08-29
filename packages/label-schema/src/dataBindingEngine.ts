import {
  type ElementBinding,
} from './canonicalFields.js';
import type { VisibilityRule, LabelDocument } from './types.js';
import { normalizeOperationalProfileId, normalizeNicheId, type CanonicalNicheId } from './niches.js';

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
    'atendimento.dataAdmissao': '28/08/2026',
    'atendimento.medico': 'DR. ROBERTO ALVES',
    'hospital.nome': 'HOSPITAL SANTA CRUZ',
    'blood.donationId': 'DIN-2026-00491',
    'blood.productCode': 'E0384V00',
    'blood.productDescription': 'CONCENTRADO DE HEMÁCIAS',
    'blood.aboRh': 'O POSITIVO (O+)',
    'blood.expirationDateTime': '15/09/2026 23:59',
    'blood.facilityId': 'HEMOCENTRO CENTRAL',
    'blood.collectionDateTime': '28/08/2026 09:00',
    'blood.donorId': 'DOA-99412',
    'blood.volume': '350',
  },
  laboratory: {
    'paciente.nome': 'JOÃO CARLOS PEREIRA',
    'paciente.id': 'PAC-49102',
    'coleta.id': 'COL-88412',
    'coleta.dataHora': '28/08/2026 08:35',
    'amostra.tipo': 'SORO / SANGUE TOTAL',
    'exame.codigo': 'HEM-01',
    'exame.nome': 'HEMOGRAMA COMPLETO',
    'solicitante.setor': 'CLÍNICA MÉDICA',
    'laboratorio.nome': 'LABORATÓRIO CENTRAL',
  },
  logistics: {
    'expedicao.sscc': '378912345678901234',
    'expedicao.origem': 'CD MATRIZ SÃO PAULO',
    'expedicao.destino': 'FILIAL RIO DE JANEIRO',
    'expedicao.quantidade': '48',
    'produto.gtin': '7894900011517',
    'produto.descricao': 'CAIXA COMPONENTE ELETRÔNICO',
    'lote.numero': 'LOT-2026-08',
    'pedido.id': 'PED-994812',
    'rastreio.codigo': 'BR994812741SP',
    'sscc': '378912345678901234',
  },
  industry: {
    'ordemProducao': 'OP-2026-00491',
    'operador': 'CARLOS EDUARDO',
    'lote.numero': 'LOT-IND-8841',
    'produto.sku': 'PECA-MET-402',
    'asset.id': 'PAT-994812',
    'asset.description': 'NOTEBOOK DELL LATITUDE 5420',
    'asset.serialNumber': 'SN-994812741',
    'asset.location': 'SALA 302 - TI',
    'asset.department': 'TECNOLOGIA DA INFORMAÇÃO',
    'asset.responsible': 'RICARDO SILVA',
    'asset.acquisitionDate': '15/01/2025',
    'asset.manufacturer': 'DELL',
    'asset.model': 'LATITUDE 5420',
    'asset.status': 'ATIVO',
  },
  food: {
    'produto.descricao': 'QUEIJO MINAS FRESCAL 500G',
    'produto.preco': '18.90',
    'produto.precoPromocional': '15.90',
    'dataFabricacao': '25/08/2026',
    'dataValidade': '10/09/2026',
    'pesoLiquido': '0,500 kg',
    'ingredientes': 'LEITE PASTEURIZADO, CLORETO DE SÓDIO, COAGULANTE E FERMENTO LÁCTEO.',
    'lote.numero': 'ALM-884',
  },
  pharmacy: {
    'medicamento.nome': 'PARACETAMOL 750MG',
    'medicamento.principioAtivo': 'PARACETAMOL',
    'medicamento.lote': 'FAR-2026-99',
    'medicamento.validade': '12/2028',
    'medicamento.registro': 'MS 1.0043.0912',
    'medicamento.dosagem': '1 COMPRIMIDO A CADA 6 HORAS',
    'medicamento.codigo': '7891234567890',
    'fabricante': 'LABORATÓRIO FARMACÊUTICO LTDA',
    'produto.preco': '12.50',
    'produto.precoPromocional': '9.90',
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
  const canonicalId = normalizeOperationalProfileId(nicheId);
  return {
    ...(MOCK_NICHE_DATASETS[canonicalId] || MOCK_NICHE_DATASETS.retail),
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
