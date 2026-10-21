import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Tag,
  Calendar,
  Layers,
  ArrowRight,
  ExternalLink,
  X,
} from 'lucide-react';
import { updatesApi } from '../../services/updatesApi.js';
import type { WhatsNewItemDTO, ReleaseType } from '@witiquetas/contracts';
import type { SessionContext } from '../../auth/session.js';

interface WhatsNewModalProps {
  sessionContext: SessionContext | null;
  onNavigateToUpdates?: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  sessionContext,
  onNavigateToUpdates,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadReleases, setUnreadReleases] = useState<WhatsNewItemDTO[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Apenas consulta quando o usuário estiver com sessão ativa
    if (!sessionContext?.user?.id) {
      setIsOpen(false);
      return;
    }

    let isMounted = true;

    const checkWhatsNew = async () => {
      try {
        const res = await updatesApi.getWhatsNew();
        if (!isMounted) return;

        if (res && res.hasUnread && Array.isArray(res.unreadReleases) && res.unreadReleases.length > 0) {
          setUnreadReleases(res.unreadReleases);
          setSelectedIndex(0);
          setIsOpen(true);
        } else {
          setIsOpen(false);
        }
      } catch (err) {
        // Falha transitória tratada de forma silenciosa (fail-open) para não bloquear a experiência do usuário
        console.warn('[WhatsNewModal] Não foi possível carregar novidades da versão:', err);
        if (isMounted) {
          setIsOpen(false);
        }
      }
    };

    checkWhatsNew();

    return () => {
      isMounted = false;
    };
  }, [sessionContext?.user?.id, sessionContext?.company?.id]);

  const handleConfirmAndClose = async () => {
    if (unreadReleases.length === 0) {
      setIsOpen(false);
      return;
    }

    try {
      setIsSubmitting(true);
      const allVersions = unreadReleases.map((r) => r.version);
      await updatesApi.markReleasesAsRead(allVersions);
    } catch (err) {
      console.warn('[WhatsNewModal] Falha ao registrar confirmação no backend:', err);
    } finally {
      setIsSubmitting(false);
      setIsOpen(false);
    }
  };

  if (!isOpen || unreadReleases.length === 0) {
    return null;
  }

  const current = unreadReleases[selectedIndex] || unreadReleases[0];

  const getTypeBadge = (type: ReleaseType) => {
    switch (type) {
      case 'FEATURE':
        return { label: 'Nova Funcionalidade', bg: 'rgba(59, 130, 246, 0.12)', text: 'var(--accent-blue)', border: 'rgba(59, 130, 246, 0.3)' };
      case 'IMPROVEMENT':
        return { label: 'Melhoria de Sistema', bg: 'rgba(16, 185, 129, 0.12)', text: 'var(--status-success)', border: 'rgba(16, 185, 129, 0.3)' };
      case 'HOTFIX':
        return { label: 'Correção de Emergência', bg: 'rgba(239, 68, 68, 0.12)', text: 'var(--status-danger)', border: 'rgba(239, 68, 68, 0.3)' };
      case 'SECURITY':
        return { label: 'Segurança & Auditoria', bg: 'rgba(168, 85, 247, 0.12)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' };
      default:
        return { label: 'Atualização', bg: 'rgba(148, 163, 184, 0.12)', text: 'var(--text-secondary)', border: 'var(--border-color)' };
    }
  };

  const badge = getTypeBadge(current.type);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      className="whats-new-backdrop"
    >
      <div className="whats-new-modal-container">
        {/* Header Estável */}
        <div className="whats-new-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                color: 'var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                flexShrink: 0,
              }}
            >
              <Sparkles size={22} />
            </div>
            <div>
              <h2 id="whats-new-title" className="whats-new-header-title">
                O que há de novo no Witiquetas
              </h2>
              <p className="whats-new-header-subtitle">
                Novidades e atualizações disponíveis na plataforma
              </p>
            </div>
          </div>

          <button
            onClick={handleConfirmAndClose}
            aria-label="Fechar"
            className="btn"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              padding: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Abas de Navegação quando houver múltiplas versões */}
        {unreadReleases.length > 1 && (
          <div className="whats-new-nav-tabs">
            {unreadReleases.map((rel, idx) => (
              <button
                key={rel.version}
                onClick={() => setSelectedIndex(idx)}
                className={`whats-new-tab-btn ${selectedIndex === idx ? 'active' : ''}`}
              >
                v{rel.version} {idx === 0 && '• Recente'}
              </button>
            ))}
          </div>
        )}

        {/* Corpo com Layout Desktop em Landscape (2 Colunas Fluidas) */}
        <div className="whats-new-body">
          <div className="whats-new-grid-landscape">
            {/* Coluna Esquerda: Contexto, Versão, Título e Resumo */}
            <div className="whats-new-main-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span className="whats-new-version-badge">
                  v{current.version}
                </span>
                <span
                  style={{
                    backgroundColor: badge.bg,
                    color: badge.text,
                    border: `1px solid ${badge.border}`,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  {badge.label}
                </span>
                {current.releaseDate && (
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: 'var(--text-muted)',
                      fontSize: '0.8rem',
                    }}
                  >
                    <Calendar size={13} />
                    {new Date(current.releaseDate).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </div>

              <h3 className="whats-new-release-title">
                {current.title}
              </h3>

              {current.summary && (
                <p className="whats-new-release-summary">
                  {current.summary}
                </p>
              )}

              {/* Breaking Changes (se houver, alocado com destaque de aviso) */}
              {current.breakingChanges && current.breakingChanges.length > 0 && (
                <div className="whats-new-breaking-card">
                  <h4
                    style={{
                      margin: '0 0 0.4rem 0',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'var(--status-danger)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <AlertTriangle size={15} /> Atenção / Requisitos
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-primary)', fontSize: '0.825rem' }}>
                    {current.breakingChanges.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Coluna Direita: Destaques Visuais e Notas Adicionais */}
            <div className="whats-new-side-panel">
              {current.highlights && current.highlights.length > 0 && (
                <div>
                  <h4
                    style={{
                      margin: '0 0 0.6rem 0',
                      fontSize: '0.825rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--accent-blue)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Tag size={14} /> Principais Destaques
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {current.highlights.map((h, i) => (
                      <div key={i} className="whats-new-highlight-card">
                        <CheckCircle2 size={16} color="var(--status-success)" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detalhes complementares do Changelog (se preenchido) */}
              {current.changelogMarkdown && (
                <div>
                  <h4
                    style={{
                      margin: '0 0 0.4rem 0',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                    }}
                  >
                    Notas Complementares
                  </h4>
                  <div
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-line',
                      maxHeight: '160px',
                      overflowY: 'auto',
                    }}
                  >
                    {current.changelogMarkdown}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer com Hierarquia e Acessibilidade Padronizadas */}
        <div className="whats-new-footer">
          {onNavigateToUpdates ? (
            <button
              onClick={() => {
                handleConfirmAndClose();
                onNavigateToUpdates();
              }}
              className="whats-new-link-btn"
            >
              <ExternalLink size={14} /> Ver histórico na Central de Atualizações
            </button>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Reconhecido por {sessionContext?.user?.name || 'você'}
            </span>
          )}

          <button
            onClick={handleConfirmAndClose}
            disabled={isSubmitting}
            className="btn btn-primary"
            style={{
              padding: '0.55rem 1.35rem',
              fontSize: '0.875rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isSubmitting ? 'Confirmando...' : 'Entendi, continuar'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
