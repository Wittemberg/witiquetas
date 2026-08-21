import React, { useState, useEffect } from 'react';
import { 
  Database, 
  HardDrive, 
  Server, 
  Globe, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Cpu, 
  GitBranch, 
  Layers, 
  ShieldCheck, 
  Clock,
  PenTool,
  Sun,
  Moon,
  Plus,
  Sparkles,
  Maximize2,
  Download,
  KeyRound
} from 'lucide-react';
import EditorLayout from './editor/EditorLayout';
import NewTemplateWizard from './editor/NewTemplateWizard';
import DownloadAgentModal from './agent/DownloadAgentModal';
import PairAgentModal from './agent/PairAgentModal';
import { ensurePreRbacSession } from './auth/session';

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

export default function App() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'editor'>('dashboard');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
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

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // PRE-RBAC / TEMPORÁRIA: Garante sessão web válida no backend
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

  const pgStatus = health?.services?.postgres;
  const minioStatus = health?.services?.minio;

  if (currentView === 'editor') {
    return (
      <EditorLayout
        onBackToDashboard={() => setCurrentView('dashboard')}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return (
    <div className="container">
      {/* Header Principal */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon">
            <Layers color="#ffffff" size={24} />
          </div>
          <div>
            <h1 className="brand-title">Witiquetas</h1>
            <p className="brand-subtitle">Plataforma Web para Gestão e Impressão de Etiquetas Térmicas</p>
          </div>
        </div>

        <div className="controls">
          {/* Alternador de Tema Sol / Lua */}
          <button 
            className="btn-theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Alternar para Modo Claro (Light)' : 'Alternar para Modo Escuro (Dark)'}
          >
            {theme === 'dark' ? <Sun size={18} color="#f59e0b" /> : <Moon size={18} color="#3b82f6" />}
          </button>
        </div>
      </header>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          padding: '1rem 1.5rem',
          borderRadius: '12px',
          color: 'var(--status-danger)',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <XCircle size={20} />
          <div>
            <strong>Falha de Conectividade com a API Backend:</strong> {error}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Verifique se o backend está rodando e se a rota /api/health está acessível.
            </p>
          </div>
        </div>
      )}

      {/* Banner / Card de Chamada para Nova Etiqueta por Nicho */}
      <div 
        className="card"
        style={{ 
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(139, 92, 246, 0.12))',
          border: '1px solid var(--border-color-glow)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.25rem 1.75rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <Sparkles size={20} color="var(--accent-blue)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Criação Guiada de Etiquetas Térmicas
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Selecione o nicho de aplicação (Gôndola, Produto, Logística, Farmácia, Hospital, etc.) e utilize formatos homologados de fábrica.
          </p>
        </div>

        <button 
          className="btn btn-primary"
          onClick={() => setIsWizardOpen(true)}
          style={{ whiteSpace: 'nowrap', padding: '0.75rem 1.4rem' }}
        >
          <Maximize2 size={16} />
          <span>Selecionar Nicho & Tamanho</span>
        </button>
      </div>

      {/* Grid de Serviços */}
      <div className="grid">
        {/* Card Frontend */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <Globe size={20} color="var(--accent-blue)" />
                Frontend Web
              </div>
              <div className="card-subtitle">Interface SPA (React 19 + Vite)</div>
            </div>
            <span className="badge badge-success">
              <CheckCircle2 size={12} />
              Operacional
            </span>
          </div>

          <div className="metrics">
            <div className="metric-item">
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
            <div className="metric-item">
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
              <div className="card-subtitle">Banco Relacional Principal</div>
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

        {/* Card Agent de Impressão (Fase 3) */}
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
            <div className="metric-item">
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

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.75rem 0 0 0' }}>
            {agents.length > 0 ? 'Agent conectado e operando no terminal.' : 'Conecte este computador às impressoras locais.'}
          </p>

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

      {/* Fluxo de CI/CD e Infraestrutura */}
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

      {/* Resposta Raw JSON */}
      {health && (
        <div className="card">
          <div className="card-title" style={{ fontSize: '0.95rem' }}>
            Payload Raw Retornado por <code>/api/health</code>
          </div>
          <pre className="code-block">
            {JSON.stringify(health, null, 2)}
          </pre>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <p>Witiquetas © 2026 WR Tecnologia — Todos os direitos reservados.</p>
        <p style={{ fontSize: '0.75rem', marginTop: '0.3rem' }}>
          Ambiente: {version?.environment || 'production'} | Status: {health?.status || 'LOADING'}
        </p>
      </footer>

      {/* Wizard Modal */}
      <NewTemplateWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={() => setCurrentView('editor')}
      />

      {/* Modal de Download Multiplataforma do Agent (Fase 3) */}
      <DownloadAgentModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
      />

      {/* Modal de Pareamento Seguro do Agent por Código (Fase 3) */}
      <PairAgentModal
        isOpen={isPairModalOpen}
        onClose={() => setIsPairModalOpen(false)}
        onSuccess={fetchData}
      />
    </div>
  );
}
