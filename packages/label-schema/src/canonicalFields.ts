import { normalizeNicheId } from './niches.js';

export interface IntegrationFieldDefinition {
  id: string;
  namespace: string;
  label: string;
  type?: 'string' | 'number' | 'date' | 'datetime' | 'currency' | 'boolean' | 'url' | 'code' | string;
  category: string;
  searchable?: boolean;
  printable?: boolean;
  example: string;
  description?: string;
}

export interface SystemFieldDefinition {
  id: string;
  namespace: 'system';
  label: string;
  category: 'Sistema';
  example: string;
  format?: 'date' | 'datetime' | 'time';
}

export interface ElementBinding {
  source: 'integration' | 'system' | 'manual';
  namespace?: string;
  fieldId?: string;
  field?: string;
  value?: string;
  format?: 'date' | 'datetime' | 'time' | string;
}

export const DEFAULT_RETAIL_CATALOG: IntegrationFieldDefinition[] = [
  { id: 'produto.descricao', namespace: 'produto', label: 'Descrição do Produto', category: 'Produto', example: 'REFRIGERANTE COCA-COLA 2L', searchable: true, printable: true },
  { id: 'produto.preco', namespace: 'produto', label: 'Preço Normal (R$)', category: 'Preço', type: 'currency', example: '9.99', searchable: false, printable: true },
  { id: 'produto.precoPromocional', namespace: 'produto', label: 'Preço Promocional (R$)', category: 'Promoção', type: 'currency', example: '7.99', searchable: false, printable: true },
  { id: 'produto.ean', namespace: 'produto', label: 'Código EAN-13', category: 'Produto', type: 'code', example: '7894900011517', searchable: true, printable: true },
  { id: 'produto.sku', namespace: 'produto', label: 'SKU / Código Interno', category: 'Produto', type: 'code', example: 'SKU-789123', searchable: true, printable: true },
  { id: 'produto.unidade', namespace: 'produto', label: 'Unidade Comercial', category: 'Produto', example: 'UN', searchable: false, printable: true },
  { id: 'produto.marca', namespace: 'produto', label: 'Marca / Fabricante', category: 'Produto', example: 'COCA-COLA', searchable: true, printable: true },
  { id: 'retail.description', namespace: 'retail', label: 'Descrição (Retail)', category: 'Produto Varejo', example: 'REFRIGERANTE COCA-COLA 2L' },
  { id: 'retail.price', namespace: 'retail', label: 'Preço (Retail)', category: 'Preço Varejo', type: 'currency', example: '9.99' },
  { id: 'retail.promoPrice', namespace: 'retail', label: 'Preço Promo (Retail)', category: 'Promoção Varejo', type: 'currency', example: '7.99' },
  { id: 'retail.ean', namespace: 'retail', label: 'EAN-13 (Retail)', category: 'Produto Varejo', type: 'code', example: '7894900011517' },
  { id: 'empresa.nomeFantasia', namespace: 'empresa', label: 'Nome Fantasia Empresa', category: 'Empresa', example: 'SUPERMERCADO WR' },
];

export const DEFAULT_HOSPITAL_CATALOG: IntegrationFieldDefinition[] = [
  { id: 'paciente.nome', namespace: 'paciente', label: 'Nome do Paciente', category: 'Paciente', example: 'MARIA APARECIDA SILVA', searchable: true, printable: true },
  { id: 'paciente.id', namespace: 'paciente', label: 'ID / Prontuário Paciente', category: 'Paciente', type: 'code', example: 'PAC-847291', searchable: true, printable: true },
  { id: 'paciente.dataNascimento', namespace: 'paciente', label: 'Data de Nascimento', category: 'Paciente', type: 'date', example: '14/03/1982', searchable: false, printable: true },
  { id: 'paciente.sexo', namespace: 'paciente', label: 'Sexo', category: 'Paciente', example: 'F', searchable: false, printable: true },
  { id: 'atendimento.id', namespace: 'atendimento', label: 'Número Atendimento', category: 'Atendimento', type: 'code', example: 'ATD-2026-9041', searchable: true, printable: true },
  { id: 'atendimento.setor', namespace: 'atendimento', label: 'Setor / Ala', category: 'Atendimento', example: 'ENFERMARIA', searchable: true, printable: true },
  { id: 'atendimento.leito', namespace: 'atendimento', label: 'Leito / Quarto', category: 'Atendimento', example: '304-B', searchable: true, printable: true },
  { id: 'hospital.nome', namespace: 'hospital', label: 'Nome do Hospital', category: 'Instituição', example: 'HOSPITAL SANTA CRUZ', searchable: true, printable: true },
];

