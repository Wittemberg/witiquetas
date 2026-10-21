import type {
  ReleaseChannel,
  UpdateStatus,
  ReleaseType,
  ReleaseManifestDTO,
  UpdateCenterOverviewDTO,
  UpdateCheckResultDTO,
  UpdateReleaseNoteDTO,
  WhatsNewItemDTO,
  WhatsNewResponseDTO,
} from '@witiquetas/contracts';
import { UserReleaseViewRepository } from '../repositories/userReleaseViewRepository.js';

/**
 * Catálogo inicial canônico de versões históricas e releases da plataforma Witiquetas.
 * Fundamentado no histórico real de checkpoints e governança do DCC.
 */
const INITIAL_RELEASES: ReleaseManifestDTO[] = [
  {
    manifestVersion: '1.0',
    version: '5.8.0',
    releaseDate: '2026-10-25T00:00:00Z',
    channel: 'STABLE',
    type: 'FEATURE',
    title: '5.8.0 — Central de Atualizações, Governança e Notificações de Release',
    summary: 'Fundação da Central de Atualizações com auditoria de versões, visualizador de novidades e editor de notas de versão.',
    changelogMarkdown: `### Novidades da Versão 5.8.0
- **Central de Atualizações (Sprint 1)**: Nova aba administrativa para consulta da versão ativa, integridade dos componentes e catálogo de novidades.
- **Visualizador e Editor de Release Notes**: Interface rica para redação e inspeção de notas de versão, destaques e impactos arquiteturais.
- **Permissões Granulares**: Introdução das permissões canônicas \`updates.view\` e \`updates.manage\`.
- **Rastreabilidade Integrada**: Alinhamento com os checkpoints e histórico do Development Control Center (DCC).`,
    highlights: [
      'Aba de Atualizações integrada na Administração do sistema',
      'Visualizador de notas de versão com markdown e categorização por badges',
      'Editor de Release Notes para perfis administrativos e desenvolvedores',
      'Zero interrupção: mecanismo de deploy ativo desacoplado nesta fase',
    ],
    breakingChanges: [],
    requiredMigrations: [],
    minAgentVersion: '0.2.0',
    components: {
      backendImage: 'ghcr.io/wittemberg/witiquetas-backend:candidate-5.8.0',
      frontendImage: 'ghcr.io/wittemberg/witiquetas-frontend:candidate-5.8.0',
      agentWindowsSha256: 'c34fdd93f9d7dda3b936e7825bfba3da59ac0774cb14fd6b71b847a187dd84ae',
    },
    author: {
      name: 'Equipe Witiquetas Core',
      email: 'core@witiquetas.wrtec.com.br',
    },
    createdAt: '2026-10-19T10:00:00Z',
    publishedAt: '2026-10-19T10:00:00Z',
    status: 'PUBLISHED',
  },
  {
    manifestVersion: '1.0',
    version: '5.7.1',
    releaseDate: '2026-10-15T18:00:00Z',
    channel: 'STABLE',
    type: 'FEATURE',
    title: '5.7.1 — Persistent Print Queue & Lease Safety (P0 Safety Gates)',
    summary: 'Fila de impressão persistente no PostgreSQL 14 com FOR UPDATE SKIP LOCKED, renovação atômica de lease e tratamento de UNKNOWN_RESULT.',
    changelogMarkdown: `### Principais Entregas do Pacote 5.7.1
- **Fila Persistente no PostgreSQL 14**: Migration 011 criando \`print_jobs\` e \`print_job_events\`.
- **Lease Safety**: Prevenção estrita contra contenção concorrente e duplicação física.
- **Tratamento de Timeout TCP**: Transição para \`UNKNOWN_RESULT\` com resolução manual assistida.
- **Deploy Safety Gate**: Workflow Docker protegido com aprovação manual obrigatória via GitHub Environment \`production\`.`,
    highlights: [
      'Tabelas relacionais print_jobs e print_job_events',
      'Consumo transacional atômico pelo Windows Agent SUPORTE-2',
      'Trava contra fallback silencioso para fila em memória',
      'Gate de CI dedicado com PostgreSQL 14 em container de serviço',
    ],
    breakingChanges: [
      'Exige aplicação da Migration 011 no PostgreSQL de produção',
    ],
    requiredMigrations: ['011_create_persistent_print_queue_tables.sql'],
    minAgentVersion: '0.2.0',
    components: {
      backendImage: 'ghcr.io/wittemberg/witiquetas-backend:candidate-b86f641',
      frontendImage: 'ghcr.io/wittemberg/witiquetas-frontend:candidate-b86f641',
      agentWindowsSha256: 'c34fdd93f9d7dda3b936e7825bfba3da59ac0774cb14fd6b71b847a187dd84ae',
    },
    author: {
      name: 'Equipe Witiquetas Core',
      email: 'core@witiquetas.wrtec.com.br',
    },
    createdAt: '2026-10-15T16:00:00Z',
    publishedAt: '2026-10-15T18:00:00Z',
    status: 'PUBLISHED',
  },
  {
    manifestVersion: '1.0',
    version: '5.7.2.1.3',
    releaseDate: '2026-10-13T18:15:00Z',
    channel: 'STABLE',
    type: 'HOTFIX',
    title: '5.7.2.1.3 — P0 Hotfix: Editor Save Failure on Industrial & Custom Labels',
    summary: 'Resolução de bloqueio 403 (NICHE_NOT_ALLOWED) no salvamento de modelos em etiquetas industriais (100x200mm, 80x180mm).',
    changelogMarkdown: `### Correções do Hotfix 5.7.2.1.3
- **Guarda Anti-Lockout para ADMIN**: Garante autorização irrestrita sobre nichos da empresa.
- **Fallback Canônico**: Perfis não configurados recebem fallback seguro de perfil padrão.
- **Preservação de Dimensões**: Suporte integral a tamanhos customizados no editor.`,
    highlights: [
      'Eliminação definitiva do erro 403 no salvamento de etiquetas industriais',
      'Bootstrap idempotente de perfis de nicho',
    ],
    breakingChanges: [],
    requiredMigrations: [],
    minAgentVersion: '0.2.0',
    components: {},
    author: {
      name: 'Equipe Witiquetas Core',
    },
    createdAt: '2026-10-13T18:00:00Z',
    publishedAt: '2026-10-13T18:15:00Z',
    status: 'PUBLISHED',
  },
  {
    manifestVersion: '1.0',
    version: '5.7.0',
    releaseDate: '2026-10-06T14:00:00Z',
    channel: 'STABLE',
    type: 'FEATURE',
    title: '5.7.0 — Governança Corporativa de Impressoras e Agentes de Impressão',
    summary: 'Módulo administrativo de cadastro, descoberta e gerenciamento de impressoras térmicas e agentes locais com Anti-IDOR.',
    changelogMarkdown: `### Entregas do Pacote 5.7.0
- **Governança de Impressoras**: Tabela \`printers\` com suporte a RAW TCP 9100, Serial e Spooler.
- **Isolamento Multi-Tenant**: Vinculação estrita entre empresa, impressora e agente local.
- **Pareamento Seguro**: Protocolo de código temporário e token SHA-256 para máquina agente.`,
    highlights: [
      'Cadastro de impressoras com detecção de porta RAW 9100',
      'Pareamento de Agents Windows por código de uso único',
    ],
    breakingChanges: [
      'Exige aplicação da Migration 010',
    ],
    requiredMigrations: ['010_create_printers_table.sql'],
    minAgentVersion: '0.1.0',
    components: {},
    author: {
      name: 'Equipe Witiquetas Core',
    },
    createdAt: '2026-10-06T12:00:00Z',
    publishedAt: '2026-10-06T14:00:00Z',
    status: 'PUBLISHED',
  },
];

