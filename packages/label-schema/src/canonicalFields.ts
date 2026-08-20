export interface IntegrationFieldDefinition {
  id: string;
  namespace: string;
  label: string;
  type?: 'string' | 'number' | 'date' | 'datetime' | 'currency' | 'boolean' | 'url' | 'code' | string;
  category: string; // Categoria aberta (string livre, não union fechada)
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
  { id: 'retail.code', namespace: 'retail', label: 'Código do Produto', category: 'Produto', example: '789123', searchable: true, printable: true },
  { id: 'retail.description', namespace: 'retail', label: 'Descrição do Produto', category: 'Produto', example: 'REFRIGERANTE COCA-COLA 2L', searchable: true, printable: true },
  { id: 'retail.ean', namespace: 'retail', label: 'Código EAN-13', category: 'Produto', type: 'code', example: '7894900011517', searchable: true, printable: true },
  { id: 'retail.price', namespace: 'retail', label: 'Preço Normal (R$)', category: 'Preço', type: 'currency', example: '9.99', searchable: false, printable: true },
  { id: 'retail.promoPrice', namespace: 'retail', label: 'Preço Promocional (R$)', category: 'Promoção', type: 'currency', example: '7.99', searchable: false, printable: true },
  { id: 'retail.unit', namespace: 'retail', label: 'Unidade Comercial', category: 'Produto', example: 'UN', searchable: false, printable: true },
  { id: 'retail.brand', namespace: 'retail', label: 'Marca / Fabricante', category: 'Produto', example: 'COCA-COLA', searchable: true, printable: true },

  // Aliases Legados para Retrocompatibilidade
  { id: 'produto.codigo', namespace: 'produto', label: 'Código do Produto (Legado)', category: 'Produto Legado', example: '789123' },
  { id: 'produto.descricao', namespace: 'produto', label: 'Descrição Curta (Legado)', category: 'Produto Legado', example: 'REFRIGERANTE COCA-COLA 2L' },
  { id: 'produto.ean', namespace: 'produto', label: 'Código EAN-13 (Legado)', category: 'Produto Legado', example: '7894900011517' },
  { id: 'produto.preco', namespace: 'produto', label: 'Preço Normal (Legado)', category: 'Preço Legado', example: '9.99' },
  { id: 'produto.promocao.preco', namespace: 'produto', label: 'Preço Promo (Legado)', category: 'Promoção Legada', example: '7.99' },
  { id: 'produto.promocao', namespace: 'produto', label: 'Promoção (Legado)', category: 'Promoção Legada', example: '7.99' },
  { id: 'empresa.nomeFantasia', namespace: 'empresa', label: 'Nome Fantasia (Legado)', category: 'Empresa Legada', example: 'SUPERMERCADO WR' },
];

export const DEFAULT_HOSPITAL_CATALOG: IntegrationFieldDefinition[] = [
  { id: 'hospital.patientName', namespace: 'hospital', label: 'Nome do Paciente', category: 'Paciente', example: 'MARIA DA SILVA SOUZA', searchable: true, printable: true },
  { id: 'hospital.medicalRecord', namespace: 'hospital', label: 'Prontuário / Registro', category: 'Paciente', type: 'code', example: 'PAC-2026-8841', searchable: true, printable: true },
  { id: 'hospital.bed', namespace: 'hospital', label: 'Leito / Unidade', category: 'Atendimento', example: 'LEITO 402-A', searchable: true, printable: true },
  { id: 'hospital.doctor', namespace: 'hospital', label: 'Médico Responsável', category: 'Atendimento', example: 'DRA. CARLA MENDES', searchable: true, printable: true },
  { id: 'hospital.bloodType', namespace: 'hospital', label: 'Tipo Sanguíneo', category: 'Triagem', example: 'O POSITIVO (O+)', searchable: false, printable: true },
];

export const DEFAULT_LOGISTICS_CATALOG: IntegrationFieldDefinition[] = [
  { id: 'logistics.orderNumber', namespace: 'logistics', label: 'Número do Pedido', category: 'Expedição', type: 'code', example: 'PED-99482', searchable: true, printable: true },
  { id: 'logistics.trackingCode', namespace: 'logistics', label: 'Código de Rastreamento', category: 'Expedição', type: 'code', example: 'BR884910293PT', searchable: true, printable: true },
  { id: 'logistics.recipient', namespace: 'logistics', label: 'Destinatário', category: 'Entrega', example: 'JOÃO PEDRO OLIVEIRA', searchable: true, printable: true },
  { id: 'logistics.address', namespace: 'logistics', label: 'Endereço de Entrega', category: 'Entrega', example: 'AV. PAULISTA, 1000 - APTO 42', searchable: false, printable: true },
  { id: 'logistics.weightKg', namespace: 'logistics', label: 'Peso Total (kg)', category: 'Carga', type: 'number', example: '12.50', searchable: false, printable: true },
];

export const SYSTEM_FIELDS: SystemFieldDefinition[] = [
  { id: 'system.printDateTime', namespace: 'system', label: 'Data e Hora de Impressão', category: 'Sistema', example: '20/08/2026 12:35' },
];

export type CanonicalFieldDefinition = IntegrationFieldDefinition | SystemFieldDefinition;
export const CANONICAL_FIELDS: IntegrationFieldDefinition[] = DEFAULT_RETAIL_CATALOG;
