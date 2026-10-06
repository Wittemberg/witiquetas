import React, { useState } from 'react';
import {
  RefreshCw,
  Laptop,
  CheckCircle2,
  AlertCircle,
  X,
  KeyRound,
  Info,
  Clock,
  Radio,
  Layers,
} from 'lucide-react';
import type { AgentDTO } from '@witiquetas/contracts';
import { AgentStatusBadge } from './AgentStatusBadge.js';
import { formatLastSeen } from './agentStatusUtils.js';

interface ReconnectAgentModalProps {
  isOpen: boolean;
  agent: AgentDTO | null;
  onClose: () => void;
  onRefresh?: () => Promise<void> | void;
  onReinstall?: () => void;
}

export const ReconnectAgentModal: React.FC<ReconnectAgentModalProps> = ({
  isOpen,
  agent,
  onClose,
  onRefresh,
  onReinstall,
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'info';
    message: string;
  } | null>(null);

  if (!isOpen || !agent) return null;

  const isOnline = agent.status === 'ONLINE';

  const handleCheckConnection = async () => {
    setIsChecking(true);
    setFeedback(null);
    try {
      if (onRefresh) {
        await onRefresh();
      }
      // O estado do agent pode ter sido atualizado pelo pai via onRefresh
      if (agent.status === 'ONLINE') {
        setFeedback({
          type: 'success',
          message: 'Conexão restabelecida com sucesso! O Agent está Online e pronto para processar impressões.',
        });
      } else {
        setFeedback({
          type: 'warning',
          message: 'O Agent ainda não respondeu ao sinal de verificação. Certifique-se de que o computador está ligado e conectado à rede.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'warning',
        message: err.message || 'Não foi possível verificar o status no momento.',
      });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div
      className="wizard-modal-overlay"
      onClick={onClose}
      data-testid="reconnect-agent-modal-overlay"
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
        data-testid="reconnect-agent-modal"
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
                background: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RefreshCw size={18} />
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
                Reconectar Agent de Impressão
              </h3>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  margin: '0.15rem 0 0 0',
                }}
              >
                Recuperação de comunicação com terminal existente
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

        {/* Card Resumo do Agent */}
        <div
          style={{
            padding: '1rem 1.15rem',
            background: 'var(--bg-card-hover, rgba(255, 255, 255, 0.03))',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Laptop size={18} color="var(--accent-blue)" />
              <span
                data-testid="reconnect-agent-machine-name"
                style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}
              >
                {agent.machineName}
              </span>
            </div>
            <AgentStatusBadge status={agent.status} size="sm" />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.6rem',
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
            }}
          >
            <div>
              <span style={{ display: 'block', fontWeight: 600 }}>Última conexão:</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <Clock size={12} />
                {formatLastSeen(agent.lastSeenAt)}
              </span>
            </div>
            <div>
              <span style={{ display: 'block', fontWeight: 600 }}>Sistema Operacional:</span>
              <span>{agent.os} ({agent.architecture})</span>
            </div>
            <div>
              <span style={{ display: 'block', fontWeight: 600 }}>Versão Instalada:</span>
              <span>v{agent.agentVersion}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontWeight: 600 }}>Identidade / Instalação:</span>
              <span style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
                {agent.installationId ? `${agent.installationId.substring(0, 14)}...` : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Feedback de Verificação */}
        {feedback && (
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              fontSize: '0.82rem',
              background:
                feedback.type === 'success'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${
                feedback.type === 'success' ? 'var(--status-success)' : 'var(--status-warning)'
              }`,
              color:
                feedback.type === 'success' ? 'var(--status-success)' : 'var(--status-warning)',
            }}
          >
            {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Orientações sem terminal */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            fontSize: '0.82rem',
            lineHeight: 1.5,
            color: 'var(--text-muted)',
          }}
        >
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              color: 'var(--text-primary)',
            }}
          >
            <strong>Identidade persistente:</strong> Este Agent já está pareado com credencial única. Estar Offline significa apenas que o serviço local não está respondendo no momento — não é necessário baixar o programa novamente nem criar outro código para restabelecer a conexão normal.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Como restabelecer a conexão:
            </span>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <li>Verifique se o computador <strong>{agent.machineName}</strong> está ligado e conectado à rede.</li>
              <li>O serviço de segundo plano do Witiquetas Agent carrega a identidade salva automaticamente ao iniciar o Windows.</li>
              <li>Assim que a comunicação for restabelecida, o status passará para <strong>Online</strong> automaticamente no próximo ciclo de sincronização.</li>
            </ul>
          </div>

          <div
            style={{
              fontSize: '0.75rem',
              padding: '0.65rem 0.85rem',
              background: 'var(--bg-card, rgba(0, 0, 0, 0.2))',
              borderRadius: '6px',
              border: '1px dashed var(--border-color)',
              color: 'var(--text-muted)',
            }}
          >
            <span style={{ fontWeight: 600 }}>Evolução do produto:</span> Reconexão automática com controle facilitado pelo Menu Iniciar e bandeja do sistema estará disponível na próxima atualização do Witiquetas Agent.
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Se este computador foi formatado ou o Agent foi desinstalado, use <em>Reinstalar / Novo Pareamento</em> para emitir uma nova autorização.
          </div>
        </div>

        {/* Rodapé / Ações */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '1rem',
          }}
        >
          {onReinstall && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onReinstall}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <KeyRound size={15} />
              <span>Reinstalar / Novo Pareamento</span>
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCheckConnection}
              disabled={isChecking}
              style={{ fontSize: '0.8rem', padding: '0.45rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <RefreshCw size={15} className={isChecking ? 'spin' : ''} />
              <span>{isChecking ? 'Verificando...' : 'Verificar Conexão Agora'}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
