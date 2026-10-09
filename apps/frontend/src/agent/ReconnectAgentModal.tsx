import React, { useState } from 'react';
import {
  RefreshCw,
  Laptop,
  CheckCircle2,
  AlertCircle,
  X,
  KeyRound,
  Clock,
  Radio,
  Layers,
  ShieldAlert,
  Info,
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

export type VerificationState = 'IDLE' | 'CHECKING' | 'OFFLINE_RESULT' | 'ONLINE_RESULT' | 'ERROR_RESULT';

export const ReconnectAgentModal: React.FC<ReconnectAgentModalProps> = ({
  isOpen,
  agent,
  onClose,
  onRefresh,
  onReinstall,
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [verificationState, setVerificationState] = useState<VerificationState>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string>('');

  if (!isOpen || !agent) return null;

  const isOnline = agent.status === 'ONLINE';
  const isRevoked = agent.status === 'REVOKED' || agent.status === 'UNAUTHORIZED';

  // Diagnóstico determinístico e honesto atualizado in-place (Track A & Track C)
  const getDiagnosticInfo = () => {
    if (verificationState === 'CHECKING') {
      return {
        category: 'CHECKING',
        badge: 'Consultando Nuvem...',
        badgeClass: 'badge-info',
        borderColor: 'var(--accent-blue)',
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        icon: <RefreshCw size={15} className="spin" color="var(--accent-blue)" style={{ flexShrink: 0 }} />,
        title: 'Verificando heartbeats',
        detail: `Consultando servidores da nuvem em busca de transmissões recentes de ${agent.machineName}...`,
      };
    }

    if (verificationState === 'ONLINE_RESULT' || isOnline) {
      return {
        category: 'ONLINE',
        badge: verificationState === 'ONLINE_RESULT' ? 'Conexão Restabelecida' : 'Operacional',
        badgeClass: 'badge-success',
        borderColor: 'var(--status-success)',
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        icon: <CheckCircle2 size={15} color="var(--status-success)" style={{ flexShrink: 0 }} />,
        title: 'Serviço ativo e comunicando',
        detail: 'O Agent está conectado à nuvem e transmitindo heartbeats normalmente. Pronto para processar impressões.',
      };
    }

    if (verificationState === 'OFFLINE_RESULT') {
      return {
        category: 'OFFLINE_RESULT',
        badge: 'Verificado: Sem Resposta',
        badgeClass: 'badge-warning',
        borderColor: 'var(--status-warning)',
        backgroundColor: 'rgba(245, 158, 11, 0.08)',
        icon: <AlertCircle size={15} color="var(--status-warning)" style={{ flexShrink: 0 }} />,
        title: 'Nenhum sinal recente na nuvem',
        detail: `Nenhum sinal recente recebido do computador ${agent.machineName} (último contato: ${formatLastSeen(agent.lastSeenAt)}). O equipamento permanece offline nos servidores.`,
      };
    }

    if (verificationState === 'ERROR_RESULT') {
      return {
        category: 'ERROR_RESULT',
        badge: 'Falha na Consulta',
        badgeClass: 'badge-danger',
        borderColor: 'var(--status-danger)',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        icon: <AlertCircle size={15} color="var(--status-danger)" style={{ flexShrink: 0 }} />,
        title: 'Erro ao consultar servidores',
        detail: errorMessage || 'Falha ao consultar status com o servidor. Verifique sua conexão com a internet.',
      };
    }

    if (isRevoked) {
      return {
        category: 'AUTH_ERROR',
        badge: 'Credencial Revogada',
        badgeClass: 'badge-secondary',
        borderColor: 'var(--status-danger)',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        icon: <ShieldAlert size={15} color="var(--status-danger)" style={{ flexShrink: 0 }} />,
        title: 'Acesso desautorizado',
        detail: 'A credencial deste agente foi revogada na administração. É necessário realizar um novo pareamento para autorizá-lo novamente.',
      };
    }

    return {
      category: 'OFFLINE',
      badge: 'Sem Heartbeat Recente',
      badgeClass: 'badge-danger',
      borderColor: 'var(--status-warning)',
      backgroundColor: 'rgba(245, 158, 11, 0.08)',
      icon: <Radio size={15} color="var(--status-warning)" style={{ flexShrink: 0 }} />,
      title: 'Serviço local sem resposta na nuvem',
      detail: `Nenhum sinal recebido nos últimos 2 minutos (última comunicação registrada: ${formatLastSeen(agent.lastSeenAt)}).`,
    };
  };

  const diagnostic = getDiagnosticInfo();

  const handleCheckConnection = async () => {
    setIsChecking(true);
    setVerificationState('CHECKING');
    setErrorMessage('');
    try {
      if (onRefresh) {
        await onRefresh();
      }
      if (agent.status === 'ONLINE') {
        setVerificationState('ONLINE_RESULT');
      } else {
        setVerificationState('OFFLINE_RESULT');
      }
    } catch (err: any) {
      setVerificationState('ERROR_RESULT');
      setErrorMessage(err.message || 'Falha ao consultar status com o servidor.');
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
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '1rem',
      }}
    >
      <style>{`
        .reconnect-modal-grid {
          display: grid;
          grid-template-columns: minmax(280px, 340px) 1fr;
          gap: 1.25rem;
          align-items: start;
        }
        @media (max-width: 800px) {
          .reconnect-modal-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
        }
      `}</style>
      <div
        className="wizard-modal-content"
        onClick={(e) => e.stopPropagation()}
        data-testid="reconnect-agent-modal"
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
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <RefreshCw size={20} />
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
                Reconectar Agent de Impressão
              </h3>
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  margin: '0.2rem 0 0 0',
                }}
              >
                Diagnóstico e recuperação de comunicação com terminal cadastrado
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
          className="reconnect-modal-grid"
          style={{
            padding: '1.25rem 1.5rem',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {/* COLUNA ESQUERDA: Identidade & Metadados do Agente */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            {/* Card de Identificação */}
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-card-hover, rgba(0, 0, 0, 0.03))',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <Laptop size={18} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                  <span
                    data-testid="reconnect-agent-machine-name"
                    style={{
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={agent.machineName}
                  >
                    {agent.machineName}
                  </span>
                </div>
                <AgentStatusBadge status={agent.status} size="sm" />
              </div>

              {/* Lista de Metadados */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  fontSize: '0.78rem',
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '0.65rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Última conexão:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Clock size={12} color="var(--text-muted)" />
                    {formatLastSeen(agent.lastSeenAt)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Sistema:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {agent.os} ({agent.architecture})
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Versão:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    v{agent.agentVersion}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Identidade:</span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '0.72rem',
                    }}
                  >
                    {agent.installationId ? `${agent.installationId.substring(0, 14)}...` : 'Salva'}
                  </span>
                </div>
              </div>
            </div>

            {/* Caixa Informativa sobre Identidade Persistente */}
            <div
              style={{
                padding: '0.85rem',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '8px',
                fontSize: '0.76rem',
                lineHeight: 1.45,
                color: 'var(--text-primary)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                <Info size={14} />
                <span>Identidade Persistente</span>
              </div>
              Este terminal já possui credencial salva. Estar Offline significa apenas que a nuvem não recebeu dados recentes — não é necessário reinstalar para restabelecer a comunicação regular.
            </div>
          </div>

          {/* COLUNA DIREITA: Diagnóstico, Orientações & Verificação */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            {/* Painel de Diagnóstico & Resultado da Verificação (In-Place) */}
            <div
              data-testid="reconnect-diagnostic-panel"
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                border: `1px solid ${diagnostic.borderColor}`,
                backgroundColor: diagnostic.backgroundColor,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                minHeight: '82px',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  {diagnostic.icon}
                  <span>Diagnóstico Técnico:</span>
                </span>
                <span
                  className={`badge ${diagnostic.badgeClass}`}
                  style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }}
                >
                  {diagnostic.badge}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                <strong>{diagnostic.title}:</strong> {diagnostic.detail}
              </div>
            </div>

            {/* Orientações Práticas para o Usuário (Sem Terminal) */}
            <div
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: 'var(--bg-card-hover, rgba(0, 0, 0, 0.02))',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.45,
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                Como reativar a comunicação:
              </span>
              <ul style={{ margin: 0, paddingLeft: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <li>Certifique-se de que o computador <strong>{agent.machineName}</strong> está ligado e com acesso à rede.</li>
                <li>O serviço de segundo plano (<em>WitiquetasAgent</em>) carrega a identidade e inicia junto com o Windows.</li>
                <li>Se o serviço foi interrompido, reiniciar o computador normalmente restaura a execução do agente.</li>
              </ul>
            </div>

            {/* Banner de Transparência (Track D - UX Honesta) */}
            <div
              style={{
                padding: '0.75rem 0.9rem',
                backgroundColor: 'var(--bg-input, var(--bg-card-hover))',
                borderRadius: '8px',
                border: '1px dashed var(--border-color)',
                fontSize: '0.74rem',
                color: 'var(--text-muted)',
                lineHeight: 1.4,
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>
                Transparência da Verificação:
              </div>
              A ação <em>Verificar Conexão Agora</em> consulta os servidores da nuvem para checar se novos heartbeats foram recebidos; ela não emite comandos remotos para ligar o computador ou iniciar serviços locais.
              Controle facilitado de 1 clique pela bandeja do sistema (Tray Companion) será introduzido nos próximos pacotes da Fase 5.
            </div>
          </div>
        </div>

        {/* Rodapé / Ações */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            backgroundColor: 'var(--header-bg, var(--modal-bg))',
            flexShrink: 0,
          }}
        >
          {onReinstall ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onReinstall}
              style={{
                fontSize: '0.8rem',
                padding: '0.45rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
              title="Gerar novo código de pareamento caso o computador tenha sido formatado"
            >
              <KeyRound size={15} />
              <span>Reinstalar / Novo Pareamento</span>
            </button>
          ) : <div />}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCheckConnection}
              disabled={isChecking}
              style={{
                fontSize: '0.8rem',
                padding: '0.45rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
              }}
            >
              <RefreshCw size={15} className={isChecking ? 'spin' : ''} />
              <span>
                {isChecking
                  ? 'Consultando Servidor...'
                  : verificationState === 'ONLINE_RESULT'
                  ? 'Conexão Restabelecida'
                  : verificationState === 'OFFLINE_RESULT'
                  ? 'Verificar Novamente'
                  : 'Verificar Conexão Agora'}
              </span>
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
