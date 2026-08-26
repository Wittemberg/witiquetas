import fs from 'fs';
import path from 'path';
import type {
  DevelopmentProject,
  DevelopmentPhase,
  DevelopmentCapability,
  DevelopmentCheckpoint,
  DevelopmentOverviewDTO,
  DevelopmentProgressMetrics,
  DevelopmentModuleProgress,
  ProjectHealthOverview,
  FrozenComponentInfo,
  DevelopmentStatus,
} from '@witiquetas/contracts';

const DATA_DIR = path.resolve(process.cwd(), 'docs/development-control');

function loadJsonFile<T>(filename: string): T {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de controle de desenvolvimento não encontrado: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

export class DevelopmentControlService {
  public getProject(): DevelopmentProject {
    return loadJsonFile<DevelopmentProject>('project.json');
  }

  public getPhases(): DevelopmentPhase[] {
    const data = loadJsonFile<{ phases: DevelopmentPhase[] }>('roadmap.json');
    return data.phases;
  }

  public getCheckpoints(): DevelopmentCheckpoint[] {
    const data = loadJsonFile<{ checkpoints: DevelopmentCheckpoint[] }>('checkpoints.json');
    return data.checkpoints;
  }

  public getCapabilities(): DevelopmentCapability[] {
    const phases = this.getPhases();
    return phases.flatMap((p) => p.capabilities);
  }

  public calculateProgress(): DevelopmentProgressMetrics {
    const capabilities = this.getCapabilities();

    let totalWeight = 0;
    let implementedWeight = 0;
    let homologatedWeight = 0;

    let mvpTotalWeight = 0;
    let mvpImplementedWeight = 0;
    let mvpHomologatedWeight = 0;

    const countsByStatus: Record<DevelopmentStatus, number> = {
      PLANNED: 0,
      READY: 0,
      IN_PROGRESS: 0,
      IMPLEMENTED: 0,
      VALIDATION: 0,
      HOMOLOGATED: 0,
      FROZEN: 0,
      BLOCKED: 0,
      UNMAPPED: 0,
    };

    for (const cap of capabilities) {
      const weight = cap.weight || 1;
      totalWeight += weight;

      const isImplemented = cap.status === 'HOMOLOGATED' || cap.status === 'FROZEN' || cap.status === 'VALIDATION' || cap.status === 'IMPLEMENTED';
      const isHomologated = cap.status === 'HOMOLOGATED' || cap.status === 'FROZEN';

      if (isImplemented) {
        implementedWeight += weight;
      }
      if (isHomologated) {
        homologatedWeight += weight;
      }

      if (cap.mvp) {
        mvpTotalWeight += weight;
        if (isImplemented) {
          mvpImplementedWeight += weight;
        }
        if (isHomologated) {
          mvpHomologatedWeight += weight;
        }
      }

      countsByStatus[cap.status] = (countsByStatus[cap.status] || 0) + 1;
    }

    return {
      mvp: {
        implementedWeight: mvpImplementedWeight,
        homologatedWeight: mvpHomologatedWeight,
        totalWeight: mvpTotalWeight,
        implementationPercent: mvpTotalWeight > 0 ? Math.round((mvpImplementedWeight / mvpTotalWeight) * 100) : 0,
        readinessPercent: mvpTotalWeight > 0 ? Math.round((mvpHomologatedWeight / mvpTotalWeight) * 100) : 0,
      },
      fullRoadmap: {
        implementedWeight,
        homologatedWeight,
        totalWeight,
        implementationPercent: totalWeight > 0 ? Math.round((implementedWeight / totalWeight) * 100) : 0,
        readinessPercent: totalWeight > 0 ? Math.round((homologatedWeight / totalWeight) * 100) : 0,
      },
      countsByStatus,
      totalCapabilities: capabilities.length,
    };
  }

  public getModuleProgressList(): DevelopmentModuleProgress[] {
    const capabilities = this.getCapabilities();
    const modulesMap = new Map<string, DevelopmentModuleProgress>();

    const moduleMeta: Record<string, { name: string; description: string }> = {
      foundation: { name: 'Fundação & Infraestrutura', description: 'Monorepo, banco, storage, containers e saúde' },
      'app-shell': { name: 'Application Shell & UX', description: 'Shell responsivo, Sidebar recolhível e toolbar' },
      'editor-core': { name: 'Editor Visual Core', description: 'Canvas, zoom, bounds clamping e undo/redo' },
      elements: { name: 'Elementos & Componentes', description: 'Price, Line, Multiselect, Barcode, QRCode' },
      'model-lifecycle': { name: 'Ciclo de Vida do Modelo', description: 'CRUD em PostgreSQL e Fail-Closed' },
      importers: { name: 'Importadores Legados', description: 'Preprocessador PPLB e Round-Trip Diff Zero' },
      compilers: { name: 'Compiladores PPLA/PPLB', description: 'Motor RAW de baixo nível' },
      agent: { name: 'Agente Local (Rust)', description: 'Daemon nativo Windows/Linux para impressão física' },
      concurrency: { name: 'Concorrência & Presença', description: 'Lock otimista, heartbeat e resolução de conflitos' },
      'print-center': { name: 'Central de Impressão', description: 'Busca contextual e disparo em lote' },
      printers: { name: 'Impressoras & Dispositivos', description: 'Knowledge base e cadastro de hardware' },
      integrations: { name: 'Integrações & SDK', description: 'Mapeamento ERP e contratos OpenAPI' },
      admin: { name: 'Administração & DevControl', description: 'Painel de controle e governança interna' },
      'auth-rbac': { name: 'Autenticação & RBAC', description: 'Governança multi-tenant e permissões' },
      licensing: { name: 'Licenciamento', description: 'Gestão de limites e módulos comerciais' },
      'deployment-cicd': { name: 'Esteira CI/CD', description: 'GitHub Actions, GHCR e Portainer CD' },
    };

    for (const cap of capabilities) {
      const modKey = cap.module || 'outros';
      const meta = moduleMeta[modKey] || { name: modKey, description: 'Módulo do sistema' };

      if (!modulesMap.has(modKey)) {
        modulesMap.set(modKey, {
          id: modKey,
          name: meta.name,
          description: meta.description,
          totalCapabilities: 0,
          implementedCapabilities: 0,
          homologatedCapabilities: 0,
          totalWeight: 0,
          implementedWeight: 0,
          homologatedWeight: 0,
          implementationPercent: 0,
          homologationPercent: 0,
          status: 'PLANNED',
        });
      }

      const mod = modulesMap.get(modKey)!;
      const weight = cap.weight || 1;
      const isImplemented = cap.status === 'HOMOLOGATED' || cap.status === 'FROZEN' || cap.status === 'VALIDATION' || cap.status === 'IMPLEMENTED';
      const isHomologated = cap.status === 'HOMOLOGATED' || cap.status === 'FROZEN';

      mod.totalCapabilities += 1;
      mod.totalWeight += weight;

      if (isImplemented) {
        mod.implementedCapabilities += 1;
        mod.implementedWeight += weight;
      }
      if (isHomologated) {
        mod.homologatedCapabilities += 1;
        mod.homologatedWeight += weight;
      }
    }

    for (const mod of modulesMap.values()) {
      mod.implementationPercent = mod.totalWeight > 0 ? Math.round((mod.implementedWeight / mod.totalWeight) * 100) : 0;
      mod.homologationPercent = mod.totalWeight > 0 ? Math.round((mod.homologatedWeight / mod.totalWeight) * 100) : 0;

      if (mod.homologationPercent === 100) {
        mod.status = 'HOMOLOGATED';
      } else if (mod.implementationPercent > 0) {
        mod.status = 'IN_PROGRESS';
      } else {
        mod.status = 'PLANNED';
      }
    }

    return Array.from(modulesMap.values());
  }

  public getHealth(): ProjectHealthOverview {
    return {
      overall: 'HEALTHY',
      dimensions: {
        code: { name: 'Código & Arquitetura', status: 'HEALTHY', details: 'Monorepo TypeScript / Rust estruturado sem erros de lint' },
        tests: { name: 'Suíte de Testes Automatizados', status: 'HEALTHY', details: '95 testes de regressão automatizada cobrindo PPLB, Concorrência e DevControl' },
        build: { name: 'Compilação & Bundle', status: 'HEALTHY', details: 'Frontend Vite (8.8s) e Backend tsc (0 erros) 100% aprovados' },
        deployment: { name: 'Esteira CD & Portainer', status: 'HEALTHY', details: 'Promoção imutável com auto-rollback guard em 150s no GitHub Actions' },
        documentation: { name: 'Documentação Técnica e UX', status: 'HEALTHY', details: 'Consolidação canônica formalizada em docs/product/ e ROADMAP.md' },
        manualValidation: { name: 'Validação Manual Funcional', status: 'HEALTHY', details: 'Fluxos de modelo, conflitos e abas 100% homologados' },
        physicalValidation: { name: 'Validação em Hardware Físico', status: 'ATTENTION', details: 'PPLB e Agente validados; novas linguagens PPLA/ZPL aguardando bancada' },
        technicalDebt: { name: 'Débito Técnico & Congelamentos', status: 'HEALTHY', details: 'Baseline congelado (Price, Line, Toolbar, Canvas, Store, Repository)' },
      },
    };
  }

  public getFrozenComponents(): FrozenComponentInfo[] {
    return [
      { id: 'editor-toolbar', name: 'Toolbar do Editor e Status', description: 'Geometria do save-status-container fixada em 140px com 0px layout shift', frozenSincePatch: '3.2.8.4', reason: 'Proteção contra deslocamento horizontal do botão Imprimir' },
      { id: 'canvas-area', name: 'Canvas Area & Bounds', description: 'Limites físicos e sistema de coordenadas mm/DPI', frozenSincePatch: '3.2.1', reason: 'Estabilidade dimensional dos modelos' },
      { id: 'price-element', name: 'Price Element & Second Line Scale', description: 'Renderização de preço com decimais em escala', frozenSincePatch: '3.2.0', reason: 'Fidelidade visual de ofertas' },
      { id: 'line-element', name: 'Line Element', description: 'Renderização de linhas separadoras vetoriais', frozenSincePatch: '3.2.0', reason: 'Fidelidade visual de leiaute' },
      { id: 'multiselect-tool', name: 'Multiselect Tool', description: 'Ferramenta de seleção múltipla de elementos', frozenSincePatch: '3.2.0', reason: 'UX de edição' },
      { id: 'sidebar-shell', name: 'Sidebar & Shell', description: 'Menu lateral recolhível e cabeçalho global', frozenSincePatch: '3.5.0', reason: 'Navegação canônica multinicho' },
      { id: 'pplb-compiler-core', name: 'Compilador PPLB & Round-Trip', description: 'Motor de compilação RAW PPLB com parser de condicionais [[SE]]', frozenSincePatch: '2.1.0', reason: 'Golden Model 16-ARGOX Diff Zero' },
      { id: 'concurrency-engine', name: 'Concorrência & Presence Engine', description: 'Presença atômica no DB com expiração 45s e Lock Otimista 409', frozenSincePatch: '3.2.8.3', reason: 'Integridade multi-aba e multi-navegador' },
    ];
  }

  public getOverview(): DevelopmentOverviewDTO {
    const project = this.getProject();
    const progress = this.calculateProgress();
    const phases = this.getPhases();
    const currentPhaseData = phases.find((p) => p.code === project.currentPhase) || phases[0];
    const checkpoints = this.getCheckpoints();
    const lastCheckpoint = checkpoints[0];
    const modules = this.getModuleProgressList();
    const health = this.getHealth();
    const frozenComponents = this.getFrozenComponents();

    return {
      project,
      progress,
      currentPhase: {
        code: currentPhaseData.code,
        name: currentPhaseData.name,
        status: currentPhaseData.status,
      },
      lastCheckpoint,
      modules,
      health,
      frozenComponents,
      phases,
    };
  }
}
