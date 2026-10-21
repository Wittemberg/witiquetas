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
        return { label: 'Nova Funcionalidade', bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' };
      case 'IMPROVEMENT':
        return { label: 'Melhoria de Sistema', bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
      case 'HOTFIX':
        return { label: 'Correção de Emergência', bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
      case 'SECURITY':
        return { label: 'Segurança & Auditoria', bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
      default:
        return { label: 'Atualização', bg: 'rgba(148, 163, 184, 0.15)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.3)' };
    }
  };

  const badge = getTypeBadge(current.type);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#1e293b',
          color: '#f8fafc',
          borderRadius: '16px',
          border: '1px solid #334155',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header com Destaque Visual */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #334155',
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 1) 0%, rgba(15, 23, 42, 1) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              <Sparkles size={22} />
            </div>
            <div>
              <h2
                id="whats-new-title"
                style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                }}
              >
                O que há de novo no Witiquetas
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.85rem',
                  color: '#94a3b8',
                }}
              >
                Novidades e atualizações disponíveis na plataforma
              </p>
            </div>
          </div>

          <button
            onClick={handleConfirmAndClose}
            aria-label="Fechar"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Abas de Navegação quando houver múltiplas versões */}
        {unreadReleases.length > 1 && (
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#0f172a',
              borderBottom: '1px solid #334155',
              overflowX: 'auto',
            }}
          >
            {unreadReleases.map((rel, idx) => (
              <button
                key={rel.version}
                onClick={() => setSelectedIndex(idx)}
                style={{
                  background: selectedIndex === idx ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                  color: selectedIndex === idx ? '#ffffff' : '#94a3b8',
                  border: selectedIndex === idx ? '1px solid #60a5fa' : '1px solid transparent',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: selectedIndex === idx ? 600 : 400,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                v{rel.version} {idx === 0 && '• Recente'}
              </button>
            ))}
          </div>
        )}

        {/* Corpo com Conteúdo da Release */}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* Cabeçalho da Release */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <span
                style={{
                  backgroundColor: '#334155',
                  color: '#f8fafc',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                }}
              >
                v{current.version}
              </span>
              <span
                style={{
                  backgroundColor: badge.bg,
                  color: badge.text,
                  border: `1px solid ${badge.border}`,
                  padding: '2px 8px',
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
                    color: '#64748b',
                    fontSize: '0.8rem',
                  }}
                >
                  <Calendar size={13} />
                  {new Date(current.releaseDate).toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>

            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: '#f1f5f9' }}>
              {current.title}
            </h3>
            {current.summary && (
              <p style={{ margin: '0.5rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {current.summary}
              </p>
            )}
          </div>

          {/* Destaques (Highlights) */}
          {current.highlights && current.highlights.length > 0 && (
            <div>
              <h4
                style={{
                  margin: '0 0 0.6rem 0',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Tag size={14} /> Principais Destaques
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {current.highlights.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.6rem',
                      padding: '0.6rem 0.8rem',
                      backgroundColor: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      color: '#e2e8f0',
                      lineHeight: 1.4,
                    }}
                  >
                    <CheckCircle2 size={16} color="#34d399" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Breaking Changes (se houver) */}
          {current.breakingChanges && current.breakingChanges.length > 0 && (
            <div
              style={{
                padding: '0.8rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
              }}
            >
              <h4
                style={{
                  margin: '0 0 0.4rem 0',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#f87171',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertTriangle size={15} /> Atenção / Requisitos
              </h4>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#fca5a5', fontSize: '0.85rem' }}>
                {current.breakingChanges.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Detalhes do Changelog (se preenchido e não duplicado com destaques) */}
          {current.changelogMarkdown && (
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.5)',
                padding: '0.85rem',
                borderRadius: '8px',
                border: '1px solid #334155',
                fontSize: '0.825rem',
                color: '#cbd5e1',
                lineHeight: 1.5,
                whiteSpace: 'pre-line',
              }}
            >
              {current.changelogMarkdown}
            </div>
          )}
        </div>

        {/* Footer com Botão de Confirmação */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #334155',
            backgroundColor: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          {onNavigateToUpdates ? (
            <button
              onClick={() => {
                handleConfirmAndClose();
                onNavigateToUpdates();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#60a5fa',
                fontSize: '0.825rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 0',
                textDecoration: 'underline',
              }}
            >
              <ExternalLink size={14} /> Ver histórico na Central de Atualizações
            </button>
          ) : (
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Reconhecido por {sessionContext?.user?.name || 'você'}
            </span>
          )}

          <button
            onClick={handleConfirmAndClose}
            disabled={isSubmitting}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              padding: '8px 20px',
              borderRadius: '8px',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.3)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
          >
            {isSubmitting ? 'Confirmando...' : 'Entendi, continuar'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