export class UpdatesCenterService {
  private static manifests: Map<string, ReleaseManifestDTO> = new Map(
    INITIAL_RELEASES.map((m) => [m.version, { ...m }])
  );

  private static currentChannel: ReleaseChannel = 'STABLE';
  private static lastCheckedAt: string = new Date().toISOString();
  private static simulatedStatus: UpdateStatus = 'UP_TO_DATE';

  /**
   * Retorna os metadados canônicos da versão atual em execução
   */
  public static getCurrentVersion() {
    const envCommit =
      process.env.GIT_COMMIT ||
      process.env.GITHUB_SHA ||
      process.env.RUNNING_SHA ||
      process.env.CANDIDATE_SHA ||
      '6b6d8c5';
    const commit = envCommit && envCommit !== 'unknown' ? envCommit : '6b6d8c5';
    const shortCommit =
      process.env.SHORT_SHA && process.env.SHORT_SHA !== 'unknown'
        ? process.env.SHORT_SHA
        : commit.substring(0, 7);

    return {
      version: '5.7.1',
      commit,
      shortCommit,
      builtAt:
        process.env.BUILT_AT && process.env.BUILT_AT !== 'unknown'
          ? process.env.BUILT_AT
          : '2026-10-15T18:00:00Z',
      environment: process.env.NODE_ENV || 'development',
      package: '5.7.1 — Persistent Print Queue & Updates Center (Sprint 1)',
      phase: 'Fase 5 — Administração e Governança da Aplicação',
    };
  }

