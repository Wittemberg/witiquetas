const fs = require('fs');

const roadmap = JSON.parse(fs.readFileSync('docs/development-control/roadmap.json', 'utf8'));

const phase4 = roadmap.phases.find(p => p.id === 'phase-4');
phase4.name = 'Fase 4 — Central de Impressão Universal, Perfis Multi-Nicho, RBAC e Multi-Tenancy';
phase4.description = 'Plataforma comercial para envio de impressões em massa por operadores, perfis operacionais multinicho, gestão de permissões (RBAC) e isolamento multiempresa.';

// Atualizar cap-universal-print-center description e notes
const printCap = phase4.capabilities.find(c => c.id === 'cap-universal-print-center');
if (printCap) {
  printCap.description = 'Busca contextual única, grid com colunas dinâmicas adaptáveis por perfil/nicho ativo e disparo em lote para impressoras físicas.';
  printCap.notes = [
    'Requisito essencial para MVP comercial de operadores.',
    'A Central não possui dataset ou grid fixado exclusivamente em varejo, adaptando origem de dados, colunas, busca, preview e identificação ao perfil ativo (Varejo, Hospitalar, Laboratório, Logística, Indústria, Alimentação, Farmácia).'
  ];
}

// Novas Capabilities da Fase 4
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
    notes: [
      'Definição e suporte aos 7 perfis operacionais (Varejo, Hospitalar, Laboratório Clínico, Logística/Distribuição, Indústria/Produção, Alimentação/Perecíveis, Farmácia/Medicamentos).',
      'Varejo é a baseline existente homologada. Os demais perfis adaptam campos de integração, colunas da Central e datasets de homologação.'
    ]
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
    notes: [
      'Elemento multinicho para logomarcas institucionais, selos e símbolos gráficos com conversão monocromática e dither térmico.'
    ]
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
    notes: [
      'Garante 0°, 90°, 180° e 270° em todos os compiladores (PPLA/PPLB/ZPL) e preview visual com giro canônico para a esquerda.'
    ]
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
    notes: [
      'Abstração unificada Shape preservando LineElement e RectangleElement no schema sem quebrar retrocompatibilidade.'
    ]
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
    notes: [
      'Remove botões "Dados de Integração" e tema da toolbar do Editor, concentrando toggles no menu Opções para eliminar overflow horizontal.'
    ]
  }
];

// Garantir que não duplique se reexecutado
for (const nc of newCaps) {
  if (!phase4.capabilities.some(c => c.id === nc.id)) {
    phase4.capabilities.push(nc);
  }
}

fs.writeFileSync('docs/development-control/roadmap.json', JSON.stringify(roadmap, null, 2), 'utf8');
console.log('roadmap.json atualizado com sucesso!');
