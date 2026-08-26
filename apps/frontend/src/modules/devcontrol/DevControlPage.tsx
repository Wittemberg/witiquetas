import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Lock,
  ArrowLeft,
  Activity,
  GitCommit,
  RefreshCw,
  AlertTriangle,
  Code,
  Globe,
  Server,
  FileText,
  Workflow,
  Zap,
} from 'lucide-react';
import type {
  DevelopmentOverviewDTO,
  DevelopmentModuleProgress,
  DevelopmentStatus,
  ProjectHealthStatus,
} from '@witiquetas/contracts';
import { devControlApi } from '../../services/devControlApi.js';

interface DevControlPageProps {
  onGoHome: () => void;
}

export const DevControlPage: React.FC<DevControlPageProps> = ({ onGoHome }) => {
  const [data, setData] = useState<DevelopmentOverviewDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'modules' | 'frozen'>('overview');

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const overview = await devControlApi.getOverview();
      setData(overview);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar dados do Development Control Center.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  if (loading) {
    return (
      <div className="dev-control-page">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem' }}>
          <RefreshCw className="spin" style={{ width: 32, height: 32, color: 'var(--accent-blue)' }} />
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>Carregando governança do produto...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="dev-control-page">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1.25rem', textAlign: 'center' }}>
          <AlertTriangle style={{ width: 48, height: 48, color: 'var(--status-warning)' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Acesso Restrito ou Indisponível</h2>
          <p style={{ maxWidth: 460, fontSize: '0.875rem', color: 'var(--text-muted)' }}>{error || 'Não foi possível carregar os dados.'}</p>
          <button onClick={onGoHome} className="btn btn-primary">
            <ArrowLeft style={{ width: 16, height: 16 }} /> Voltar ao Início
          </button>
        </div>
      </div>
    );
  }

  const { project, progress, health, frozenComponents, modules } = data;

  const renderStatusBadge = (status: DevelopmentStatus) => {
    const badgeMap: Record<DevelopmentStatus, { label: string; className: string }> = {
      FROZEN: { label: 'FROZEN', className: 'badge badge-success' },
      HOMOLOGATED: { label: 'HOMOLOGADO', className: 'badge badge-success' },
      VALIDATION: { label: 'EM VALIDAÇÃO', className: 'badge badge-warning' },
      IMPLEMENTED: { label: 'IMPLEMENTADO', className: 'badge badge-info' },
      IN_PROGRESS: { label: 'EM DEV', className: 'badge badge-info' },
      READY: { label: 'PRONTO', className: 'badge badge-info' },
      PLANNED: { label: 'PLANEJADO', className: 'badge' },
      BLOCKED: { label: 'BLOQUEADO', className: 'badge badge-danger' },
      UNMAPPED: { label: 'NÃO MAPEADO', className: 'badge' },
    };

    const cfg = badgeMap[status] || badgeMap.PLANNED;
    return <span className={cfg.className}>{cfg.label}</span>;
  };

  const renderHealthBadge = (status: ProjectHealthStatus) => {
    const map: Record<ProjectHealthStatus, { label: string; className: string }> = {
      HEALTHY: { label: 'Saudável', className: 'badge badge-success' },
      ATTENTION: { label: 'Atenção', className: 'badge badge-warning' },
      BLOCKED: { label: 'Crítico', className: 'badge badge-danger' },
      UNKNOWN: { label: 'Desconhecido', className: 'badge' },
    };
    const c = map[status] || map.UNKNOWN;
    return <span className={c.className}>{c.label}</span>;
  };

  const getDimensionIcon = (key: string) => {
    switch (key) {
      case 'architecture': return <Code style={{ width: 18, height: 18, color: 'var(--accent-blue)' }} />;
      case 'testSuite': return <CheckCircle2 style={{ width: 18, height: 18, color: 'var(--status-success)' }} />;
      case 'frontendBuild': return <Globe style={{ width: 18, height: 18, color: 'var(--accent-cyan)' }} />;
      case 'backendApi': return <Server style={{ width: 18, height: 18, color: 'var(--accent-purple)' }} />;
      case 'ciCd': return <Workflow style={{ width: 18, height: 18, color: 'var(--status-warning)' }} />;
      case 'documentation': return <FileText style={{ width: 18, height: 18, color: 'var(--text-secondary)' }} />;
      default: return <Activity style={{ width: 18, height: 18, color: 'var(--accent-blue)' }} />;
    }
  };

  const remainingMvpPoints = progress.mvp.totalWeight - progress.mvp.homologatedWeight;
  const shortCommit = project.shortCommit || (project.commit ? project.commit.substring(0, 7) : 'f72f178');

  return (
    <div className="dev-control-page">
      <div className="dev-control-container">
        {/* Header */}
        <header className="dev-control-header">
          <div className="dev-control-header-left">
            <button onClick={onGoHome} className="dev-control-back-btn" title="Voltar ao Início">
              <ArrowLeft style={{ width: 18, height: 18 }} />
            </button>
            <div className="dev-control-title-group">
              <div className="dev-control-title-row">
                <h1 className="dev-control-title">Development Control Center</h1>
                <span className="dev-control-badge-homologation">HOMOLOGAÇÃO</span>
              </div>
              <p className="dev-control-subtitle">Governança técnica e evolução do Witiquetas</p>
            </div>
          </div>

          <div className="dev-control-header-meta">
            <div className="dev-control-meta-pill">
              Fase atual: <strong>Fase 3.5 — Hardening de Produto, UX, Application Shell e Concorrência</strong>
            </div>
            <div className="dev-control-meta-pill">
              Ambiente: <strong>{project.environment ? project.environment.toUpperCase() : 'DEVELOPMENT'}</strong>
            </div>
          </div>
        </header>

        {/* Executive Cards (3 cards) */}
        <section className="dev-control-exec-grid">
          {/* Card 1: Prontidão do MVP */}
          <div className="dev-control-exec-card">
            <div>
              <div className="dev-control-exec-card-title">PRONTIDÃO DO MVP</div>
              <div className="dev-control-exec-card-value-row">
                <span className="dev-control-exec-card-value">{progress.mvp.readinessPercent}%</span>
                <span className="dev-control-exec-card-subvalue">{remainingMvpPoints} pontos restantes</span>
              </div>
              <div className="dev-control-progress-track">
                <div
                  className="dev-control-progress-fill dev-control-progress-fill-primary"
                  style={{ width: `${progress.mvp.readinessPercent}%` }}
                />
              </div>
            </div>
            <div className="dev-control-exec-card-footer">
              <span>Barra: <strong>{progress.mvp.homologatedWeight} / {progress.mvp.totalWeight}</strong></span>
              <span>Peso Homologado</span>
            </div>
          </div>

          {/* Card 2: Roadmap Implementado */}
          <div className="dev-control-exec-card">
            <div>
              <div className="dev-control-exec-card-title">ROADMAP IMPLEMENTADO</div>
              <div className="dev-control-exec-card-value-row">
                <span className="dev-control-exec-card-value">{progress.fullRoadmap.implementationPercent}%</span>
                <span className="dev-control-exec-card-subvalue" style={{ color: 'var(--accent-purple)' }}>Visão Sistêmica</span>
              </div>
              <div className="dev-control-progress-track">
                <div
                  className="dev-control-progress-fill dev-control-progress-fill-purple"
                  style={{ width: `${progress.fullRoadmap.implementationPercent}%` }}
                />
              </div>
            </div>
            <div className="dev-control-exec-card-footer">
              <span>Barra: <strong>{progress.fullRoadmap.implementedWeight} / {progress.fullRoadmap.totalWeight}</strong></span>
              <span>Peso Implementado</span>
            </div>
          </div>

          {/* Card 3: Roadmap Homologado */}
          <div className="dev-control-exec-card">
            <div>
              <div className="dev-control-exec-card-title">ROADMAP HOMOLOGADO</div>
              <div className="dev-control-exec-card-value-row">
                <span className="dev-control-exec-card-value">{progress.fullRoadmap.readinessPercent}%</span>
                <span className="dev-control-exec-card-subvalue" style={{ color: 'var(--status-success)' }}>Conclusão Global</span>
              </div>
              <div className="dev-control-progress-track">
                <div
                  className="dev-control-progress-fill dev-control-progress-fill-emerald"
                  style={{ width: `${progress.fullRoadmap.readinessPercent}%` }}
                />
              </div>
            </div>
            <div className="dev-control-exec-card-footer">
              <span>Barra: <strong>{progress.fullRoadmap.homologatedWeight} / {progress.fullRoadmap.totalWeight}</strong></span>
              <span>Peso Homologado</span>
            </div>
          </div>
        </section>

        {/* Checkpoint Visual Compact Bar */}
        <section className="dev-control-checkpoint-bar">
          <div className="dev-control-checkpoint-item">
            <GitCommit style={{ width: 16, height: 16, color: 'var(--accent-blue)' }} />
            <span className="dev-control-checkpoint-label">Último checkpoint:</span>
            <span className="dev-control-checkpoint-value" style={{ fontFamily: 'var(--font-mono)' }}>{shortCommit}</span>
          </div>
          <div className="dev-control-checkpoint-item">
            <Activity style={{ width: 16, height: 16, color: 'var(--status-success)' }} />
            <span className="dev-control-checkpoint-label">Fase atual:</span>
            <span className="dev-control-checkpoint-value">3.5</span>
          </div>
          <div className="dev-control-checkpoint-item">
            <Zap style={{ width: 16, height: 16, color: 'var(--status-warning)' }} />
            <span className="dev-control-checkpoint-label">Próximo marco do MVP:</span>
            <span className="dev-control-checkpoint-value">Central de Impressão Universal</span>
          </div>
        </section>

        {/* Status Grid */}
        <section className="dev-control-status-grid">
          <div className="dev-control-status-pill">
            <span className="dev-control-status-pill-label">Frozen</span>
            <span className="dev-control-status-pill-count" style={{ color: 'var(--status-success)' }}>{progress.countsByStatus.FROZEN}</span>
          </div>
          <div className="dev-control-status-pill">
            <span className="dev-control-status-pill-label">Homologated</span>
            <span className="dev-control-status-pill-count" style={{ color: 'var(--accent-cyan)' }}>{progress.countsByStatus.HOMOLOGATED}</span>
          </div>
          <div className="dev-control-status-pill">
            <span className="dev-control-status-pill-label">Validation</span>
            <span className="dev-control-status-pill-count" style={{ color: 'var(--status-warning)' }}>{progress.countsByStatus.VALIDATION}</span>
          </div>
          <div className="dev-control-status-pill">
            <span className="dev-control-status-pill-label">Implemented</span>
            <span className="dev-control-status-pill-count" style={{ color: 'var(--accent-blue)' }}>{progress.countsByStatus.IMPLEMENTED}</span>
          </div>
          <div className="dev-control-status-pill">
            <span className="dev-control-status-pill-label">In Progress</span>
            <span className="dev-control-status-pill-count" style={{ color: 'var(--accent-purple)' }}>{progress.countsByStatus.IN_PROGRESS}</span>
          </div>
          <div className="dev-control-status-pill">
            <span className="dev-control-status-pill-label">Planned</span>
            <span className="dev-control-status-pill-count" style={{ color: 'var(--text-muted)' }}>{progress.countsByStatus.PLANNED}</span>
          </div>
          <div className="dev-control-status-pill">
            <span className="dev-control-status-pill-label">Blocked</span>
            <span className="dev-control-status-pill-count" style={{ color: 'var(--status-danger)' }}>{progress.countsByStatus.BLOCKED}</span>
          </div>
        </section>

        {/* Navigation Tabs */}
        <nav className="dev-control-tab-nav">
          <button
            onClick={() => setActiveTab('overview')}
            className={`dev-control-tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          >
            Visão Geral & Saúde
          </button>
          <button
            onClick={() => setActiveTab('modules')}
            className={`dev-control-tab-button ${activeTab === 'modules' ? 'active' : ''}`}
          >
            Módulos do Sistema ({modules.length})
          </button>
          <button
            onClick={() => setActiveTab('frozen')}
            className={`dev-control-tab-button ${activeTab === 'frozen' ? 'active' : ''}`}
          >
            Componentes Congelados ({frozenComponents.length})
          </button>
        </nav>

        {/* Tab 1: Visão Geral & Saúde */}
        {activeTab === 'overview' && (
          <section className="dev-control-health-grid">
            {Object.entries(health.dimensions).map(([key, dim]) => (
              <div key={key} className="dev-control-health-card">
                <div className="dev-control-health-card-header">
                  <div className="dev-control-health-card-title">
                    {getDimensionIcon(key)}
                    <span>{dim.name}</span>
                  </div>
                  {renderHealthBadge(dim.status)}
                </div>
                <p className="dev-control-health-card-desc">{dim.details}</p>
              </div>
            ))}
          </section>
        )}

        {/* Tab 2: Módulos do Sistema */}
        {activeTab === 'modules' && (
          <section className="dev-control-modules-grid">
            {modules.map((mod: DevelopmentModuleProgress) => (
              <div key={mod.id} className="dev-control-module-card">
                <div>
                  <div className="dev-control-module-header">
                    <h3 className="dev-control-module-name">{mod.name}</h3>
                    {renderStatusBadge(mod.status)}
                  </div>
                  <p className="dev-control-module-desc">{mod.description}</p>
                </div>

                <div className="dev-control-module-progress-row">
                  <div>
                    <div className="dev-control-module-progress-info">
                      <span>Implementação</span>
                      <strong>{mod.implementationPercent}%</strong>
                    </div>
                    <div className="dev-control-progress-track" style={{ height: 6, marginTop: 4, marginBottom: 0 }}>
                      <div
                        className="dev-control-progress-fill dev-control-progress-fill-primary"
                        style={{ width: `${mod.implementationPercent}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="dev-control-module-progress-info">
                      <span>Homologação</span>
                      <strong>{mod.homologationPercent}%</strong>
                    </div>
                    <div className="dev-control-progress-track" style={{ height: 6, marginTop: 4, marginBottom: 0 }}>
                      <div
                        className="dev-control-progress-fill dev-control-progress-fill-emerald"
                        style={{ width: `${mod.homologationPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="dev-control-module-footer">
                  <span>Caps: <strong>{mod.implementedCapabilities} / {mod.totalCapabilities}</strong></span>
                  <span>Peso: <strong>{mod.implementedWeight} / {mod.totalWeight}</strong></span>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Tab 3: Componentes Congelados */}
        {activeTab === 'frozen' && (
          <section className="dev-control-frozen-grid">
            {frozenComponents.map((fc) => (
              <div key={fc.id} className="dev-control-frozen-card">
                <div className="dev-control-frozen-header">
                  <div className="dev-control-frozen-title">
                    <Lock style={{ width: 18, height: 18, color: 'var(--status-success)' }} />
                    <span>{fc.name}</span>
                  </div>
                  <span className="dev-control-frozen-patch-badge">PATCH {fc.frozenSincePatch}</span>
                </div>
                <p className="dev-control-frozen-desc">{fc.description}</p>
                <div className="dev-control-frozen-reason-box">
                  <strong>MOTIVO DA PROTEÇÃO:</strong>
                  <span>{fc.reason}</span>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
};
