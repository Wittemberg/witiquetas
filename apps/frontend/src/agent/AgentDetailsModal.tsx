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

  return (
    <div
      className="wizard-modal-overlay"
      onClick={onClose}
      data-testid="agent-details-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        data-testid="agent-details-modal"
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          padding: '1.5rem',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          background: 'var(--card-bg, #182234)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isOnline ? 'var(--status-success)' : 'var(--status-danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Laptop size={18} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--text-primary)',
                }}
              >
                Detalhes do Agent de Impressão
              </h3>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  margin: '0.15rem 0 0 0',
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
            style={{ padding: '0.3rem 0.55rem', fontSize: '0.8rem' }}
            title="Fechar modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Identificação Principal */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.85rem 1rem',
            background: 'var(--bg-card-hover, rgba(255, 255, 255, 0.03))',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>
              Nome da Máquina
            </div>
            <div
              data-testid="agent-details-machine-name"
              style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}
            >
              {agent.machineName}
            </div>
          </div>
          <AgentStatusBadge status={agent.status} />
        </div>

        {/* Grid de Propriedades */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
            fontSize: '0.8rem',
          }}
        >
          <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0, 0, 0, 0.15)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>Último Heartbeat:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {formatLastSeen(agent.lastSeenAt)}
            </span>
          </div>

          <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0, 0, 0, 0.15)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>Sistema Operacional:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {agent.os} ({agent.architecture})
            </span>
          </div>

          <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0, 0, 0, 0.15)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>Versão do Agent:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              v{agent.agentVersion}
            </span>
          </div>

          <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0, 0, 0, 0.15)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>Protocolo:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Agent Protocol v1
            </span>
          </div>

          <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0, 0, 0, 0.15)', borderRadius: '6px', border: '1px solid var(--border-color)', gridColumn: '1 / -1' }}>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>ID de Instalação:</span>
            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
              {agent.installationId || 'N/A'}
            </span>
          </div>

          <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(0, 0, 0, 0.15)', borderRadius: '6px', border: '1px solid var(--border-color)', gridColumn: '1 / -1' }}>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>Cadastrado em:</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              {agent.createdAt ? new Date(agent.createdAt).toLocaleString('pt-BR') : 'Data não registrada'}
            </span>
          </div>
        </div>

        {/* Diagnóstico / Ação Recomendada */}
        {!isOnline ? (
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.82rem',
              color: 'var(--text-primary)',
            }}
          >
            <div>
              <strong>Diagnóstico:</strong> O Agent não enviou sinal nos últimos 2 minutos. O computador pode estar desligado ou o serviço precisa ser iniciado.
            </div>
            {onReconnect && (
              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onReconnect}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <RefreshCw size={14} />
                  <span>Abrir Reconectar</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              fontSize: '0.82rem',
              color: 'var(--status-success)',
            }}
          >
            <CheckCircle2 size={18} />
            <span>Este Agent está online, comunicando perfeitamente e apto a despachar trabalhos para impressoras conectadas.</span>
          </div>
        )}

        {/* Rodapé */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
