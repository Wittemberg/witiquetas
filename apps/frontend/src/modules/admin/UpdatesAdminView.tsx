import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  History,
  FileText,
  Edit3,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Tag,
  Info,
  Calendar,
  Save,
} from 'lucide-react';
import { updatesApi } from '../../services/updatesApi.js';
import type {
  UpdateCenterOverviewDTO,
  ReleaseManifestDTO,
  UpdateCheckResultDTO,
  ReleaseChannel,
  ReleaseType,
} from '@witiquetas/contracts';

interface UpdatesAdminViewProps {
  canManage?: boolean;
}

type SubTab = 'notes' | 'history' | 'editor';

export const UpdatesAdminView: React.FC<UpdatesAdminViewProps> = ({ canManage = false }) => {
  const [overview, setOverview] = useState<UpdateCenterOverviewDTO | null>(null);
  const [history, setHistory] = useState<ReleaseManifestDTO[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('notes');
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<UpdateCheckResultDTO | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Editor Form State
  const [editVersion, setEditVersion] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editChannel, setEditChannel] = useState<ReleaseChannel>('STABLE');
  const [editType, setEditType] = useState<ReleaseType>('FEATURE');
  const [editHighlightsText, setEditHighlightsText] = useState('');
  const [editBreakingText, setEditBreakingText] = useState('');
  const [editChangelog, setEditChangelog] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [ovData, histData] = await Promise.all([
        updatesApi.getOverview(),
        updatesApi.getHistory(),
      ]);
      setOverview(ovData);
      setHistory(histData);

      // Define versão inicial selecionada (última ou ativa)
      if (ovData.latestRelease) {
        setSelectedVersion(ovData.latestRelease.version);
      } else if (histData.length > 0) {
        setSelectedVersion(histData[0].version);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar informações da Central de Atualizações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Preenche formulário de edição quando seleciona uma versão
  const populateEditor = (manifest: ReleaseManifestDTO) => {
    setEditVersion(manifest.version);
    setEditTitle(manifest.title);
    setEditSummary(manifest.summary);
    setEditChannel(manifest.channel);
    setEditType(manifest.type);
    setEditHighlightsText(manifest.highlights.join('\n'));
    setEditBreakingText(manifest.breakingChanges.join('\n'));
    setEditChangelog(manifest.changelogMarkdown);
  };

  const handleCheckUpdates = async () => {
    try {
      setChecking(true);
      setError(null);
      setCheckResult(null);
      const res = await updatesApi.checkForUpdates();
      setCheckResult(res);
      // Recarrega overview atualizado
      const ovData = await updatesApi.getOverview();
      setOverview(ovData);
    } catch (err: any) {
      setError(err.message || 'Erro ao checar atualizações.');
    } finally {
      setChecking(false);
    }
  };

  const handleSaveReleaseNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVersion.trim()) {
      setError('A versão é obrigatória.');
      return;
    }
    if (!editTitle.trim()) {
      setError('O título da release é obrigatório.');
      return;
    }

    try {
      setSavingNote(true);
      setError(null);
      setSaveSuccess(null);

      const highlights = editHighlightsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const breakingChanges = editBreakingText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const updated = await updatesApi.updateReleaseNote(editVersion.trim(), {
        title: editTitle.trim(),
        summary: editSummary.trim(),
        channel: editChannel,
        type: editType,
        highlights,
        breakingChanges,
        changelogMarkdown: editChangelog,
      });

      setSaveSuccess(`Notas da versão ${updated.version} salvas com sucesso!`);
      // Atualiza lista em memória
      await loadData();
      setSelectedVersion(updated.version);
      setActiveSubTab('notes');
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar notas de versão.');
    } finally {
      setSavingNote(false);
    }
  };

  const currentManifest = history.find((m) => m.version === selectedVersion) || overview?.latestRelease;

  return (
    <div className="updates-admin-container" style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 1. Header & Status Principal */}
      <div
        className="updates-header-card"
        style={{
          background: 'var(--bg-surface, #1e293b)',
          border: '1px solid var(--border-color, #334155)',
          borderRadius: '16px',
          padding: '1.75rem',
          marginBottom: '1.5rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  padding: '8px',
                  borderRadius: '10px',
                  color: 'var(--color-primary, #3b82f6)',
                }}
              >
                <Layers size={24} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>Central de Atualizações</h2>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #94a3b8)' }}>
                  Plataforma Witiquetas — Governança e Versões
                </span>
              </div>
            </div>

            {overview && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>Versão Atual: </span>
                  <strong style={{ color: 'var(--text-primary, #f8fafc)' }}>v{overview.currentVersion.version}</strong>
                  <span
                    style={{
                      marginLeft: '6px',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      background: 'rgba(255,255,255,0.08)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    {overview.currentVersion.shortCommit}
                  </span>
                </div>

                <div style={{ fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>Canal: </span>
                  <span
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    {overview.channel}
                  </span>
                </div>

                <div style={{ fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>Status: </span>
                  {overview.hasUpdate ? (
                    <span
                      style={{
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Sparkles size={12} />
                      Nova Versão Disponível ({overview.latestRelease?.version})
                    </span>
                  ) : (
                    <span
                      style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle2 size={12} />
                      Sistema Atualizado
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              onClick={handleCheckUpdates}
              disabled={checking || loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'var(--color-primary, #3b82f6)',
                color: '#fff',
                border: 'none',
                padding: '0.65rem 1.25rem',
                borderRadius: '8px',
                cursor: checking ? 'not-allowed' : 'pointer',
                fontWeight: 500,
                fontSize: '0.875rem',
                transition: 'all 0.2s',
                opacity: checking ? 0.7 : 1,
              }}
            >
              <RefreshCw size={16} className={checking ? 'spin-animation' : ''} />
              {checking ? 'Verificando...' : 'Verificar Atualizações'}
            </button>
          </div>
        </div>

        {/* Notificação da checagem simulada */}
        {checkResult && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: checkResult.hasUpdate ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              border: checkResult.hasUpdate ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              color: checkResult.hasUpdate ? '#60a5fa' : '#34d399',
            }}
          >
            <Info size={16} />
            <span>{checkResult.message}</span>
          </div>
        )}

        {/* Banner de Salvaguarda Sprint 1 */}
        <div
          style={{
            marginTop: '1.25rem',
            padding: '0.75rem 1rem',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.825rem',
            color: '#fbbf24',
          }}
        >
          <ShieldCheck size={18} />
          <div>
            <strong>Sprint 1 — Fundação & Governança:</strong> O mecanismo ativo de aplicação de containers está desativado nesta fase de desenvolvimento. Todas as consultas e verificações são estritamente declarativas e seguras.
          </div>
        </div>
      </div>

      {/* Alertas de Erro / Sucesso */}
      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '1rem',
            borderRadius: '8px',
            color: '#f87171',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '1rem',
            borderRadius: '8px',
            color: '#34d399',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle2 size={18} />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* 2. Sub-Navegação interna (Abas) */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color, #334155)', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveSubTab('notes')}
          style={{
            padding: '0.65rem 1.25rem',
            background: 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'notes' ? '2px solid var(--color-primary, #3b82f6)' : '2px solid transparent',
            color: activeSubTab === 'notes' ? 'var(--color-primary, #3b82f6)' : 'var(--text-secondary, #94a3b8)',
            cursor: 'pointer',
            fontWeight: activeSubTab === 'notes' ? 600 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <FileText size={16} />
          O que há de novo (Release Notes)
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          style={{
            padding: '0.65rem 1.25rem',
            background: 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'history' ? '2px solid var(--color-primary, #3b82f6)' : '2px solid transparent',
            color: activeSubTab === 'history' ? 'var(--color-primary, #3b82f6)' : 'var(--text-secondary, #94a3b8)',
            cursor: 'pointer',
            fontWeight: activeSubTab === 'history' ? 600 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <History size={16} />
          Histórico de Versões ({history.length})
        </button>

        {canManage && (
          <button
            onClick={() => {
              if (currentManifest) populateEditor(currentManifest);
              setActiveSubTab('editor');
            }}
            style={{
              padding: '0.65rem 1.25rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeSubTab === 'editor' ? '2px solid var(--color-primary, #3b82f6)' : '2px solid transparent',
              color: activeSubTab === 'editor' ? 'var(--color-primary, #3b82f6)' : 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              fontWeight: activeSubTab === 'editor' ? 600 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Edit3 size={16} />
            Editor de Notas de Versão
          </button>
        )}
      </div>

      {/* 3. Conteúdo da Aba 1: O que há de novo */}
      {activeSubTab === 'notes' && (
        <div>
          {/* Seletor de Versão */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #94a3b8)' }}>Selecionar versão:</span>
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              style={{
                background: 'var(--bg-surface, #1e293b)',
                color: 'var(--text-primary, #f8fafc)',
                border: '1px solid var(--border-color, #334155)',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
              }}
            >
              {history.map((m) => (
                <option key={m.version} value={m.version}>
                  v{m.version} — {m.title}
                </option>
              ))}
            </select>
          </div>

          {currentManifest ? (
            <div
              style={{
                background: 'var(--bg-surface, #1e293b)',
                border: '1px solid var(--border-color, #334155)',
                borderRadius: '16px',
                padding: '2rem',
              }}
            >
              {/* Header do Manifesto */}
              <div style={{ borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span
                    style={{
                      background: 'var(--color-primary, #3b82f6)',
                      color: '#fff',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    v{currentManifest.version}
                  </span>
                  <span
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                    }}
                  >
                    {currentManifest.type}
                  </span>
                  <span
                    style={{
                      color: 'var(--text-secondary, #94a3b8)',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginLeft: 'auto',
                    }}
                  >
                    <Calendar size={14} />
                    {new Date(currentManifest.releaseDate).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.35rem', fontWeight: 600 }}>{currentManifest.title}</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem' }}>{currentManifest.summary}</p>
              </div>

              {/* Destaques (Highlights) */}
              {currentManifest.highlights && currentManifest.highlights.length > 0 && (
                <div style={{ marginBottom: '1.75rem' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600, color: 'var(--color-primary, #3b82f6)' }}>
                    ✨ Principais Destaques
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
                    {currentManifest.highlights.map((h, i) => (
                      <div
                        key={i}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          borderRadius: '8px',
                          padding: '0.75rem 1rem',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.5rem',
                          fontSize: '0.875rem',
                        }}
                      >
                        <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Breaking Changes */}
              {currentManifest.breakingChanges && currentManifest.breakingChanges.length > 0 && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1.75rem',
                  }}
                >
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 600, color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={16} /> Atenção: Mudanças de Compatibilidade (Breaking Changes)
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#fca5a5' }}>
                    {currentManifest.breakingChanges.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Migrações do Banco */}
              {currentManifest.requiredMigrations && currentManifest.requiredMigrations.length > 0 && (
                <div style={{ marginBottom: '1.75rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)' }}>
                    🗄️ Migrações de Banco Exigidas
                  </h4>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {currentManifest.requiredMigrations.map((m, i) => (
                      <span
                        key={i}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color, #334155)',
                        }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Changelog Markdown formatado */}
              {currentManifest.changelogMarkdown && (
                <div>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600 }}>Notas Detalhadas e Registro de Alterações</h4>
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      padding: '1.25rem',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      border: '1px solid var(--border-color, #334155)',
                    }}
                  >
                    {currentManifest.changelogMarkdown}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary, #94a3b8)' }}>
              Nenhuma nota de versão encontrada para a seleção.
            </div>
          )}
        </div>
      )}

      {/* 4. Conteúdo da Aba 2: Histórico de Versões */}
      {activeSubTab === 'history' && (
        <div
          style={{
            background: 'var(--bg-surface, #1e293b)',
            border: '1px solid var(--border-color, #334155)',
            borderRadius: '16px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid var(--border-color, #334155)' }}>
                <th style={{ padding: '1rem' }}>Versão</th>
                <th style={{ padding: '1rem' }}>Data</th>
                <th style={{ padding: '1rem' }}>Tipo</th>
                <th style={{ padding: '1rem' }}>Título</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {history.map((m) => (
                <tr
                  key={m.version}
                  style={{
                    borderBottom: '1px solid var(--border-color, #334155)',
                    transition: 'background 0.2s',
                  }}
                >
                  <td style={{ padding: '1rem', fontWeight: 600 }}>
                    <span style={{ color: 'var(--color-primary, #3b82f6)' }}>v{m.version}</span>
                    {m.version === overview?.currentVersion.version && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '0.7rem',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        Em Execução
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', color: 'var(--text-secondary, #94a3b8)' }}>
                    {new Date(m.releaseDate).toLocaleDateString('pt-BR')}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                      }}
                    >
                      {m.type}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>{m.title}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button
                      onClick={() => {
                        setSelectedVersion(m.version);
                        setActiveSubTab('notes');
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-color, #334155)',
                        color: 'var(--text-primary, #f8fafc)',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                    >
                      Ver Notas
                    </button>
                    {canManage && (
                      <button
                        onClick={() => {
                          populateEditor(m);
                          setActiveSubTab('editor');
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-primary, #3b82f6)',
                          padding: '0.35rem 0.5rem',
                          cursor: 'pointer',
                          marginLeft: '6px',
                          fontSize: '0.8rem',
                        }}
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Conteúdo da Aba 3: Editor de Notas de Versão */}
      {activeSubTab === 'editor' && canManage && (
        <div
          style={{
            background: 'var(--bg-surface, #1e293b)',
            border: '1px solid var(--border-color, #334155)',
            borderRadius: '16px',
            padding: '2rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Editor de Notas de Versão</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary, #94a3b8)' }}>
                Componha e publique notas de versão para informar operadores e administradores sobre melhorias e correções.
              </p>
            </div>
            <button
              onClick={() => {
                setEditVersion('');
                setEditTitle('');
                setEditSummary('');
                setEditHighlightsText('');
                setEditBreakingText('');
                setEditChangelog('');
              }}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color, #334155)',
                color: 'var(--text-secondary, #94a3b8)',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Limpar / Novo Rascunho
            </button>
          </div>

          <form onSubmit={handleSaveReleaseNote}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500 }}>
                  Versão Semântica *
                </label>
                <input
                  type="text"
                  placeholder="ex: 5.8.0"
                  value={editVersion}
                  onChange={(e) => setEditVersion(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid var(--border-color, #334155)',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '6px',
                    color: 'var(--text-primary, #f8fafc)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500 }}>
                  Canal
                </label>
                <select
                  value={editChannel}
                  onChange={(e) => setEditChannel(e.target.value as ReleaseChannel)}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid var(--border-color, #334155)',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '6px',
                    color: 'var(--text-primary, #f8fafc)',
                  }}
                >
                  <option value="STABLE">STABLE (Estável)</option>
                  <option value="BETA">BETA (Homologação)</option>
                  <option value="NIGHTLY">NIGHTLY (Desenvolvimento)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500 }}>
                  Tipo de Versão
                </label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as ReleaseType)}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid var(--border-color, #334155)',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '6px',
                    color: 'var(--text-primary, #f8fafc)',
                  }}
                >
                  <option value="FEATURE">FEATURE (Nova Funcionalidade)</option>
                  <option value="IMPROVEMENT">IMPROVEMENT (Melhoria)</option>
                  <option value="PATCH">PATCH (Correção Menor)</option>
                  <option value="HOTFIX">HOTFIX (Correção Crítica)</option>
                  <option value="MAJOR">MAJOR (Marco Estrutural)</option>
                  <option value="SECURITY">SECURITY (Segurança)</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500 }}>
                Título da Release *
              </label>
              <input
                type="text"
                placeholder="ex: 5.8.0 — Central de Atualizações e Governança"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid var(--border-color, #334155)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  color: 'var(--text-primary, #f8fafc)',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500 }}>
                Resumo Executivo
              </label>
              <textarea
                rows={2}
                placeholder="Breve descrição dos principais impactos desta versão..."
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid var(--border-color, #334155)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  color: 'var(--text-primary, #f8fafc)',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500 }}>
                  Destaques (um por linha)
                </label>
                <textarea
                  rows={4}
                  placeholder="Nova aba de atualizações&#10;Melhoria no tempo de resposta&#10;Suporte estendido a etiquetas industriais"
                  value={editHighlightsText}
                  onChange={(e) => setEditHighlightsText(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid var(--border-color, #334155)',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '6px',
                    color: 'var(--text-primary, #f8fafc)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500 }}>
                  Breaking Changes (um por linha, opcional)
                </label>
                <textarea
                  rows={4}
                  placeholder="Exige aplicação da Migration 011&#10;Requer versão mínima 0.2.0 do Agent"
                  value={editBreakingText}
                  onChange={(e) => setEditBreakingText(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid var(--border-color, #334155)',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '6px',
                    color: 'var(--text-primary, #f8fafc)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 500 }}>
                Changelog Detalhado (Markdown)
              </label>
              <textarea
                rows={6}
                placeholder="### Novidades&#10;- Detalhe 1...&#10;&#10;### Correções&#10;- Correção de bug..."
                value={editChangelog}
                onChange={(e) => setEditChangelog(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid var(--border-color, #334155)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  color: 'var(--text-primary, #f8fafc)',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setActiveSubTab('notes')}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color, #334155)',
                  color: 'var(--text-secondary, #94a3b8)',
                  padding: '0.65rem 1.25rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingNote}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'var(--color-primary, #3b82f6)',
                  color: '#fff',
                  border: 'none',
                  padding: '0.65rem 1.5rem',
                  borderRadius: '8px',
                  cursor: savingNote ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                }}
              >
                <Save size={16} />
                {savingNote ? 'Salvando...' : 'Salvar Notas de Versão'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
