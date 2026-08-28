const fs = require('fs');

const roadmap = JSON.parse(fs.readFileSync('docs/development-control/roadmap.json', 'utf8'));

const newCaps = [
  {
    id: 'cap-multiniche-profiles',
    name: 'Perfis Operacionais Multi-Nicho',
    description: 'Sistema responsável por definir comportamento contextual da plataforma por nicho, incluindo elementos padrão, campos de integração, datasets, templates iniciais, configuração da Central de Impressão e regras de apresentação.',
    module: 'multiniche',
    weight: 10,
    mvp: true,
    status: 'PLANNED',
    manualValidation: false,
    physicalValidation: false,
    frozen: false,
    evidence: [],
    dependencies: ['cap-universal-print-center'],
    notes: ['Definição dos 7 perfis operacionais (Varejo, Hospitalar, Laboratório, Logística, Indústria, Alimentação, Farmácia).']
  },
  {
    id: 'cap-logo-element',
    name: 'Elemento de Logomarca / Imagem Monocromática',
    description: 'Elemento visual destinado a logomarcas e símbolos gráficos compatíveis com impressão térmica.',
    module: 'elements',
    weight: 8,
    mvp: false,
    status: 'PLANNED',
    manualValidation: false,
    physicalValidation: false,
    frozen: false,
    evidence: [],
    dependencies: ['cap-canvas-core'],
    notes: ['Conversão monocromática e suporte a dither/bitmap térmico.']
  },
  {
    id: 'cap-element-transformations',
    name: 'Transformações Geométricas dos Elementos',
    description: 'Rotação canônica (0°, 90°, 180°, 270°) e transformações geométricas para todos os elementos suportados no Editor, Preview, Compiladores, Importadores e Exportadores.',
    module: 'editor-core',
    weight: 10,
    mvp: true,
    status: 'PLANNED',
    manualValidation: false,
    physicalValidation: false,
    frozen: false,
    evidence: [],
    dependencies: ['cap-canvas-core'],
    notes: ['Suporte a 0°, 90°, 180° e 270° em todos os compiladores e preview.']
  },
  {
    id: 'cap-shape-element',
    name: 'Elemento Unificado Linha / Moldura (Shape)',
    description: 'Abstração única para elementos geométricos simples (moldura com opção de usar como linha), preservando retrocompatibilidade total com LineElement e RectangleElement.',
    module: 'elements',
    weight: 6,
    mvp: false,
    status: 'PLANNED',
    manualValidation: false,
    physicalValidation: false,
    frozen: false,
    evidence: [],
    dependencies: ['cap-visual-elements'],
    notes: ['Preserva LineElement e RectangleElement no schema sem breaking changes.']
  },
  {
    id: 'cap-editor-toolbar-compactness',
    name: 'Compactação da Toolbar do Editor (UX Compactness 2)',
    description: 'Otimização da largura da toolbar do Editor ao abrir o painel lateral, removendo botões redundantes e movendo configurações secundárias para o menu Opções.',
    module: 'app-shell',
    weight: 6,
    mvp: true,
    status: 'PLANNED',
    manualValidation: false,
    physicalValidation: false,
    frozen: false,
    evidence: [],
    dependencies: ['cap-app-shell-ux'],
    notes: ['Elimina estouro e barra de rolagem horizontal ao abrir o inspector.']
  }
];

// Inserir na Fase 4
const phase4 = roadmap.phases.find(p => p.id === 'phase-4');
phase4.capabilities.push(...newCaps);

let totalWeight = 0;
let implementedWeight = 0;
let homologatedWeight = 0;

let mvpTotalWeight = 0;
let mvpImplementedWeight = 0;
let mvpHomologatedWeight = 0;

const capabilities = roadmap.phases.flatMap(p => p.capabilities);

for (const cap of capabilities) {
  const weight = cap.weight || 1;
  totalWeight += weight;

  const isImplemented = ['HOMOLOGATED', 'FROZEN', 'VALIDATION', 'IMPLEMENTED'].includes(cap.status);
  const isHomologated = ['HOMOLOGATED', 'FROZEN'].includes(cap.status);

  if (isImplemented) implementedWeight += weight;
  if (isHomologated) homologatedWeight += weight;

  if (cap.mvp) {
    mvpTotalWeight += weight;
    if (isImplemented) mvpImplementedWeight += weight;
    if (isHomologated) mvpHomologatedWeight += weight;
  }
}

console.log("=== METRICAS DEPOIS ===");
console.log(JSON.stringify({
  totalCapabilities: capabilities.length,
  fullRoadmap: {
    totalWeight,
    implementedWeight,
    homologatedWeight,
    implementationPercent: Math.round((implementedWeight / totalWeight) * 100),
    readinessPercent: Math.round((homologatedWeight / totalWeight) * 100),
  },
  mvp: {
    mvpTotalWeight,
    mvpImplementedWeight,
    mvpHomologatedWeight,
    implementationPercent: Math.round((mvpImplementedWeight / mvpTotalWeight) * 100),
    readinessPercent: Math.round((mvpHomologatedWeight / mvpTotalWeight) * 100),
  }
}, null, 2));