export const DEFAULT_LABORATORY_CATALOG: IntegrationFieldDefinition[] = [
  { id: 'paciente.nome', namespace: 'paciente', label: 'Nome do Paciente', category: 'Paciente', example: 'JOÃO CARLOS PEREIRA', searchable: true, printable: true },
  { id: 'paciente.id', namespace: 'paciente', label: 'ID Paciente / Prontuário', category: 'Paciente', type: 'code', example: 'PAC-49102', searchable: true, printable: true },
  { id: 'coleta.id', namespace: 'coleta', label: 'Código da Amostra / Coleta', category: 'Amostra', type: 'code', example: 'COL-88412', searchable: true, printable: true },
  { id: 'coleta.dataHora', namespace: 'coleta', label: 'Data e Hora da Coleta', category: 'Amostra', type: 'datetime', example: '28/08/2026 08:35', searchable: false, printable: true },
  { id: 'amostra.tipo', namespace: 'amostra', label: 'Tipo de Amostra', category: 'Amostra', example: 'SORO / SANGUE TOTAL', searchable: true, printable: true },
  { id: 'exame.codigo', namespace: 'exame', label: 'Código do Exame', category: 'Exame', type: 'code', example: 'HEM-01', searchable: true, printable: true },
  { id: 'exame.nome', namespace: 'exame', label: 'Nome do Exame', category: 'Exame', example: 'HEMOGRAMA COMPLETO', searchable: true, printable: true },
  { id: 'laboratorio.nome', namespace: 'laboratorio', label: 'Nome do Laboratório', category: 'Instituição', example: 'LABORATÓRIO CENTRAL', searchable: true, printable: true },
];

export const DEFAULT_LOGISTICS_CATALOG: IntegrationFieldDefinition[] = [
  { id: 'produto.descricao', namespace: 'produto', label: 'Descrição do Conteúdo', category: 'Carga', example: 'CAIXA PRODUTO ACABADO', searchable: true, printable: true },
  { id: 'produto.gtin', namespace: 'produto', label: 'GTIN / EAN do Volume', category: 'Carga', type: 'code', example: '07891234567890', searchable: true, printable: true },
  { id: 'lote.numero', namespace: 'lote', label: 'Número de Lote', category: 'Rastreabilidade', type: 'code', example: 'LT260828A', searchable: true, printable: true },
  { id: 'lote.validade', namespace: 'lote', label: 'Validade do Lote', category: 'Rastreabilidade', type: 'date', example: '28/02/2027', searchable: false, printable: true },
  { id: 'quantidade', namespace: 'expedicao', label: 'Quantidade no Volume', category: 'Carga', type: 'number', example: '50', searchable: false, printable: true },
  { id: 'unidade', namespace: 'expedicao', label: 'Unidade de Medida', category: 'Carga', example: 'CX', searchable: false, printable: true },
  { id: 'sscc', namespace: 'expedicao', label: 'Código SSCC GS1', category: 'GS1 Standard', type: 'code', example: '178912345678901234', searchable: true, printable: true },
  { id: 'destino', namespace: 'expedicao', label: 'Destino / CD Delivery', category: 'Logística', example: 'CENTRO DE DISTRIBUIÇÃO SP', searchable: true, printable: true },
  { id: 'origem', namespace: 'expedicao', label: 'Origem / Planta', category: 'Logística', example: 'FÁBRICA MATRIZ', searchable: true, printable: true },
];

export const DEFAULT_INDUSTRY_CATALOG: IntegrationFieldDefinition[] = [
  { id: 'produto.codigo', namespace: 'produto', label: 'Código do Componente/Item', category: 'Item Industrial', type: 'code', example: 'PRD-8840', searchable: true, printable: true },
  { id: 'produto.descricao', namespace: 'produto', label: 'Descrição da Peça/Item', category: 'Item Industrial', example: 'PLACA ELETRÔNICA PRINCIPAL', searchable: true, printable: true },
  { id: 'lote.numero', namespace: 'lote', label: 'Número do Lote Industrial', category: 'Rastreabilidade', type: 'code', example: 'LT-IND-2026', searchable: true, printable: true },
  { id: 'ordemProducao', namespace: 'producao', label: 'Ordem de Produção (OP)', category: 'Produção', type: 'code', example: 'OP-4491', searchable: true, printable: true },
  { id: 'dataFabricacao', namespace: 'producao', label: 'Data de Fabricação', category: 'Produção', type: 'date', example: '28/08/2026', searchable: false, printable: true },
  { id: 'dataValidade', namespace: 'producao', label: 'Data de Validade/Inspeção', category: 'Produção', type: 'date', example: '28/08/2031', searchable: false, printable: true },
  { id: 'operador', namespace: 'producao', label: 'Operador Responsável', category: 'Produção', example: 'MARCOS SOUZA', searchable: true, printable: true },
  { id: 'linhaProducao', namespace: 'producao', label: 'Linha / Posto de Trabalho', category: 'Produção', example: 'LINHA 02 - MONTAGEM', searchable: true, printable: true },
];

