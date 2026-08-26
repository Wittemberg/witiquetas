import React, { useState, useEffect } from 'react';
import { 
  Database, 
  HardDrive, 
  Server, 
  Globe, 
  CheckCircle2, 
  XCircle, 
  Cpu, 
  GitBranch, 
  Layers, 
  ShieldCheck, 
  Download, 
  KeyRound,
  ListOrdered,
  Printer,
  Plug,
  Settings
} from 'lucide-react';
import EditorLayout from './editor/EditorLayout.js';
import NewTemplateWizard from './editor/NewTemplateWizard.js';
import DownloadAgentModal from './agent/DownloadAgentModal.js';
import PairAgentModal from './agent/PairAgentModal.js';
import { ensurePreRbacSession } from './auth/session.js';
import { ApplicationShell } from './shell/ApplicationShell.js';
import { ModelsPage } from './modules/models/ModelsPage.js';
import { PlaceholderModulePage } from './modules/common/PlaceholderModulePage.js';
import { DevControlPage } from './modules/devcontrol/DevControlPage.js';
import { templatesApi } from './services/templatesApi.js';
import { useEditorStore } from './editor/useEditorStore.js';

interface ServiceStatus {
  status: string;
  message: string;
  latencyMs?: number;
  details?: any;
  error?: string;
}

interface HealthResponse {
  status: string;
  app: string;
  environment: string;
  timestamp: string;
  services: {
    postgres: ServiceStatus;
    minio: ServiceStatus;
  };
}

interface VersionResponse {
  name: string;
  version: string;
  phase: string;
  environment: string;
  timezone: string;
  timestamp: string;
}

