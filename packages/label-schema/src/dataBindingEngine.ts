import {
  DEFAULT_RETAIL_CATALOG,
  type ElementBinding,
} from './canonicalFields.js';
import type { VisibilityRule } from './types.js';

export const MOCK_PRODUCT_DATA: Record<string, string> = {
  // Retail (Varejo)
  'retail.code': '789123',
  'retail.description': 'REFRIGERANTE COCA-COLA 2L',
  'retail.ean': '7894900011517',
  'retail.price': '9.99',
  'retail.promoPrice': '7.99',
  'retail.unit': 'UN',
  'retail.brand': 'COCA-COLA',

  // Hospital (Saúde)
  'hospital.patientName': 'MARIA DA SILVA SOUZA',
  'hospital.medicalRecord': 'PAC-2026-8841',
  'hospital.bed': 'LEITO 402-A',
  'hospital.doctor': 'DRA. CARLA MENDES',
  'hospital.bloodType': 'O POSITIVO (O+)',

  // Logistics (Logística)
  'logistics.orderNumber': 'PED-99482',
  'logistics.trackingCode': 'BR884910293PT',
  'logistics.recipient': 'JOÃO PEDRO OLIVEIRA',
  'logistics.address': 'AV. PAULISTA, 1000 - APTO 42',
  'logistics.weightKg': '12.50',

  // Legado (Compatibilidade)
  'produto.codigo': '789123',
  'produto.descricao': 'REFRIGERANTE COCA-COLA 2L',
  'produto.descricaoLonga': 'REFRIGERANTE COCA-COLA PET 2 LITROS - EMBALAGEM FAMÍLIA',
  'produto.ean': '7894900011517',
  'produto.unidade': 'UN',
  'produto.preco': '9.99',
  'produto.promocao': '7.99',
  'produto.promocao.preco': '7.99',
  'produto.promocao.inicio': '10/08/2026',
  'produto.promocao.fim': '20/08/2026',
  'empresa.nomeFantasia': 'SUPERMERCADO WR',
  'empresa.nomeFilial': 'MATRIZ SÃO PAULO',
  'impressao.data': '15/08/2026',
  'impressao.hora': '15:30',
  'system.printDateTime': '20/08/2026 12:35',
  'system.printDate': '20/08/2026',
  'system.printTime': '12:35',
};

export interface ResolveBindingContext {
  mode?: 'preview' | 'print';
  timestamp?: Date;
  catalogData?: Record<string, string>;
}

// Resolvedor Universal de Campos da Integração e do Sistema (system.printDateTime)
export function resolveFieldValue(
  bindingOrField?: ElementBinding | string,
  context: ResolveBindingContext | Record<string, string> = {}
): string | undefined {
  if (!bindingOrField) return undefined;

  let fieldId: string | undefined;
  let source: 'integration' | 'system' | 'manual' | undefined;
  let format: string | undefined;
  let manualVal: string | undefined;

  if (typeof bindingOrField === 'string') {
    fieldId = bindingOrField;
    if (fieldId.startsWith('system.')) {
      source = 'system';
    } else {
      source = 'integration';
    }
  } else {
    source = bindingOrField.source;
    fieldId = bindingOrField.fieldId || bindingOrField.field;
    format = bindingOrField.format;
    manualVal = bindingOrField.value;
  }

  if (source === 'manual') {
    return manualVal;
  }

  let mode: 'preview' | 'print' = 'preview';
  let timestamp: Date | undefined;
  let catalogData: Record<string, string> = MOCK_PRODUCT_DATA;

  if (context && typeof context === 'object') {
    if ('catalogData' in context || 'mode' in context || 'timestamp' in context) {
      const ctx = context as ResolveBindingContext;
      mode = ctx.mode || 'preview';
      timestamp = ctx.timestamp;
      catalogData = ctx.catalogData || MOCK_PRODUCT_DATA;
    } else {
      catalogData = context as Record<string, string>;
    }
  }

  // 1. SISTEMA (SYSTEM NAMESPACE IS RESERVED AND PROTECTED: system.printDateTime)
  if (source === 'system' || (fieldId && fieldId.startsWith('system.'))) {
    // PROTEÇÃO: O namespace system.* NUNCA pode ser sobrescrito pelo mock da integração!
    const effectiveDate = timestamp || new Date();
    const resolvedFormat = format || (fieldId === 'system.printDate' ? 'date' : fieldId === 'system.printTime' ? 'time' : 'datetime');

    const dd = String(effectiveDate.getDate()).padStart(2, '0');
    const mm = String(effectiveDate.getMonth() + 1).padStart(2, '0');
    const yyyy = effectiveDate.getFullYear();
    const hh = String(effectiveDate.getHours()).padStart(2, '0');
    const min = String(effectiveDate.getMinutes()).padStart(2, '0');

    if (resolvedFormat === 'date') {
      return `${dd}/${mm}/${yyyy}`;
    }
    if (resolvedFormat === 'time') {
      return `${hh}:${min}`;
    }
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }

  // 2. INTEGRAÇÃO
  if (fieldId) {
    if (catalogData[fieldId] !== undefined) {
      return catalogData[fieldId];
    }
    if (MOCK_PRODUCT_DATA[fieldId] !== undefined) {
      return MOCK_PRODUCT_DATA[fieldId];
    }
  }

  return manualVal;
}

// Avaliador Seguro de Regras de Visibilidade Condicional
export function evaluateVisibilityRule(
  rule?: VisibilityRule | null,
  data: Record<string, string> = MOCK_PRODUCT_DATA
): boolean {
  if (!rule || !rule.field) return true;

  const resolved = resolveFieldValue(rule.field, data);
  const rawVal = resolved !== undefined ? String(resolved).trim() : '';
  const targetVal = String(rule.value || '').trim();

  switch (rule.operator) {
    case '=':
      return rawVal === targetVal;
    case '!=':
      return rawVal !== targetVal;
    case '>': {
      const numRaw = parseFloat(rawVal);
      const numTarget = parseFloat(targetVal);
      if (!isNaN(numRaw) && !isNaN(numTarget)) return numRaw > numTarget;
      return rawVal > targetVal;
    }
    case '<': {
      const numRaw = parseFloat(rawVal);
      const numTarget = parseFloat(targetVal);
      if (!isNaN(numRaw) && !isNaN(numTarget)) return numRaw < numTarget;
      return rawVal < targetVal;
    }
    case '>=': {
      const numRaw = parseFloat(rawVal);
      const numTarget = parseFloat(targetVal);
      if (!isNaN(numRaw) && !isNaN(numTarget)) return numRaw >= numTarget;
      return rawVal >= targetVal;
    }
    case '<=': {
      const numRaw = parseFloat(rawVal);
      const numTarget = parseFloat(targetVal);
      if (!isNaN(numRaw) && !isNaN(numTarget)) return numRaw <= numTarget;
      return rawVal <= targetVal;
    }
    case 'empty':
      return rawVal === '' || rawVal === '0' || rawVal === '0.00';
    case 'not_empty':
      return rawVal !== '' && rawVal !== '0' && rawVal !== '0.00';
    default:
      return true;
  }
}