export const DEFAULT_FOOD_CATALOG: IntegrationFieldDefinition[] = [
  { id: 'produto.descricao', namespace: 'produto', label: 'Descrição do Alimento', category: 'Alimento', example: 'QUEIJO MUSSARELA FATIADO', searchable: true, printable: true },
  { id: 'lote.numero', namespace: 'lote', label: 'Lote de Produção', category: 'Rastreabilidade', type: 'code', example: 'LT-ALM-102', searchable: true, printable: true },
  { id: 'dataFabricacao', namespace: 'alimento', label: 'Data de Embalagem/Fabricação', category: 'Validade', type: 'date', example: '28/08/2026', searchable: false, printable: true },
  { id: 'dataValidade', namespace: 'alimento', label: 'Data de Validade', category: 'Validade', type: 'date', example: '15/09/2026', searchable: false, printable: true },
  { id: 'peso', namespace: 'alimento', label: 'Peso Líquido (kg)', category: 'Medição', example: '0.450 kg', searchable: false, printable: true },
  { id: 'preco', namespace: 'alimento', label: 'Preço Total (R$)', category: 'Preço', type: 'currency', example: '18.90', searchable: false, printable: true },
  { id: 'ingredientes', namespace: 'alimento', label: 'Resumo de Ingredientes / Alergênicos', category: 'Informação Nutricional', example: 'Leite pasteurizado, fermento lácteo, sal e coalho.', searchable: false, printable: true },
];

export const DEFAULT_PHARMACY_CATALOG: IntegrationFieldDefinition[] = [
  { id: 'medicamento.nome', namespace: 'medicamento', label: 'Nome do Medicamento', category: 'Medicamento', example: 'AMOXICILINA 500MG', searchable: true, printable: true },
  { id: 'medicamento.principioAtivo', namespace: 'medicamento', label: 'Princípio Ativo / Composição', category: 'Medicamento', example: 'AMOXICILINA TRI-HIDRATADA', searchable: true, printable: true },
  { id: 'medicamento.lote', namespace: 'medicamento', label: 'Lote Farmacêutico', category: 'Controle Sanitário', type: 'code', example: 'FAR-2026-X', searchable: true, printable: true },
  { id: 'medicamento.validade', namespace: 'medicamento', label: 'Validade do Medicamento', category: 'Controle Sanitário', type: 'date', example: '31/12/2027', searchable: false, printable: true },
  { id: 'medicamento.registro', namespace: 'medicamento', label: 'Registro ANVISA (MS)', category: 'Controle Sanitário', type: 'code', example: 'MS 1.0043.0912', searchable: true, printable: true },
  { id: 'medicamento.codigo', namespace: 'medicamento', label: 'Código / EAN Medicamento', category: 'Medicamento', type: 'code', example: '7896004701122', searchable: true, printable: true },
  { id: 'fabricante', namespace: 'medicamento', label: 'Laboratório Fabricante', category: 'Medicamento', example: 'FARMACÊUTICA BRASIL S.A.', searchable: true, printable: true },
];

export const SYSTEM_FIELDS: SystemFieldDefinition[] = [
  { id: 'system.printDateTime', namespace: 'system', label: 'Data e Hora de Impressão', category: 'Sistema', example: '28/08/2026 14:30' },
  { id: 'system.printDate', namespace: 'system', label: 'Data de Impressão', category: 'Sistema', example: '28/08/2026' },
  { id: 'system.printTime', namespace: 'system', label: 'Hora de Impressão', category: 'Sistema', example: '14:30' },
];

export function getIntegrationFieldsByNiche(nicheId?: string): IntegrationFieldDefinition[] {
  const norm = normalizeNicheId(nicheId);
  if (norm === 'hospital') return DEFAULT_HOSPITAL_CATALOG;
  if (norm === 'laboratory') return DEFAULT_LABORATORY_CATALOG;
  if (norm === 'logistics') return DEFAULT_LOGISTICS_CATALOG;
  if (norm === 'industry') return DEFAULT_INDUSTRY_CATALOG;
  if (norm === 'food') return DEFAULT_FOOD_CATALOG;
  if (norm === 'pharmacy') return DEFAULT_PHARMACY_CATALOG;
  return DEFAULT_RETAIL_CATALOG;
}

export type CanonicalFieldDefinition = IntegrationFieldDefinition | SystemFieldDefinition;
export const CANONICAL_FIELDS: IntegrationFieldDefinition[] = DEFAULT_RETAIL_CATALOG;
