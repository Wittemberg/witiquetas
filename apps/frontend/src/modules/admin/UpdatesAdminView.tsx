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
    <div className="updates-admin-container" style={{ padding: '0 0.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 1. Header & Status Principal */}
      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.5rem' }}>
              <div className="admin-card-header-icon">
                <Layers size={22} />
              </div>
              <div>
                <h2 className="admin-card-title" style={{ fontSize: '1.35rem' }}>Central de Atualizações</h2>
                <p className="admin-card-subtitle">
                  Plataforma Witiquetas — Governança e Versões
                </p>
              </div>
            </div>

            {overview && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Versão Atual: </span>
                  <strong style={{ color: 'var(--text-primary)' }}>v{overview.currentVersion.version}</strong>
                  <span
                    style={{
                      marginLeft: '6px',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    {overview.currentVersion.shortCommit}
                  </span>
                </div>

                <div style={{ fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Canal: </span>
                  <span
                    style={{
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: 'var(--status-success)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    {overview.channel}
                  </span>
                </div>

                <div style={{ fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status: </span>
                  {overview.hasUpdate ? (
                    <span
                      style={{
                        background: 'rgba(59, 130, 246, 0.12)',
                        color: 'var(--accent-blue)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
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
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: 'var(--status-success)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
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
              className="btn btn-primary"
              style={{ padding: '0.55rem 1.15rem' }}
            >
              <RefreshCw size={15} className={checking ? 'spin-animation' : ''} />
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
              border: checkResult.hasUpdate ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              color: checkResult.hasUpdate ? 'var(--accent-blue)' : 'var(--status-success)',
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
            color: 'var(--text-primary)',
          }}
        >
          <ShieldCheck size={18} color="var(--status-warning)" style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ color: 'var(--status-warning)' }}>Sprint 1 — Fundação & Governança:</strong> O mecanismo ativo de aplicação de containers está desativado nesta fase de desenvolvimento. Todas as consultas e verificações são estritamente declarativas e seguras.
          </div>
        </div>
      </div>

      {/* Alertas de Erro / Sucesso */}
      {error && (
        <div className="admin-feedback-banner error">
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="admin-feedback-banner success">
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* 2. Sub-Navegação interna (Abas Padronizadas) */}
      <div className="admin-tabs-nav" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <button
          onClick={() => setActiveSubTab('notes')}
          className={`admin-tab-btn ${activeSubTab === 'notes' ? 'active' : ''}`}
        >
          <FileText size={15} />
          <span>O que há de novo (Release Notes)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          className={`admin-tab-btn ${activeSubTab === 'history' ? 'active' : ''}`}
        >
          <History size={15} />
          <span>Histórico de Versões ({history.length})</span>
        </button>

        {canManage && (
          <button
            onClick={() => {
              if (currentManifest) populateEditor(currentManifest);
              setActiveSubTab('editor');
            }}
            className={`admin-tab-btn ${activeSubTab === 'editor' ? 'active' : ''}`}
          >
            <Edit3 size={15} />
            <span>Editor de Notas de Versão</span>
          </button>
        )}
      </div>

      {/* 3. Conteúdo da Aba 1: O que há de novo */}
      {activeSubTab === 'notes' && (
        <div>
          {/* Seletor de Versão */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <span className="admin-label" style={{ whiteSpace: 'nowrap' }}>Selecionar versão:</span>
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="admin-select"
              style={{ maxWidth: '340px' }}
            >
              {history.map((m) => (
                <option key={m.version} value={m.version}>
                  v{m.version} — {m.title}
                </option>
              ))}
            </select>
          </div>

          {currentManifest ? (
            <div className="admin-card">
              {/* Header do Manifesto */}
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      background: 'var(--accent-blue)',
                      color: '#ffffff',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    v{currentManifest.version}
                  </span>
                  <span
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                    }}
                  >
                    {currentManifest.type}
                  </span>
                  <span
                    style={{
                      color: 'var(--text-muted)',
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
                <h3 className="admin-card-title" style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>{currentManifest.title}</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5 }}>{currentManifest.summary}</p>
              </div>

              {/* Destaques (Highlights) */}
              {currentManifest.highlights && currentManifest.highlights.length > 0 && (
                <div style={{ marginBottom: '1.75rem' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={16} /> Principais Destaques
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                    {currentManifest.highlights.map((h, i) => (
                      <div key={i} className="whats-new-highlight-card">
                        <CheckCircle2 size={16} color="var(--status-success)" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Breaking Changes */}
              {currentManifest.breakingChanges && currentManifest.breakingChanges.length > 0 && (
                <div className="whats-new-breaking-card" style={{ marginBottom: '1.75rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--status-danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={16} /> Atenção: Mudanças de Compatibilidade (Breaking Changes)
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    {currentManifest.breakingChanges.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Migrações do Banco */}
              {currentManifest.requiredMigrations && currentManifest.requiredMigrations.length > 0 && (
                <div style={{ marginBottom: '1.75rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    🗄️ Migrações de Banco Exigidas
                  </h4>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {currentManifest.requiredMigrations.map((m, i) => (
                      <span
                        key={i}
                        style={{
                          background: 'var(--bg-input)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.8rem',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-secondary)',
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
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Notas Detalhadas e Registro de Alterações</h4>
                  <div
                    style={{
                      background: 'var(--bg-input)',
                      padding: '1.25rem',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    {currentManifest.changelogMarkdown}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Nenhuma nota de versão encontrada para a seleção.
            </div>
          )}
        </div>
      )}

      {/* 4. Conteúdo da Aba 2: Histórico de Versões */}
      {activeSubTab === 'history' && (
        <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Versão</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Data</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Tipo</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Título</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {history.map((m) => (
                <tr
                  key={m.version}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                    <span style={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>v{m.version}</span>
                    {m.version === overview?.currentVersion.version && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '0.7rem',
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: 'var(--status-success)',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        Em Execução
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>
                    {new Date(m.releaseDate).toLocaleDateString('pt-BR')}
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <span
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {m.type}
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-primary)' }}>{m.title}</td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => {
                        setSelectedVersion(m.version);
                        setActiveSubTab('notes');
                      }}
                      className="btn"
                      style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
                    >
                      Ver Notas
                    </button>
                    {canManage && (
                      <button
                        onClick={() => {
                          populateEditor(m);
                          setActiveSubTab('editor');
                        }}
                        className="btn"
                        style={{
                          marginLeft: '6px',
                          fontSize: '0.78rem',
                          padding: '0.3rem 0.65rem',
                          color: 'var(--accent-blue)',
                          borderColor: 'var(--border-color)',
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
        <div className="admin-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 className="admin-card-title">Editor de Notas de Versão</h3>
              <p className="admin-card-subtitle">
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
              className="btn"
              style={{ fontSize: '0.8rem' }}
            >
              Limpar / Novo Rascunho
            </button>
          </div>

          <form onSubmit={handleSaveReleaseNote}>
            <div className="admin-form-grid" style={{ marginBottom: '1.25rem' }}>
              <div className="admin-form-group">
                <label className="admin-label">
                  Versão Semântica *
                </label>
                <input
                  type="text"
                  placeholder="ex: 5.8.0"
                  value={editVersion}
                  onChange={(e) => setEditVersion(e.target.value)}
                  required
                  className="admin-input"
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">
                  Canal
                </label>
                <select
                  value={editChannel}
                  onChange={(e) => setEditChannel(e.target.value as ReleaseChannel)}
                  className="admin-select"
                >
                  <option value="STABLE">STABLE (Estável)</option>
                  <option value="BETA">BETA (Homologação)</option>
                  <option value="NIGHTLY">NIGHTLY (Desenvolvimento)</option>
                </select>
              </div>

              <div className="admin-form-group admin-form-group-full">
                <label className="admin-label">
                  Tipo de Versão
                </label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as ReleaseType)}
                  className="admin-select"
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

            <div className="admin-form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="admin-label">
                Título da Release *
              </label>
              <input
                type="text"
                placeholder="ex: 5.8.0 — Central de Atualizações e Governança"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                className="admin-input"
              />
            </div>

            <div className="admin-form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="admin-label">
                Resumo Executivo
              </label>
              <textarea
                rows={2}
                placeholder="Breve descrição dos principais impactos desta versão..."
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                className="admin-textarea"
              />
            </div>

            <div className="admin-form-grid" style={{ marginBottom: '1.25rem' }}>
              <div className="admin-form-group">
                <label className="admin-label">
                  Destaques (um por linha)
                </label>
                <textarea
                  rows={4}
                  placeholder="Nova aba de atualizações&#10;Melhoria no tempo de resposta&#10;Suporte estendido a etiquetas industriais"
                  value={editHighlightsText}
                  onChange={(e) => setEditHighlightsText(e.target.value)}
                  className="admin-textarea"
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">
                  Breaking Changes (um por linha, opcional)
                </label>
                <textarea
                  rows={4}
                  placeholder="Exige aplicação da Migration 011&#10;Requer versão mínima 0.2.0 do Agent"
                  value={editBreakingText}
                  onChange={(e) => setEditBreakingText(e.target.value)}
                  className="admin-textarea"
                />
              </div>
            </div>

            <div className="admin-form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="admin-label">
                Changelog Detalhado (Markdown)
              </label>
              <textarea
                rows={6}
                placeholder="### Novidades&#10;- Detalhe 1...&#10;&#10;### Correções&#10;- Correção de bug..."
                value={editChangelog}
                onChange={(e) => setEditChangelog(e.target.value)}
                className="admin-textarea"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
              />
            </div>

            <div className="admin-form-actions">
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('notes')}
                  className="btn"
                  style={{ padding: '0.55rem 1.25rem' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingNote}
                  className="btn btn-primary"
                  style={{ padding: '0.55rem 1.35rem' }}
                >
                  <Save size={15} />
                  {savingNote ? 'Salvando...' : 'Salvar Notas de Versão'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