const parseHash = (hashStr: string) => {
  const clean = (hashStr || '').replace(/^#/, '');
  if (!clean) return { module: 'home', templateId: null };

  if (clean.startsWith('editor/')) {
    const id = clean.substring(7);
    return { module: 'editor', templateId: id || null };
  }
  if (clean.startsWith('editor?template=')) {
    const id = clean.split('template=')[1];
    return { module: 'editor', templateId: id || null };
  }
  if (clean === 'editor') {
    return { module: 'editor', templateId: null };
  }
  return { module: clean, templateId: null };
};

export default function App() {
  const [currentModule, setCurrentModule] = useState<string>(() => {
    const parsed = parseHash(window.location.hash);
    if (parsed.module === 'editor' && parsed.templateId) {
      return `editor/${parsed.templateId}`;
    }
    return parsed.module || 'home';
  });

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [autoRefresh] = useState<boolean>(true);
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState<boolean>(false);
  const [isPairModalOpen, setIsPairModalOpen] = useState<boolean>(false);
  const [agents, setAgents] = useState<any[]>([]);

  // Tema Claro / Escuro
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('witiquetas-theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('witiquetas-theme', theme);
  }, [theme]);

  // Sincronizar hash de navegação
  useEffect(() => {
    if (currentModule) {
      window.location.hash = currentModule;
    }
  }, [currentModule]);

  // Sincronizar modelo pela rota de hash (#editor/:templateId) para duplicação de aba/F5
  useEffect(() => {
    const handleHashSync = async () => {
      const parsed = parseHash(window.location.hash);
      if (parsed.module === 'editor' && parsed.templateId) {
        const store = useEditorStore.getState();
        if (store.currentTemplateId !== parsed.templateId) {
          try {
            const template = await templatesApi.getTemplateById(parsed.templateId);
            store.setDocument(template.document, template.id, template.version);
            setCurrentModule(`editor/${parsed.templateId}`);
          } catch (err: any) {
            console.error('[App] Erro ao carregar modelo da rota:', err);
          }
        }
      } else if (parsed.module === 'editor' && !parsed.templateId) {
        const store = useEditorStore.getState();
        if (store.currentTemplateId) {
          setCurrentModule(`editor/${store.currentTemplateId}`);
        }
      }
    };

    handleHashSync();
    window.addEventListener('hashchange', handleHashSync);
    return () => window.removeEventListener('hashchange', handleHashSync);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      await ensurePreRbacSession();

      const [healthRes, versionRes, agentsRes] = await Promise.all([
        fetch('/api/health').then((r) => r.json()),
        fetch('/api/version').then((r) => r.json()),
        fetch('/api/agents', { credentials: 'include' }).then((r) => r.json()).catch(() => ({ agents: [] })),
      ]);

      setHealth(healthRes);
      setVersion(versionRes);
      setAgents(agentsRes.agents || []);
      setLastUpdated(new Date().toLocaleTimeString('pt-BR'));
    } catch (err: any) {
      setError(err.message || 'Erro ao comunicar com a API Backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleOpenModel = async (id: string) => {
    try {
      const template = await templatesApi.getTemplateById(id);
      useEditorStore.getState().setDocument(template.document, template.id, template.version);
      setCurrentModule(`editor/${id}`);
    } catch (err: any) {
      alert(`Erro ao abrir o modelo: ${err.message}`);
    }
  };

  const pgStatus = health?.services?.postgres;
  const minioStatus = health?.services?.minio;

  const renderModuleContent = () => {
    const activeModule = currentModule.startsWith('editor') ? 'editor' : currentModule;
    switch (activeModule) {
      case 'models':
        return (
          <ModelsPage
            onOpenModel={handleOpenModel}
            onCreateNew={() => setIsWizardOpen(true)}
          />
        );

      case 'new':
        return (
          <div className="new-template-redirect-view">
            <NewTemplateWizard
              isOpen={true}
              onClose={() => setCurrentModule('home')}
              onSuccess={() => setCurrentModule('editor')}
            />
          </div>
        );

      case 'editor':
        return (
          <EditorLayout
            onBackToDashboard={() => setCurrentModule('models')}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        );

      case 'print-center':
        return (
          <PlaceholderModulePage
            title="Central de Impressão"
            icon={ListOrdered}
            description="Gerencie filas, status e histórico de impressão."
            onGoHome={() => setCurrentModule('home')}
          />
        );

      case 'printers':
        return (
          <PlaceholderModulePage
            title="Impressoras"
            icon={Printer}
            description="Cadastre e acompanhe impressoras locais e de rede."
            onGoHome={() => setCurrentModule('home')}
          />
        );

      case 'agents':
        return (
          <PlaceholderModulePage
            title="Agents de Impressão"
            icon={Cpu}
            description="Gerencie os computadores responsáveis pela impressão local."
            onGoHome={() => setCurrentModule('home')}
          />
        );

      case 'integrations':
        return (
          <PlaceholderModulePage
            title="Integrações"
            icon={Plug}
            description="Conecte o Witiquetas às fontes de dados da sua empresa."
            onGoHome={() => setCurrentModule('home')}
          />
        );

      case 'admin':
        return (
          <PlaceholderModulePage
            title="Administração"
            icon={Settings}
            description="Gerencie configurações e recursos da sua organização."
            onGoHome={() => setCurrentModule('home')}
          />
        );

      case 'development':
        return (
          <DevControlPage
            onGoHome={() => setCurrentModule('home')}
          />
        );

      case 'home':
      default:
        return (
          <div className="dashboard-content">
            {error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '1rem 1.5rem',
                  borderRadius: '12px',
                  color: 'var(--status-danger)',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <XCircle size={20} />
                <div>
                  <strong>Falha de Conectividade com a API Backend:</strong> {error}
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Verifique se o backend está rodando e se a rota /api/health está acessível.
                  </p>
                </div>
              </div>
            )}

            {/* Grid de Serviços de Infraestrutura */}
            <div className="grid">
              {/* Card Frontend */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      <Globe size={20} color="var(--accent-blue)" />
                      Frontend Web
                    </div>
                    <div className="card-subtitle">Application Shell (React 19 + Vite)</div>
                  </div>
                  <span className="badge badge-success">
                    <CheckCircle2 size={12} />
                    Operacional
                  </span>
                </div>

                <div className="metrics">
                  <div className="metric-item metric-item-full">
                    <span className="metric-label">Domínio</span>
                    <span className="metric-value">witiquetas.wrtec.com.br</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Servidor Web</span>
                    <span className="metric-value">Nginx / Traefik</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Tema Ativo</span>
                    <span className="metric-value" style={{ textTransform: 'capitalize' }}>
                      {theme === 'dark' ? 'Modo Escuro (Dark)' : 'Modo Claro (Light)'}
                    </span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Atualizado às</span>
                    <span className="metric-value">{lastUpdated || '--:--:--'}</span>
                  </div>
                </div>
              </div>

              {/* Card Backend */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      <Server size={20} color="var(--accent-purple)" />
                      Backend API
                    </div>
                    <div className="card-subtitle">Engine de Serviços (Node.js 20 / TypeScript)</div>
                  </div>
                  <span className={`badge ${health?.status === 'HEALTHY' ? 'badge-success' : 'badge-danger'}`}>
                    {health?.status === 'HEALTHY' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {health?.status || 'Desconhecido'}
                  </span>
                </div>

                <div className="metrics">
                  <div className="metric-item">
                    <span className="metric-label">Rota API</span>
                    <span className="metric-value">/api/health</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Versão</span>
                    <span className="metric-value">{version?.version || '0.1.0'}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Ambiente</span>
                    <span className="metric-value">{version?.environment || 'production'}</span>
                  </div>
                  <div className="metric-item metric-item-full">
                    <span className="metric-label">Timezone</span>
                    <span className="metric-value">{version?.timezone || 'America/Sao_Paulo'}</span>
                  </div>
                </div>
              </div>

              {/* Card PostgreSQL */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      <Database size={20} color="var(--accent-cyan)" />
                      PostgreSQL
                    </div>
                    <div className="card-subtitle">Banco Relacional & Model Lifecycle</div>
                  </div>
                  <span className={`badge ${pgStatus?.status === 'OK' ? 'badge-success' : 'badge-danger'}`}>
                    {pgStatus?.status === 'OK' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {pgStatus?.status || 'Pendente'}
                  </span>
                </div>

                <div className="metrics">
                  <div className="metric-item">
                    <span className="metric-label">Database Target</span>
                    <span className="metric-value">{pgStatus?.details?.database || 'witiquetas'}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Latência Query</span>
                    <span className="metric-value">{pgStatus?.latencyMs ? `${pgStatus.latencyMs} ms` : 'N/A'}</span>
                  </div>
                </div>

                <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: pgStatus?.status === 'OK' ? 'var(--text-muted)' : 'var(--status-danger)' }}>
                  {pgStatus?.message || 'Aguardando validação de conexão...'}
                </div>
              </div>

              {/* Card MinIO S3 */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      <HardDrive size={20} color="var(--status-success)" />
                      MinIO / S3 Storage
                    </div>
                    <div className="card-subtitle">Armazenamento de Imagens e Artefatos</div>
                  </div>
                  <span className={`badge ${minioStatus?.status === 'OK' ? 'badge-success' : 'badge-danger'}`}>
                    {minioStatus?.status === 'OK' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {minioStatus?.status || 'Pendente'}
                  </span>
                </div>

                <div className="metrics">
                  <div className="metric-item">
                    <span className="metric-label">Bucket Target</span>
                    <span className="metric-value">{minioStatus?.details?.targetBucket || 'witiquetas'}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Latência Ping</span>
                    <span className="metric-value">{minioStatus?.latencyMs ? `${minioStatus.latencyMs} ms` : 'N/A'}</span>
                  </div>
                </div>

                <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: minioStatus?.status === 'OK' ? 'var(--text-muted)' : 'var(--status-danger)' }}>
                  {minioStatus?.message || 'Aguardando validação de conexão...'}
                </div>
              </div>

              {/* Card Agent de Impressão */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      <Cpu size={20} color="var(--accent-blue)" />
                      Agent de Impressão
                    </div>
                    <div className="card-subtitle">Daemon Headless de Hardware (Rust)</div>
                  </div>
                  {agents.length > 0 ? (
                    <span className={`badge ${agents[0].status === 'ONLINE' ? 'badge-success' : 'badge-danger'}`}>
                      {agents[0].status === 'ONLINE' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {agents[0].status === 'ONLINE' ? 'Online' : 'Offline'}
                    </span>
                  ) : (
                    <span className="badge badge-warning">
                      Sem Agent
                    </span>
                  )}
                </div>

                <div className="metrics">
                  <div className="metric-item">
                    <span className="metric-label">Computador</span>
                    <span className="metric-value">{agents[0]?.machineName || 'Nenhum'}</span>
                  </div>
                  <div className="metric-item metric-item-full">
                    <span className="metric-label">Sistema / SO</span>
                    <span className="metric-value">{agents[0] ? `${agents[0].os} (${agents[0].architecture})` : 'Multiplataforma'}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Protocolo</span>
                    <span className="metric-value">Agent Protocol v1</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Versão</span>
                    <span className="metric-value">{agents[0]?.agentVersion ? `v${agents[0].agentVersion}` : 'v0.1.0'}</span>
                  </div>
                </div>

                <div className="card-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => setIsPairModalOpen(true)}
                    style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)' }}
                  >
                    <KeyRound size={15} />
                    <span>Conectar Agent</span>
                  </button>
                  <button
                    className="btn"
                    onClick={() => setIsDownloadModalOpen(true)}
                  >
                    <Download size={15} />
                    <span>Baixar Agent</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Esteira CI/CD */}
            <div className="card" style={{ marginBottom: '2rem' }}>
              <div className="card-title" style={{ marginBottom: '0.5rem' }}>
                <GitBranch size={20} color="var(--accent-purple)" />
                Esteira de Integração e Deploy (CI/CD Pipeline)
              </div>
              <p className="card-subtitle">
                Demonstração do fluxo operacional automático de publicação do Witiquetas.
              </p>

              <div className="pipeline-flow">
                <div className="flow-step">
                  <GitBranch size={22} color="var(--accent-blue)" />
                  <span>1. Push main</span>
                </div>
                <div className="flow-arrow">➔</div>
                <div className="flow-step">
                  <Cpu size={22} color="var(--accent-purple)" />
                  <span>2. GitHub Actions</span>
                </div>
                <div className="flow-arrow">➔</div>
                <div className="flow-step">
                  <Layers size={22} color="var(--accent-cyan)" />
                  <span>3. GHCR Images</span>
                </div>
                <div className="flow-arrow">➔</div>
                <div className="flow-step">
                  <ShieldCheck size={22} color="var(--status-warning)" />
                  <span>4. Portainer Webhook</span>
                </div>
                <div className="flow-arrow">➔</div>
                <div className="flow-step">
                  <CheckCircle2 size={22} color="var(--status-success)" />
                  <span>5. Live Deploy</span>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <ApplicationShell
      currentModule={currentModule}
      onSelectModule={setCurrentModule}
      theme={theme}
      onToggleTheme={toggleTheme}
    >
      {renderModuleContent()}

      {/* Wizard Modal */}
      <NewTemplateWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={() => {
          const createdId = useEditorStore.getState().currentTemplateId;
          setIsWizardOpen(false);
          setCurrentModule(createdId ? `editor/${createdId}` : 'editor');
        }}
      />

      {/* Modal de Download Multiplataforma do Agent */}
      <DownloadAgentModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
      />

      {/* Modal de Pareamento do Agent por Código */}
      <PairAgentModal
        isOpen={isPairModalOpen}
        onClose={() => setIsPairModalOpen(false)}
        onSuccess={fetchData}
      />
    </ApplicationShell>
  );
}
