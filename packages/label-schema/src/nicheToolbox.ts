import { CanonicalNicheId, normalizeNicheId, normalizeOperationalProfileId } from './niches.js';

export interface NicheToolItem {
  toolId: string;
  label: string;
  iconName: string;
  elementType: 'text' | 'price' | 'barcode' | 'qrcode' | 'shape' | 'image' | 'line' | 'rectangle';
  defaultProperties?: Record<string, any>;
  bindingPreset?: {
    source: 'integration' | 'system';
    fieldId?: string;
    namespace?: string;
  };
  inspectorProfile?: string;
  order: number;
  description?: string;
}

export interface NicheToolboxConfig {
  nicheId: string;
  profileId: CanonicalNicheId;
  recommendedTools: NicheToolItem[];
  availableTools: NicheToolItem[];
  hiddenTools: string[];
}

// 1. TOOL ITEMS REUTILIZÁVEIS / CANÔNICOS

const TOOL_FREE_TEXT: NicheToolItem = {
  toolId: 'free-text',
  label: 'Texto Livre',
  iconName: 'Type',
  elementType: 'text',
  order: 1,
  description: 'Texto estático editável',
};

const TOOL_SHAPE: NicheToolItem = {
  toolId: 'shape',
  label: 'Forma',
  iconName: 'Square',
  elementType: 'shape',
  order: 90,
  description: 'Linhas e Retângulos',
};

const TOOL_IMAGE: NicheToolItem = {
  toolId: 'image',
  label: 'Imagem / Logo',
  iconName: 'Image',
  elementType: 'image',
  order: 91,
  description: 'Logotipos e Imagens',
};

const TOOL_QRCODE: NicheToolItem = {
  toolId: 'qrcode',
  label: 'QR Code',
  iconName: 'QrCode',
  elementType: 'qrcode',
  order: 80,
  description: 'Código 2D QR Code',
};

// 2. CONFIGURAÇÕES POR NICHO (11 NICHOS)

