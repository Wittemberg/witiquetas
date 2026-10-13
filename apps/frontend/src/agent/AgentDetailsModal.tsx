import React from 'react';
import {
  Laptop,
  CheckCircle2,
  X,
  Clock,
  Cpu,
  Layers,
  Radio,
  RefreshCw,
  Info,
  Calendar,
  KeyRound,
  ShieldAlert,
  Server,
  Activity,
} from 'lucide-react';
import type { AgentDTO } from '@witiquetas/contracts';
import { AgentStatusBadge } from './AgentStatusBadge.js';
import { formatLastSeen } from './agentStatusUtils.js';

interface AgentDetailsModalProps {
  isOpen: boolean;
  agent: AgentDTO | null;
  onClose: () => void;
  onReconnect?: () => void;
}

export const AgentDetailsModal: React.FC<AgentDetailsModalProps> = ({
  isOpen,
  agent,
  onClose,
  onReconnect,
}) => {
  if (!isOpen || !agent) return null;

  const isOnline = agent.status === 'ONLINE';
  const isRevoked = agent.status === 'REVOKED' || agent.status === 'UNAUTHORIZED';

  return (
    <div
      className="wizard-modal-overlay"
      onClick={onClose}
      data-testid="agent-details-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
    >
      <style>{`
        .agent-details-modal-grid {
          display: grid;
          grid-template-columns: minmax(280px, 340px) 1fr;
          gap: 1.25rem;
          align-items: start;
        }
        @media (max-width: 800px) {
          .agent-details-modal-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
        }
      `}</style>

      <div
        className="wizard-modal-content"
        onClick={(e) => e.stopPropagation()}
        data-testid="agent-details-modal"
        style={{
          width: 'min(95vw, 980px)',
          maxWidth: '980px',
          maxHeight: '92vh',
          backgroundColor: 'var(--modal-bg, var(--bg-card))',
          color: 'var(--text-primary)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-elevated)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.15rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--header-bg, var(--modal-bg))',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isOnline ? 'var(--status-success)' : 'var(--status-danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Laptop size={20} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--text-primary)',
                  lineHeight: 1.2,
                }}
              >
                Detalhes do Agent de Impressão
              </h3>
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  margin: '0.2rem 0 0 0',
                }}
              >
                Informações de diagnóstico e telemetria local
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
            title="Fechar modal"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Landscape (2 Colunas no Desktop) */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div className="agent-details-modal-grid">
            {/* =========================================================================
               COLUNA ESQUERDA: IDENTIDADE DO COMPUTADOR & AMBIENTE DO SISTEMA
               ========================================================================= */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Card Identidade Principal */}
              <div
                style={{
                  padding: '1.1rem',
                  backgroundColor: 'var(--bg-card-hover, rgba(0, 0, 0, 0.04))',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Identificação Local
                  </span>
                  <AgentStatusBadge status={agent.status} />
                </div>

                <div>
                  <div
                    data-testid="agent-details-machine-name"
                    style={{
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                      wordBreak: 'break-word',
                      lineHeight: 1.2,
                    }}
                  >
                    {agent.machineName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Nome registrado do terminal
                  </div>
                </div>
              </div>

              {/* Especificações de Plataforma / Hardware */}
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: 'var(--bg-card-hover, rgba(0, 0, 0, 0.04))',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Ambiente Operacional
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Server size={14} /> Sistema Operacional:
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {agent.os} ({agent.architecture})
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Cpu size={14} /> Versão do Agent:
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    v{agent.agentVersion}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Layers size={14} /> Protocolo:
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    Agent Protocol v1
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Calendar size={14} /> Cadastrado em:
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    {agent.createdAt ? new Date(agent.createdAt).toLocaleDateString('pt-BR') : 'N/A'}
                  </span>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.6rem', marginTop: '0.2rem' }}>
                  <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    ID de Instalação:
                  </span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                      wordBreak: 'break-all',
                      display: 'block',
                      backgroundColor: 'rgba(0, 0, 0, 0.06)',
                      padding: '0.3rem 0.5rem',
                      borderRadius: '4px',
                    }}
                  >
                    {agent.installationId || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* =========================================================================
               COLUNA DIREITA: TELEMETRIA, DIAGNÓSTICO EM TEMPO REAL E AÇÕES
               ========================================================================= */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Card de Telemetria e Conectividade */}
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: 'var(--bg-card-hover, rgba(0, 0, 0, 0.04))',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Telemetria e Conectividade
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.75rem 0.9rem',
                    backgroundColor: 'var(--modal-bg, var(--bg-card))',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <Clock size={16} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                  <div>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Último Heartbeat Recebido
                    </span>
                    <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {formatLastSeen(agent.lastSeenAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Painel Operacional / Diagnóstico Visual Estável */}
              <div
                data-testid="agent-details-diagnostic-panel"
                style={{
                  padding: '1rem 1.15rem',
                  borderRadius: '12px',
                  backgroundColor: isOnline
                    ? 'rgba(16, 185, 129, 0.08)'
                    : isRevoked
                    ? 'rgba(239, 68, 68, 0.08)'
                    : 'rgba(245, 158, 11, 0.08)',
                  border: `1px solid ${
                    isOnline
                      ? 'var(--status-success)'
                      : isRevoked
                      ? 'var(--status-danger)'
                      : 'var(--status-warning)'
                  }`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                  minHeight: '120px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {isOnline ? (
                    <CheckCircle2 size={18} color="var(--status-success)" style={{ flexShrink: 0 }} />
                  ) : isRevoked ? (
                    <ShieldAlert size={18} color="var(--status-danger)" style={{ flexShrink: 0 }} />
                  ) : (
                    <Radio size={18} color="var(--status-warning)" style={{ flexShrink: 0 }} />
                  )}
                  <span
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      color: isOnline
                        ? 'var(--status-success)'
                        : isRevoked
                        ? 'var(--status-danger)'
                        : 'var(--status-warning)',
                    }}
                  >
                    {isOnline
                      ? 'Agent Operacional e Pronto'
                      : isRevoked
                      ? 'Credencial do Agente Revogada'
                      : 'Agente Sem Comunicação Recente'}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: '0.82rem',
                    lineHeight: 1.5,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  {isOnline
                    ? 'O serviço está conectado à nuvem e transmitindo sinal perfeitamente. O terminal está apto a receber e despachar trabalhos para impressoras térmicas conectadas.'
                    : isRevoked
                    ? 'A credencial de acesso deste agente foi revogada pela administração do sistema. O serviço local rejeitará trabalhos até que um novo pareamento seja homologado.'
                    : `Nenhum sinal recebido do computador ${agent.machineName} nos últimos 2 minutos. O computador pode estar desligado, sem acesso à internet ou o serviço local WitiquetasAgent precisa ser iniciado.`}
                </p>

                {!isOnline && onReconnect && (
                  <div style={{ marginTop: '0.35rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={onReconnect}
                      style={{
                        fontSize: '0.8rem',
                        padding: '0.45rem 0.95rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        borderRadius: '8px',
                      }}
                    >
                      <RefreshCw size={14} />
                      <span>Abrir Diagnóstico de Reconexão</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Informações Complementares Transparentes */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: 'var(--bg-card-hover, rgba(0, 0, 0, 0.04))',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                }}
              >
                <Info size={16} color="var(--accent-blue)" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <span>
                  As informações desta tela refletem os metadados registrados no servidor central durante os heartbeats periódicos de 5 segundos do serviço local.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé do Modal */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            backgroundColor: 'var(--header-bg, var(--modal-bg))',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ fontSize: '0.82rem', padding: '0.45rem 1.15rem' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

