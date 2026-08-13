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
  PenTool
} from 'lucide-react';
import EditorLayout from './editor/EditorLayout';

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

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, versionRes] = await Promise.all([
        fetch('/api/health').then((r) => r.json()),
        fetch('/api/version').then((r) => r.json()),
      ]);

      setHealth(healthRes);
      setVersion(versionRes);
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
    return <EditorLayout onBackToDashboard={() => setCurrentView('dashboard')} />;
  }

  return (
    <div className="container">
      {/* Header */}
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
          <button 
            className="btn btn-primary"
            onClick={() => setCurrentView('editor')}
            style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
          >
            <PenTool size={16} />
            <span>Abrir Editor Visual de Etiquetas</span>
          </button>
          <button 
            className="btn" 
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{ opacity: autoRefresh ? 1 : 0.6 }}
          >
            <Clock size={16} />
            {autoRefresh ? 'Auto-refresh On (15s)' : 'Auto-refresh Off'}
          </button>
          <button className="btn" onClick={fetchData} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            <span>Atualizar</span>
          </button>
        </div>
      </header>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          padding: '1rem 1.5rem',
          borderRadius: '12px',
          color: '#f87171',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <XCircle size={20} />
          <div>
            <strong>Falha de Conectividade com a API Backend:</strong> {error}
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.2rem' }}>
              Verifique se o backend está rodando e se a rota /api/health está acessível.
            </p>
          </div>
        </div>
      )}

      {/* Grid de Serviços */}
      <div className="grid">
        {/* Card Frontend */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <Globe size={20} color="#3b82f6" />
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
              <span className="metric-label">Rede Docker</span>
              <span className="metric-value">interna</span>
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
                <Server size={20} color="#8b5cf6" />
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
                <Database size={20} color="#06b6d4" />
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

          <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: pgStatus?.status === 'OK' ? '#94a3b8' : '#f87171' }}>
            {pgStatus?.message || 'Aguardando validação de conexão...'}
          </div>
        </div>

        {/* Card MinIO S3 */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <HardDrive size={20} color="#10b981" />
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

          <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: minioStatus?.status === 'OK' ? '#94a3b8' : '#f87171' }}>
            {minioStatus?.message || 'Aguardando validação de conexão...'}
          </div>
        </div>
      </div>

      {/* Fluxo de CI/CD e Infraestrutura */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-title" style={{ marginBottom: '0.5rem' }}>
          <GitBranch size={20} color="#8b5cf6" />
          Esteira de Integração e Deploy (CI/CD Pipeline)
        </div>
        <p className="card-subtitle">
          Demonstração do fluxo operacional automático de publicação do Witiquetas.
        </p>

        <div className="pipeline-flow">
          <div className="flow-step">
            <GitBranch size={22} color="#3b82f6" />
            <span>1. Push main</span>
          </div>
          <div className="flow-arrow">➔</div>
          <div className="flow-step">
            <Cpu size={22} color="#8b5cf6" />
            <span>2. GitHub Actions</span>
          </div>
          <div className="flow-arrow">➔</div>
          <div className="flow-step">
            <Layers size={22} color="#06b6d4" />
            <span>3. GHCR Images</span>
          </div>
          <div className="flow-arrow">➔</div>
          <div className="flow-step">
            <ShieldCheck size={22} color="#f59e0b" />
            <span>4. Portainer Webhook</span>
          </div>
          <div className="flow-arrow">➔</div>
          <div className="flow-step">
            <CheckCircle2 size={22} color="#10b981" />
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
    </div>
  );
}
