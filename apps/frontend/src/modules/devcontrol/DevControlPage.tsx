import React, { useEffect, useState } from 'react';
import {
  Gauge,
  CheckCircle2,
  Lock,
  Clock,
  ArrowLeft,
  Activity,
  Layers,
  GitCommit,
  Building2,
  RefreshCw,
  AlertTriangle,
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
  const [activeTab, setActiveTab] = useState<'overview' | 'modules' | 'roadmap' | 'checkpoints' | 'frozen'>('overview');

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
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm font-medium text-slate-400">Carregando governança do produto...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-slate-100">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <h2 className="text-xl font-bold">Acesso Restrito ou Indisponível</h2>
        <p className="max-w-md text-center text-sm text-slate-400">{error || 'Não foi possível carregar os dados.'}</p>
        <button
          onClick={onGoHome}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao Início
        </button>
      </div>
    );
  }

  const { project, progress, health, frozenComponents, modules, phases } = data;

  const renderStatusBadge = (status: DevelopmentStatus) => {
    const badgeMap: Record<DevelopmentStatus, { label: string; bg: string; text: string }> = {
      FROZEN: { label: '🔒 Frozen', bg: 'bg-emerald-950/80 border-emerald-500/50', text: 'text-emerald-300' },
      HOMOLOGATED: { label: '✓ Homologado', bg: 'bg-teal-950/80 border-teal-500/50', text: 'text-teal-300' },
      VALIDATION: { label: '⚡ Em Validação', bg: 'bg-amber-950/80 border-amber-500/50', text: 'text-amber-300' },
      IMPLEMENTED: { label: '⚙️ Implementado', bg: 'bg-blue-950/80 border-blue-500/50', text: 'text-blue-300' },
      IN_PROGRESS: { label: '🔄 Em Dev', bg: 'bg-indigo-950/80 border-indigo-500/50', text: 'text-indigo-300' },
      READY: { label: '📋 Pronto para Dev', bg: 'bg-purple-950/80 border-purple-500/50', text: 'text-purple-300' },
      PLANNED: { label: '🗓️ Planejado', bg: 'bg-slate-900 border-slate-700', text: 'text-slate-400' },
      BLOCKED: { label: '🚫 Bloqueado', bg: 'bg-rose-950/80 border-rose-500/50', text: 'text-rose-300' },
      UNMAPPED: { label: '❓ Não Mapeado', bg: 'bg-slate-900 border-slate-700', text: 'text-slate-500' },
    };

    const cfg = badgeMap[status] || badgeMap.PLANNED;
    return (
      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
        {cfg.label}
      </span>
    );
  };

  const renderHealthBadge = (status: ProjectHealthStatus) => {
    const map: Record<ProjectHealthStatus, { label: string; color: string }> = {
      HEALTHY: { label: 'Saudável', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' },
      ATTENTION: { label: 'Atenção', color: 'text-amber-400 bg-amber-950/60 border-amber-800' },
      BLOCKED: { label: 'Crítico', color: 'text-rose-400 bg-rose-950/60 border-rose-800' },
      UNKNOWN: { label: 'Desconhecido', color: 'text-slate-400 bg-slate-900 border-slate-800' },
    };
    const c = map[status] || map.UNKNOWN;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${c.color}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {c.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onGoHome}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              title="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-600/20 p-2 text-blue-400 border border-blue-500/30">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white">{project.name}</h1>
                <p className="text-xs text-slate-400">Development Control Center 0.1.1</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-300">
              Ambiente: <strong className="text-blue-400">{project.environment.toUpperCase()}</strong>
            </span>
            <span className="rounded-md border border-emerald-800/60 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-400">
              Fase: <strong>{data.currentPhase.name}</strong>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Executive Hero */}
        <section className="mb-8 rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Fotografia de Progresso Sistêmico</h2>
              <p className="text-sm text-slate-400">Visão desacoplada de pesos de capacidades (MVP vs Full Roadmap)</p>
            </div>
            {renderHealthBadge(health.overall)}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* MVP Progress Box */}
            <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-5 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">Pronto para MVP Comercial</span>
                <span className="text-xs font-mono text-slate-400">
                  Impl: {progress.mvp.implementedWeight}/{progress.mvp.totalWeight} | Homolog: {progress.mvp.homologatedWeight}/{progress.mvp.totalWeight} peso
                </span>
              </div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold tracking-tight text-white">{progress.mvp.readinessPercent}%</span>
                <span className="text-xs text-blue-300 font-medium">Readiness Homologada</span>
              </div>
              <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-slate-800 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${progress.mvp.readinessPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Implementação: <strong className="text-slate-200">{progress.mvp.implementationPercent}%</strong></span>
                <span>Pendente p/ MVP: <strong className="text-amber-400">{progress.mvp.totalWeight - progress.mvp.homologatedWeight} peso</strong></span>
              </div>
            </div>

            {/* Full Roadmap Progress Box */}
            <div className="rounded-xl border border-purple-900/40 bg-purple-950/20 p-5 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">Roadmap Completo do Produto</span>
                <span className="text-xs font-mono text-slate-400">
                  Impl: {progress.fullRoadmap.implementedWeight}/{progress.fullRoadmap.totalWeight} | Homolog: {progress.fullRoadmap.homologatedWeight}/{progress.fullRoadmap.totalWeight} peso
                </span>
              </div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold tracking-tight text-white">{progress.fullRoadmap.readinessPercent}%</span>
                <span className="text-xs text-purple-300 font-medium">Conclusão Homologada</span>
              </div>
              <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-slate-800 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-600 via-indigo-500 to-teal-400 transition-all duration-500"
                  style={{ width: `${progress.fullRoadmap.readinessPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Implementação: <strong className="text-slate-200">{progress.fullRoadmap.implementationPercent}%</strong></span>
                <span>Total Capacidades: <strong className="text-slate-200">{progress.totalCapabilities}</strong></span>
              </div>
            </div>
          </div>

          {/* Counts Grid */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-center">
              <span className="text-xs text-slate-400">Frozen</span>
              <p className="text-lg font-bold text-emerald-400">{progress.countsByStatus.FROZEN}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-center">
              <span className="text-xs text-slate-400">Homologated</span>
              <p className="text-lg font-bold text-teal-400">{progress.countsByStatus.HOMOLOGATED}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-center">
              <span className="text-xs text-slate-400">Validation</span>
              <p className="text-lg font-bold text-amber-400">{progress.countsByStatus.VALIDATION}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-center">
              <span className="text-xs text-slate-400">Implemented</span>
              <p className="text-lg font-bold text-blue-400">{progress.countsByStatus.IMPLEMENTED}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-center">
              <span className="text-xs text-slate-400">In Progress</span>
              <p className="text-lg font-bold text-indigo-400">{progress.countsByStatus.IN_PROGRESS}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-center">
              <span className="text-xs text-slate-400">Planned</span>
              <p className="text-lg font-bold text-slate-300">{progress.countsByStatus.PLANNED}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-center">
              <span className="text-xs text-slate-400">Blocked</span>
              <p className="text-lg font-bold text-rose-400">{progress.countsByStatus.BLOCKED}</p>
            </div>
          </div>
        </section>

        {/* Tab Navigation */}
        <div className="mb-6 flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab('overview')}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'overview' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Visão Geral & Saúde
          </button>
          <button
            onClick={() => setActiveTab('modules')}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'modules' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Módulos do Sistema ({modules.length})
          </button>
          <button
            onClick={() => setActiveTab('frozen')}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'frozen' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Componentes Congelados ({frozenComponents.length})
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Health Overview */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-2">
              <h3 className="mb-4 text-base font-bold text-white flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-400" /> Saúde Sistêmica do Produto
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {Object.entries(health.dimensions).map(([key, dim]) => (
                  <div key={key} className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">{dim.name}</span>
                      {renderHealthBadge(dim.status)}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{dim.details}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Frozen Summary */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="mb-4 text-base font-bold text-white flex items-center gap-2">
                <Lock className="h-5 w-5 text-emerald-400" /> Componentes Congelados
              </h3>
              <div className="space-y-3">
                {frozenComponents.map((fc) => (
                  <div key={fc.id} className="rounded-lg border border-emerald-900/30 bg-emerald-950/20 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-300">{fc.name}</span>
                      <span className="text-[10px] font-mono text-emerald-500">Patch {fc.frozenSincePatch}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{fc.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'modules' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((mod: DevelopmentModuleProgress) => (
              <div key={mod.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">{mod.name}</h4>
                  {renderStatusBadge(mod.status)}
                </div>
                <p className="mb-4 text-xs text-slate-400 h-10 overflow-hidden text-ellipsis">{mod.description}</p>

                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1 text-slate-300">
                      <span>Implementação</span>
                      <span>{mod.implementationPercent}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${mod.implementationPercent}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1 text-slate-300">
                      <span>Homologação</span>
                      <span>{mod.homologationPercent}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-400" style={{ width: `${mod.homologationPercent}%` }} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>Caps: {mod.implementedCapabilities}/{mod.totalCapabilities}</span>
                  <span>Peso: {mod.implementedWeight}/{mod.totalWeight}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'frozen' && (
          <div className="space-y-4">
            {frozenComponents.map((fc) => (
              <div key={fc.id} className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-emerald-400" />
                    <h4 className="text-base font-bold text-white">{fc.name}</h4>
                  </div>
                  <span className="rounded-md border border-emerald-800 bg-emerald-950 px-3 py-1 text-xs font-mono text-emerald-300">
                    Congelado no Patch {fc.frozenSincePatch}
                  </span>
                </div>
                <p className="text-sm text-slate-300 mb-2">{fc.description}</p>
                <div className="text-xs text-slate-400 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <strong className="text-emerald-400">Motivo da Proteção:</strong> {fc.reason}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