export const NICHE_TOOLBOX_CONFIGS: Record<string, NicheToolboxConfig> = {
  'gondola-supermercado': {
    nicheId: 'gondola-supermercado',
    profileId: 'retail',
    recommendedTools: [
      { toolId: 'product-name', label: 'Nome do Produto', iconName: 'Type', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.descricao', namespace: 'produto' }, defaultProperties: { fontWeight: 'bold', singleLine: true }, inspectorProfile: 'product-name', order: 1 },
      { toolId: 'price', label: 'Preço', iconName: 'DollarSign', elementType: 'price', bindingPreset: { source: 'integration', fieldId: 'produto.preco', namespace: 'produto' }, inspectorProfile: 'price', order: 2 },
      { toolId: 'barcode', label: 'Código Barras (EAN)', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'produto.ean', namespace: 'produto' }, inspectorProfile: 'barcode', order: 4 },
      { toolId: 'unit', label: 'Unidade', iconName: 'Box', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.unidade', namespace: 'produto' }, inspectorProfile: 'unit', order: 5 },
      TOOL_QRCODE,
      TOOL_SHAPE,
      TOOL_IMAGE,
    ],
    availableTools: [
      TOOL_FREE_TEXT,
      { toolId: 'sku', label: 'SKU', iconName: 'Hash', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.sku', namespace: 'produto' }, order: 10 },
      { toolId: 'lot', label: 'Lote', iconName: 'Layers', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'lote.numero', namespace: 'lote' }, order: 11 },
      { toolId: 'expiration', label: 'Validade', iconName: 'Calendar', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'lote.validade', namespace: 'lote' }, order: 12 },
      { toolId: 'brand', label: 'Marca', iconName: 'Award', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.marca', namespace: 'produto' }, order: 13 },
    ],
    hiddenTools: ['patient-name', 'patient-id', 'bed', 'collection-id', 'donation-id', 'asset-id'],
  },

  'produto-codigo-barras': {
    nicheId: 'produto-codigo-barras',
    profileId: 'retail',
    recommendedTools: [
      { toolId: 'product-description', label: 'Descrição Produto', iconName: 'Type', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.descricao', namespace: 'produto' }, defaultProperties: { fontWeight: 'bold' }, inspectorProfile: 'product-description', order: 1 },
      { toolId: 'sku', label: 'SKU / Código', iconName: 'Hash', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.sku', namespace: 'produto' }, inspectorProfile: 'sku', order: 2 },
      { toolId: 'barcode', label: 'Código EAN-13', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'produto.ean', namespace: 'produto' }, inspectorProfile: 'barcode', order: 3 },
      TOOL_QRCODE,
      { toolId: 'lot', label: 'Lote', iconName: 'Layers', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'lote.numero', namespace: 'lote' }, order: 5 },
      { toolId: 'expiration', label: 'Validade', iconName: 'Calendar', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'lote.validade', namespace: 'lote' }, order: 6 },
      TOOL_SHAPE,
      TOOL_IMAGE,
    ],
    availableTools: [
      TOOL_FREE_TEXT,
      { toolId: 'brand', label: 'Marca', iconName: 'Award', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.marca', namespace: 'produto' }, order: 10 },
      { toolId: 'unit', label: 'Unidade', iconName: 'Box', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.unidade', namespace: 'produto' }, order: 11 },
      { toolId: 'price', label: 'Preço', iconName: 'DollarSign', elementType: 'price', bindingPreset: { source: 'integration', fieldId: 'produto.preco', namespace: 'produto' }, order: 12 },
    ],
    hiddenTools: ['patient-name', 'patient-id', 'bed', 'donation-id', 'asset-id'],
  },

  'hospital-identificacao': {
    nicheId: 'hospital-identificacao',
    profileId: 'hospital',
    recommendedTools: [
      { toolId: 'patient-name', label: 'Nome do Paciente', iconName: 'User', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'paciente.nome', namespace: 'paciente' }, defaultProperties: { fontWeight: 'bold', singleLine: true }, inspectorProfile: 'patient-name', order: 1 },
      { toolId: 'patient-id', label: 'ID / Prontuário', iconName: 'FileText', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'paciente.id', namespace: 'paciente' }, inspectorProfile: 'patient-id', order: 2 },
      { toolId: 'birth-date', label: 'Data Nascimento', iconName: 'Calendar', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'paciente.dataNascimento', namespace: 'paciente' }, order: 3 },
      { toolId: 'attendance-id', label: 'Nº Atendimento', iconName: 'Hash', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'atendimento.id', namespace: 'atendimento' }, order: 4 },
      { toolId: 'bed', label: 'Leito / Quarto', iconName: 'Bed', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'atendimento.leito', namespace: 'atendimento' }, inspectorProfile: 'bed', order: 5 },
      { toolId: 'department', label: 'Setor / Ala', iconName: 'MapPin', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'atendimento.setor', namespace: 'atendimento' }, order: 6 },
      { toolId: 'patient-barcode', label: 'Cód. Barras Paciente', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'paciente.id', namespace: 'paciente' }, defaultProperties: { showText: true }, inspectorProfile: 'patient-barcode', order: 7 },
      TOOL_QRCODE,
      TOOL_SHAPE,
      TOOL_IMAGE,
    ],
    availableTools: [
      TOOL_FREE_TEXT,
      { toolId: 'admission-date', label: 'Data Admissão', iconName: 'Clock', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'atendimento.dataAdmissao', namespace: 'atendimento' }, order: 10 },
      { toolId: 'responsible-professional', label: 'Médico / Profissional', iconName: 'UserCheck', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'atendimento.medico', namespace: 'atendimento' }, order: 11 },
      { toolId: 'institution-name', label: 'Nome do Hospital', iconName: 'Building', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'hospital.nome', namespace: 'hospital' }, order: 12 },
    ],
    hiddenTools: ['price', 'promotional-price', 'product-price', 'retail-unit', 'retail-promotion'],
  },

  'laboratorio': {
    nicheId: 'laboratorio',
    profileId: 'laboratory',
    recommendedTools: [
      { toolId: 'patient-name', label: 'Nome do Paciente', iconName: 'User', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'paciente.nome', namespace: 'paciente' }, defaultProperties: { fontWeight: 'bold' }, inspectorProfile: 'patient-name', order: 1 },
      { toolId: 'patient-id', label: 'ID Paciente', iconName: 'FileText', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'paciente.id', namespace: 'paciente' }, order: 2 },
      { toolId: 'sample-id', label: 'Cód. da Amostra', iconName: 'Hash', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'coleta.id', namespace: 'coleta' }, inspectorProfile: 'sample-id', order: 3 },
      { toolId: 'sample-type', label: 'Tipo de Amostra', iconName: 'TestTube', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'amostra.tipo', namespace: 'amostra' }, order: 4 },
      { toolId: 'exam-name', label: 'Nome do Exame', iconName: 'Activity', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'exame.nome', namespace: 'exame' }, order: 5 },
      { toolId: 'collection-date-time', label: 'Data/Hora Coleta', iconName: 'Clock', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'coleta.dataHora', namespace: 'coleta' }, order: 6 },
      { toolId: 'sample-barcode', label: 'Cód. Barras Amostra', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'coleta.id', namespace: 'coleta' }, defaultProperties: { showText: true }, inspectorProfile: 'sample-barcode', order: 7 },
      TOOL_QRCODE,
      TOOL_SHAPE,
      TOOL_IMAGE,
    ],
    availableTools: [
      TOOL_FREE_TEXT,
      { toolId: 'exam-code', label: 'Código Exame', iconName: 'FileCode', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'exame.codigo', namespace: 'exame' }, order: 10 },
      { toolId: 'requesting-sector', label: 'Setor Solicitante', iconName: 'MapPin', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'solicitante.setor', namespace: 'solicitante' }, order: 11 },
      { toolId: 'institution-name', label: 'Nome Laboratório', iconName: 'Building', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'laboratorio.nome', namespace: 'laboratorio' }, order: 12 },
    ],
    hiddenTools: ['price', 'promotional-price', 'retail-unit'],
  },

  'banco-sangue-hemoterapia': {
    nicheId: 'banco-sangue-hemoterapia',
    profileId: 'hospital',
    recommendedTools: [
      { toolId: 'donation-id', label: 'Nº Doação (DIN)', iconName: 'Hash', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'blood.donationId', namespace: 'blood' }, defaultProperties: { fontWeight: 'bold' }, inspectorProfile: 'donation-id', order: 1 },
      { toolId: 'blood-product', label: 'Hemoderivado', iconName: 'Droplet', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'blood.productDescription', namespace: 'blood' }, defaultProperties: { fontWeight: 'bold' }, order: 2 },
      { toolId: 'blood-product-code', label: 'Cód. Produto', iconName: 'FileCode', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'blood.productCode', namespace: 'blood' }, order: 3 },
      { toolId: 'abo-rh', label: 'Grupo ABO / Rh', iconName: 'Heart', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'blood.aboRh', namespace: 'blood' }, defaultProperties: { fontWeight: 'bold', fontSize: 18 }, order: 4 },
      { toolId: 'expiration-date-time', label: 'Validade Bolsa', iconName: 'Calendar', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'blood.expirationDateTime', namespace: 'blood' }, order: 5 },
      { toolId: 'donation-barcode', label: 'Cód. Barras Doação', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'blood.donationId', namespace: 'blood' }, defaultProperties: { showText: true }, inspectorProfile: 'donation-barcode', order: 6 },
      { toolId: 'product-barcode', label: 'Cód. Barras Produto', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'blood.productCode', namespace: 'blood' }, defaultProperties: { showText: true }, order: 7 },
      TOOL_QRCODE,
      TOOL_SHAPE,
      TOOL_IMAGE,
    ],
    availableTools: [
      TOOL_FREE_TEXT,
      { toolId: 'collection-date-time', label: 'Data/Hora Coleta', iconName: 'Clock', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'blood.collectionDateTime', namespace: 'blood' }, order: 10 },
      { toolId: 'donor-id', label: 'Cód. Doador', iconName: 'User', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'blood.donorId', namespace: 'blood' }, order: 11 },
      { toolId: 'component-volume', label: 'Volume (mL)', iconName: 'Box', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'blood.volume', namespace: 'blood' }, order: 12 },
    ],
    hiddenTools: ['price', 'promotional-price', 'retail-unit', 'retail-promotion'],
  },

  'logistica-expedicao-ecommerce': {
    nicheId: 'logistica-expedicao-ecommerce',
    profileId: 'logistics',
    recommendedTools: [
      { toolId: 'content-description', label: 'Conteúdo Volume', iconName: 'Package', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.descricao', namespace: 'produto' }, defaultProperties: { fontWeight: 'bold' }, order: 1 },
      { toolId: 'sscc', label: 'Cód. SSCC GS1', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'expedicao.sscc', namespace: 'expedicao' }, defaultProperties: { showText: true }, inspectorProfile: 'sscc', order: 2 },
      { toolId: 'tracking-code', label: 'Cód. Rastreio', iconName: 'Truck', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'rastreio.codigo', namespace: 'rastreio' }, order: 3 },
      { toolId: 'destination', label: 'Destino / CD', iconName: 'MapPin', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'expedicao.destino', namespace: 'expedicao' }, defaultProperties: { fontWeight: 'bold' }, order: 4 },
      { toolId: 'quantity', label: 'Quantidade', iconName: 'Layers', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'expedicao.quantidade', namespace: 'expedicao' }, order: 5 },
      { toolId: 'lot', label: 'Lote', iconName: 'Hash', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'lote.numero', namespace: 'lote' }, order: 6 },
      { toolId: 'barcode', label: 'Código Barras', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'produto.gtin', namespace: 'produto' }, order: 7 },
      TOOL_QRCODE,
      TOOL_SHAPE,
      TOOL_IMAGE,
    ],
    availableTools: [
      TOOL_FREE_TEXT,
      { toolId: 'origin', label: 'Origem', iconName: 'Home', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'expedicao.origem', namespace: 'expedicao' }, order: 10 },
      { toolId: 'order-id', label: 'Nº Pedido', iconName: 'FileText', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'pedido.id', namespace: 'pedido' }, order: 11 },
      { toolId: 'gtin', label: 'GTIN / EAN', iconName: 'Barcode', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.gtin', namespace: 'produto' }, order: 12 },
    ],
    hiddenTools: ['patient-name', 'patient-id', 'donation-id'],
  },

  'farmacia-medicamentos': {
    nicheId: 'farmacia-medicamentos',
    profileId: 'pharmacy',
    recommendedTools: [
      { toolId: 'medicine-name', label: 'Nome Medicamento', iconName: 'Pill', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'medicamento.nome', namespace: 'medicamento' }, defaultProperties: { fontWeight: 'bold' }, inspectorProfile: 'medicine-name', order: 1 },
      { toolId: 'active-ingredient', label: 'Princípio Ativo', iconName: 'Activity', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'medicamento.principioAtivo', namespace: 'medicamento' }, order: 2 },
      { toolId: 'lot', label: 'Lote Farmacêutico', iconName: 'Layers', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'medicamento.lote', namespace: 'medicamento' }, order: 3 },
      { toolId: 'expiration', label: 'Validade', iconName: 'Calendar', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'medicamento.validade', namespace: 'medicamento' }, order: 4 },
      { toolId: 'registration', label: 'Reg. ANVISA (MS)', iconName: 'ShieldCheck', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'medicamento.registro', namespace: 'medicamento' }, order: 5 },
      { toolId: 'barcode', label: 'Cód. Barras', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'medicamento.codigo', namespace: 'medicamento' }, order: 6 },
      TOOL_QRCODE,
      TOOL_SHAPE,
      TOOL_IMAGE,
    ],
    availableTools: [
      TOOL_FREE_TEXT,
      { toolId: 'dosage', label: 'Dosagem / Posologia', iconName: 'FileText', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'medicamento.dosagem', namespace: 'medicamento' }, order: 10 },
      { toolId: 'manufacturer', label: 'Fabricante', iconName: 'Building', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'fabricante', namespace: 'medicamento' }, order: 11 },
      { toolId: 'price', label: 'Preço', iconName: 'DollarSign', elementType: 'price', bindingPreset: { source: 'integration', fieldId: 'produto.preco', namespace: 'produto' }, order: 12 },
    ],
    hiddenTools: ['patient-bed', 'donation-id', 'asset-id'],
  },

  'joalheria-otica': {
    nicheId: 'joalheria-otica',
    profileId: 'retail',
    recommendedTools: [
      { toolId: 'product-name', label: 'Descrição Joia', iconName: 'Sparkles', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.descricao', namespace: 'produto' }, defaultProperties: { fontWeight: 'bold' }, order: 1 },
      { toolId: 'reference', label: 'Referência', iconName: 'Hash', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.sku', namespace: 'produto' }, order: 2 },
      { toolId: 'price', label: 'Preço', iconName: 'DollarSign', elementType: 'price', bindingPreset: { source: 'integration', fieldId: 'produto.preco', namespace: 'produto' }, inspectorProfile: 'price', order: 3 },
      { toolId: 'barcode', label: 'Cód. Barras', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'produto.ean', namespace: 'produto' }, order: 4 },
      { toolId: 'material', label: 'Material (Ouro/Prata)', iconName: 'Award', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.material', namespace: 'produto' }, order: 5 },
      { toolId: 'weight', label: 'Peso / Quilates', iconName: 'Scale', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.peso', namespace: 'produto' }, order: 6 },
      TOOL_QRCODE,
      TOOL_SHAPE,
      TOOL_IMAGE,
    ],
    availableTools: [
      TOOL_FREE_TEXT,
      { toolId: 'brand', label: 'Marca / Grife', iconName: 'Bookmark', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.marca', namespace: 'produto' }, order: 11 },
    ],
    hiddenTools: ['patient-name', 'patient-id', 'donation-id', 'asset-id'],
  },

  'confeccao-vestuario': {
    nicheId: 'confeccao-vestuario',
    profileId: 'retail',
    recommendedTools: [
      { toolId: 'product-name', label: 'Nome da Peça', iconName: 'Tag', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.descricao', namespace: 'produto' }, defaultProperties: { fontWeight: 'bold' }, order: 1 },
      { toolId: 'size', label: 'Tamanho (P/M/G)', iconName: 'Maximize2', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.tamanho', namespace: 'produto' }, defaultProperties: { fontWeight: 'bold', fontSize: 18 }, order: 2 },
      { toolId: 'color', label: 'Cor', iconName: 'Palette', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.cor', namespace: 'produto' }, order: 3 },
      { toolId: 'price', label: 'Preço R$', iconName: 'DollarSign', elementType: 'price', bindingPreset: { source: 'integration', fieldId: 'produto.preco', namespace: 'produto' }, inspectorProfile: 'price', order: 4 },
      { toolId: 'barcode', label: 'Cód. Barras', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'produto.ean', namespace: 'produto' }, order: 5 },
      TOOL_QRCODE,
      TOOL_SHAPE,
      TOOL_IMAGE,
    ],
    availableTools: [
      TOOL_FREE_TEXT,
      { toolId: 'sku', label: 'Ref / SKU', iconName: 'Hash', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.sku', namespace: 'produto' }, order: 10 },
      { toolId: 'brand', label: 'Marca', iconName: 'Award', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'produto.marca', namespace: 'produto' }, order: 11 },
    ],
    hiddenTools: ['patient-name', 'donation-id', 'asset-id'],
  },

  'patrimonio-inventario': {
    nicheId: 'patrimonio-inventario',
    profileId: 'industry',
    recommendedTools: [
      { toolId: 'asset-id', label: 'Nº Patrimonial', iconName: 'Archive', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'asset.id', namespace: 'asset' }, defaultProperties: { fontWeight: 'bold' }, inspectorProfile: 'asset-id', order: 1 },
      { toolId: 'asset-description', label: 'Descrição Ativo', iconName: 'FileText', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'asset.description', namespace: 'asset' }, order: 2 },
      { toolId: 'serial-number', label: 'Nº de Série', iconName: 'Hash', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'asset.serialNumber', namespace: 'asset' }, order: 3 },
      { toolId: 'location', label: 'Localização', iconName: 'MapPin', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'asset.location', namespace: 'asset' }, order: 4 },
      { toolId: 'department', label: 'Setor / Depto', iconName: 'Building', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'asset.department', namespace: 'asset' }, order: 5 },
      { toolId: 'asset-barcode', label: 'Cód. Barras Ativo', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'asset.id', namespace: 'asset' }, defaultProperties: { showText: true }, inspectorProfile: 'asset-barcode', order: 6 },
      TOOL_QRCODE,
      TOOL_SHAPE,
      TOOL_IMAGE,
    ],
    availableTools: [
      TOOL_FREE_TEXT,
      { toolId: 'responsible', label: 'Responsável', iconName: 'User', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'asset.responsible', namespace: 'asset' }, order: 10 },
      { toolId: 'acquisition-date', label: 'Data Aquisição', iconName: 'Calendar', elementType: 'text', bindingPreset: { source: 'integration', fieldId: 'asset.acquisitionDate', namespace: 'asset' }, order: 11 },
    ],
    hiddenTools: ['price', 'promotional-price', 'patient-name', 'donation-id'],
  },

  'uso-geral': {
    nicheId: 'uso-geral',
    profileId: 'retail',
    recommendedTools: [
      TOOL_FREE_TEXT,
      { toolId: 'barcode', label: 'Código Barras', iconName: 'Barcode', elementType: 'barcode', bindingPreset: { source: 'integration', fieldId: 'produto.ean', namespace: 'produto' }, order: 2 },
      TOOL_QRCODE,
      TOOL_SHAPE,
      TOOL_IMAGE,
    ],
    availableTools: [
      { toolId: 'price', label: 'Preço', iconName: 'DollarSign', elementType: 'price', bindingPreset: { source: 'integration', fieldId: 'produto.preco', namespace: 'produto' }, order: 10 },
    ],
    hiddenTools: [],
  },
};

/**
  * Obter configuração da Toolbox para um nicho específico
  */
export function getNicheToolboxConfig(nicheIdOrSlugOrName?: string): NicheToolboxConfig {
  const normNicheId = normalizeNicheId(nicheIdOrSlugOrName);
  if (NICHE_TOOLBOX_CONFIGS[normNicheId]) {
    return NICHE_TOOLBOX_CONFIGS[normNicheId];
  }
  // Fallback seguro para uso-geral ou gondola-supermercado
  return NICHE_TOOLBOX_CONFIGS['gondola-supermercado'];
}