  /**
   * Retorna a visão geral da Central de Atualizações
   */
  public static getOverview(canManage = false): UpdateCenterOverviewDTO {
    const current = this.getCurrentVersion();
    const sortedReleases = Array.from(this.manifests.values()).sort(
      (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
    );

    const latest = sortedReleases[0];
    const hasUpdate = Boolean(latest && latest.version !== current.version && latest.status === 'PUBLISHED');
    const status: UpdateStatus = hasUpdate ? 'UPDATE_AVAILABLE' : 'UP_TO_DATE';

    return {
      currentVersion: current,
      channel: this.currentChannel,
      status,
      latestRelease: latest,
      hasUpdate,
      lastCheckedAt: this.lastCheckedAt,
      historyCount: this.manifests.size,
      canManageUpdates: canManage,
      deployMechanismActive: false, // Sprint 1: Proibido deploy automático
    };
  }

  /**
   * Retorna o histórico cronológico de releases publicadas e rascunhos
   */
  public static getHistory(): ReleaseManifestDTO[] {
    return Array.from(this.manifests.values()).sort(
      (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
    );
  }

  /**
   * Busca os detalhes de uma release específica por versão
   */
  public static getReleaseByVersion(version: string): ReleaseManifestDTO | null {
    return this.manifests.get(version) || null;
  }

  /**
   * Atualiza ou cria as notas de versão de uma release (Requer permissão updates.manage)
   */
  public static updateReleaseNote(
    version: string,
    dto: UpdateReleaseNoteDTO,
    authorName = 'Administrador'
  ): ReleaseManifestDTO {
    if (!version || typeof version !== 'string' || !version.trim()) {
      const err: any = new Error('Versão semântica é obrigatória.');
      err.statusCode = 400;
      throw err;
    }

    const cleanVersion = version.trim();
    let existing = this.manifests.get(cleanVersion);

    if (existing) {
      existing = {
        ...existing,
        title: dto.title !== undefined ? dto.title.trim() : existing.title,
        summary: dto.summary !== undefined ? dto.summary.trim() : existing.summary,
        changelogMarkdown: dto.changelogMarkdown !== undefined ? dto.changelogMarkdown : existing.changelogMarkdown,
        highlights: dto.highlights !== undefined ? dto.highlights : existing.highlights,
        breakingChanges: dto.breakingChanges !== undefined ? dto.breakingChanges : existing.breakingChanges,
        channel: dto.channel || existing.channel,
        type: dto.type || existing.type,
      };
      this.manifests.set(cleanVersion, existing);
      return existing;
    }

    // Criar novo rascunho de release note
    const newManifest: ReleaseManifestDTO = {
      manifestVersion: '1.0',
      version: cleanVersion,
      releaseDate: new Date().toISOString(),
      channel: dto.channel || 'STABLE',
      type: dto.type || 'MINOR',
      title: dto.title?.trim() || `Versão ${cleanVersion}`,
      summary: dto.summary?.trim() || 'Notas da nova versão.',
      changelogMarkdown: dto.changelogMarkdown || '',
      highlights: dto.highlights || [],
      breakingChanges: dto.breakingChanges || [],
      requiredMigrations: [],
      components: {},
      author: {
        name: authorName,
      },
      createdAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      status: 'PUBLISHED',
    };

    this.manifests.set(cleanVersion, newManifest);
    return newManifest;
  }

  /**
   * Executa a checagem simulada de atualizações (Sprint 1: Zero deploy, apenas consulta declarativa)
   */
  public static checkForUpdates(channel?: ReleaseChannel): UpdateCheckResultDTO {
    this.lastCheckedAt = new Date().toISOString();
    if (channel) {
      this.currentChannel = channel;
    }

    const current = this.getCurrentVersion();
    const sorted = Array.from(this.manifests.values())
      .filter((m) => m.status === 'PUBLISHED')
      .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());

    const latest = sorted[0];
    const hasUpdate = Boolean(latest && latest.version !== current.version);
    const status: UpdateStatus = hasUpdate ? 'UPDATE_AVAILABLE' : 'UP_TO_DATE';
    this.simulatedStatus = status;

    return {
      checkedAt: this.lastCheckedAt,
      channel: this.currentChannel,
      status,
      hasUpdate,
      currentVersion: current.version,
      latestVersion: latest?.version,
      message: hasUpdate
        ? `Uma nova versão (${latest.version} — ${latest.title}) está disponível para homologação.`
        : `O Witiquetas está atualizado na versão ${current.version}.`,
      release: latest,
    };
  }

  /**
   * Retorna as novidades não reconhecidas para um usuário específico em uma empresa.
   * Filtra estritamente as releases com status 'PUBLISHED'.
   */
  public static async getWhatsNewForUser(
    companyId: string,
    userId: string
  ): Promise<WhatsNewResponseDTO> {
    const publishedReleases = Array.from(this.manifests.values())
      .filter((m) => m.status === 'PUBLISHED')
      .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());

    const readVersions = await UserReleaseViewRepository.getReadReleaseVersions(companyId, userId);

    const unread = publishedReleases.filter((m) => !readVersions.has(m.version));

    const unreadItems: WhatsNewItemDTO[] = unread.map((m) => ({
      version: m.version,
      releaseDate: m.releaseDate,
      type: m.type,
      title: m.title,
      summary: m.summary,
      highlights: m.highlights || [],
      breakingChanges: m.breakingChanges || [],
      changelogMarkdown: m.changelogMarkdown || '',
      publishedAt: m.publishedAt,
    }));

    return {
      unreadReleases: unreadItems,
      hasUnread: unreadItems.length > 0,
      totalUnread: unreadItems.length,
      latestVersion: publishedReleases[0]?.version,
    };
  }

  /**
   * Marca uma ou mais releases como lidas/reconhecidas por um usuário de forma idempotente.
   */
  public static async markReleasesAsReadForUser(
    companyId: string,
    userId: string,
    versions: string[]
  ): Promise<string[]> {
    return UserReleaseViewRepository.markReleasesAsRead(companyId, userId, versions);
  }

  /**
   * Reinicializa o store para testes unitários
   */
  public static resetForTests(): void {
    this.manifests = new Map(INITIAL_RELEASES.map((m) => [m.version, { ...m }]));
    this.currentChannel = 'STABLE';
    this.lastCheckedAt = new Date().toISOString();
    this.simulatedStatus = 'UP_TO_DATE';
    UserReleaseViewRepository.resetForTests();
  }
}
