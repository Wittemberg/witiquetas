import React, { useState, useEffect } from 'react';
import type { TemplateSummaryDTO } from '@witiquetas/contracts';
import { templatesApi } from '../../services/templatesApi.js';
import { RenameModelModal, DeleteModelModal } from './ModelActionModals.js';

interface ModelsPageProps {
  onOpenModel: (id: string) => void;
  onCreateNew: () => void;
}

export const ModelsPage: React.FC<ModelsPageProps> = ({ onOpenModel, onCreateNew }) => {
  const [templates, setTemplates] = useState<TemplateSummaryDTO[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modais state
  const [actionMenuOpenId, setActionMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<TemplateSummaryDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TemplateSummaryDTO | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTemplates = async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const items = await templatesApi.listTemplates(search);
      setTemplates(items);
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar seus modelos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates(searchQuery);
  }, [searchQuery]);

  const handleDuplicate = async (t: TemplateSummaryDTO) => {
    setActionMenuOpenId(null);
    setLoading(true);
    try {
      await templatesApi.duplicateTemplate(t.id);
      await fetchTemplates(searchQuery);
    } catch (err: any) {
      alert(`Falha ao duplicar modelo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRename = async (newTitle: string) => {
    if (!renameTarget) return;
    setActionLoading(true);
    try {
      await templatesApi.renameTemplate(renameTarget.id, newTitle);
      setRenameTarget(null);
      await fetchTemplates(searchQuery);
    } catch (err: any) {
      alert(`Falha ao renomear modelo: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      await templatesApi.deleteTemplate(deleteTarget.id);
      setDeleteTarget(null);
      await fetchTemplates(searchQuery);
    } catch (err: any) {
      alert(`Falha ao excluir modelo: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const formatLastModified = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="models-page-container">
      {/* Header da Página */}
      <div className="models-page-header">
        <div>
          <h1 className="models-page-title">Meus Modelos</h1>
          <p className="models-page-subtitle">
            Crie, organize e reutilize seus modelos de etiquetas térmicas.
          </p>
        </div>

        <button type="button" className="wizard-primary-btn" onClick={onCreateNew}>
          + Nova Etiqueta
        </button>
      </div>

      {/* Barra de Busca Unificada */}
      <div className="models-search-bar" style={{ margin: '1.5rem 0' }}>
        <input
          type="text"
          className="niche-search-input"
          style={{ width: '100%', maxWidth: '540px', padding: '0.7rem 1rem' }}
          placeholder="Buscar modelo por nome, nicho, dimensão ou linguagem..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Estado de Erro */}
      {error && (
        <div className="models-error-state" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: '#ef4444', fontWeight: 600, marginBottom: '1rem' }}>{error}</p>
          <button
            type="button"
            className="niche-card-btn"
            onClick={() => fetchTemplates(searchQuery)}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Skeleton Loading State */}
      {loading && !error && (
        <div className="models-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="model-card skeleton-card">
              <div className="skeleton-preview" />
              <div className="skeleton-title" />
              <div className="skeleton-meta" />
            </div>
          ))}
        </div>
      )}

      {/* Estado Vazio (Empty State) */}
      {!loading && !error && templates.length === 0 && (
        <div className="models-empty-state">
          <div className="empty-icon">📄</div>
          <h2>Nenhum modelo salvo ainda</h2>
          <p>Crie seu primeiro modelo escolhendo um nicho e um formato de etiqueta.</p>
          <button
            type="button"
            className="wizard-primary-btn"
            style={{ marginTop: '1.25rem' }}
            onClick={onCreateNew}
          >
            Criar primeira etiqueta
          </button>
        </div>
      )}

      {/* Grid de Cards de Modelos */}
      {!loading && !error && templates.length > 0 && (
        <div className="models-grid">
          {templates.map((t) => (
            <div key={t.id} className="model-card">
              {/* Preview Visual Proporcional e Leve */}
              <div className="model-card-preview">
                <div
                  className="model-card-mini-canvas"
                  style={{
                    aspectRatio: `${t.widthMm} / ${t.heightMm}`,
                    maxHeight: '80px',
                    maxWidth: '180px',
                  }}
                >
                  <span className="mini-dim-label">
                    {t.widthMm}×{t.heightMm}mm
                  </span>
                </div>
              </div>

              {/* Informações do Modelo */}
              <div className="model-card-body">
                <div className="model-card-niche-badge">{t.nicheName}</div>
                <h3 className="model-card-title">{t.title}</h3>
                <div className="model-card-specs">
                  <span>
                    {t.widthMm} × {t.heightMm} mm
                  </span>
                  <span>•</span>
                  <span className="language-tag">{t.printerLanguage}</span>
                  <span>•</span>
                  <span>v{t.version}</span>
                </div>
                <div className="model-card-date">Alterado em {formatLastModified(t.updatedAt)}</div>
              </div>

              {/* Rodapé com Ações */}
              <div className="model-card-actions">
                <button
                  type="button"
                  className="wizard-primary-btn"
                  style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}
                  onClick={() => onOpenModel(t.id)}
                >
                  Abrir
                </button>

                {/* Dropdown Menu de Contexto ⋯ */}
                <div className="model-card-menu-container">
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() =>
                      setActionMenuOpenId(actionMenuOpenId === t.id ? null : t.id)
                    }
                    title="Mais opções"
                  >
                    ⋯
                  </button>

                  {actionMenuOpenId === t.id && (
                    <div className="model-card-dropdown">
                      <button
                        type="button"
                        className="dropdown-item"
                        onClick={() => handleDuplicate(t)}
                      >
                        📋 Duplicar
                      </button>
                      <button
                        type="button"
                        className="dropdown-item"
                        onClick={() => {
                          setActionMenuOpenId(null);
                          setRenameTarget(t);
                        }}
                      >
                        ✏️ Renomear
                      </button>
                      <button
                        type="button"
                        className="dropdown-item danger"
                        onClick={() => {
                          setActionMenuOpenId(null);
                          setDeleteTarget(t);
                        }}
                      >
                        🗑️ Excluir
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modais de Ação */}
      {renameTarget && (
        <RenameModelModal
          isOpen={!!renameTarget}
          currentTitle={renameTarget.title}
          onConfirm={handleConfirmRename}
          onClose={() => setRenameTarget(null)}
          isLoading={actionLoading}
        />
      )}

      {deleteTarget && (
        <DeleteModelModal
          isOpen={!!deleteTarget}
          modelTitle={deleteTarget.title}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleteTarget(null)}
          isLoading={actionLoading}
        />
      )}
    </div>
  );
};
