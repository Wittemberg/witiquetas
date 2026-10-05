import React, { useState, useEffect } from 'react';
import {
  Cpu,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Key,
  Download,
  Copy,
  Check,
  Clock,
  Laptop,
  Radio,
  ShieldAlert,
} from 'lucide-react';
import { agentsApi, type PairingCodeResponse } from '../../services/agentsApi.js';
import type { AgentDTO } from '@witiquetas/contracts';

export function formatPairingExpiration(expiresAt?: string, expiresInSeconds?: number): {
  primary: string;
  secondary: string | null;
  fullText: string;
} {
  const minutes = expiresInSeconds && expiresInSeconds > 0
    ? Math.round(expiresInSeconds / 60)
    : 15;
  const primary = `Este código expira em ${minutes} minutos.`;

  if (!expiresAt) {
    return { primary, secondary: null, fullText: primary };
  }

  try {
    const date = new Date(expiresAt);
    if (isNaN(date.getTime())) {
      return { primary, secondary: null, fullText: primary };
    }
    const timeStr = date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (!timeStr || timeStr.toLowerCase().includes('invalid')) {
      return { primary, secondary: null, fullText: primary };
    }
    const secondary = `Expira às ${timeStr}`;
    return {
      primary,
      secondary,
      fullText: `${primary} (${secondary})`,
    };
  } catch {
    return { primary, secondary: null, fullText: primary };
  }
}

interface AgentsAdminViewProps {
  canManage?: boolean;
}

export const AgentsAdminView: React.FC<AgentsAdminViewProps> = ({ canManage = true }) => {
  const [agents, setAgents] = useState<AgentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Pairing Modal State
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
  const [pairingData, setPairingData] = useState<PairingCodeResponse | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadAgents = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await agentsApi.listAgents();
      setAgents(list);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar agentes locais.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const handleOpenPairingModal = async () => {
    try {
      setGeneratingCode(true);
      setError(null);
      const data = await agentsApi.generatePairingCode();
      setPairingData(data);
      setIsPairingModalOpen(true);
      setCopiedCode(false);
      setCopiedCommand(false);
    } catch (err: any) {
      setError(err.message || 'Falha ao gerar código de pareamento.');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleCopyCode = () => {
    const code = pairingData?.pairingCode || pairingData?.formattedCode;
    if (code) {
      navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleCopyCommand = () => {
    const code = pairingData?.pairingCode || pairingData?.formattedCode || '';
    const cmd = pairingData?.command || `witiquetas-agent-windows-x64.exe pair --code ${code}`;
    if (cmd) {
      navigator.clipboard.writeText(cmd);
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 2500);
    }
  };

  const handleRevoke = async (agent: AgentDTO) => {
    if (!canManage) return;
    if (
      !window.confirm(
        `Tem certeza de que deseja revogar o agente da máquina "${agent.machineName}"?\nO daemon local perderá imediatamente o acesso e não receberá mais trabalhos de impressão.`
      )
    ) {
      return;
    }

    try {
      setRevokingId(agent.id);
      setError(null);
      await agentsApi.revokeAgent(agent.id);
      setSuccessMsg(`Agente "${agent.machineName}" revogado com sucesso.`);
      await loadAgents();
    } catch (err: any) {
      setError(err.message || 'Falha ao revogar agente.');
    } finally {
      setRevokingId(null);
    }
  };

  const formatLastSeen = (isoStr?: string) => {
    if (!isoStr) return 'Nunca';
    try {
      const date = new Date(isoStr);
      const diffMs = Date.now() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return `${diffSec}s atrás`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} min atrás`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours}h atrás`;
      return date.toLocaleDateString('pt-BR');
    } catch {
      return isoStr;
    }
  };

  const onlineCount = agents.filter((a) => a.status === 'ONLINE').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Alertas */}
      {error && (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1.25rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--status-danger)', color: 'var(--status-danger)' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1.25rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid var(--status-success)', color: 'var(--status-success)' }}>
          <CheckCircle2 size={20} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Top Banner de Governança de Agentes */}
      <div className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Cpu size={22} color="var(--accent-purple, #a855f7)" />
            Agentes Locais de Impressão (Witiquetas Agent Core)
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {agents.length} agente(s) pareado(s) • {onlineCount} online recebendo impressões locais
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <a
            href="/api/agents/download/windows-x64"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            title="Baixar executável do agente para Windows"
          >
            <Download size={16} />
            Baixar Agent (x64)
          </a>

          {canManage && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOpenPairingModal}
              disabled={generatingCode}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Key size={16} />
              {generatingCode ? 'Gerando...' : 'Gerar Código de Pareamento'}
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadAgents}
            disabled={loading}
            title="Atualizar lista de agentes"
            style={{ padding: '0.45rem 0.65rem' }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Lista de Agentes em Cards Grid Landscape */}
      <div className="card" style={{ padding: '1.25rem' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={28} className="spin" style={{ margin: '0 auto 0.75rem auto' }} />
            Carregando agentes conectados...
          </div>
        ) : agents.length === 0 ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Laptop size={44} style={{ margin: '0 auto 0.75rem auto', opacity: 0.35 }} />
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              Nenhum agente de impressão pareado
            </div>
            <div style={{ fontSize: '0.82rem', maxWidth: '480px', margin: '0 auto 1.25rem auto' }}>
              O Witiquetas Agent Core conecta seus computadores locais para enviar comandos diretamente a impressoras USB, Spooler ou Seriais que não estão expostas na nuvem.
            </div>
            {canManage && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOpenPairingModal}
                style={{ fontSize: '0.85rem' }}
              >
                <Key size={16} />
                Conectar Primeiro Agente
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem' }}>
            {agents.map((agent) => {
              const isOnline = agent.status === 'ONLINE';
              return (
                <div
                  key={agent.id}
                  style={{
                    padding: '1.15rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--card-bg, rgba(255, 255, 255, 0.02))',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Laptop size={18} color="var(--accent-blue)" />
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        {agent.machineName}
                      </span>
                    </div>

                    <span className={`badge ${isOnline ? 'badge-success' : 'badge-secondary'}`}>
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <div>
                      <span style={{ display: 'block', fontWeight: 600 }}>Sistema Operacional:</span>
                      <span>{agent.os} ({agent.architecture})</span>
                    </div>
                    <div>
                      <span style={{ display: 'block', fontWeight: 600 }}>Versão do Agent:</span>
                      <span>v{agent.agentVersion}</span>
                    </div>
                    <div>
                      <span style={{ display: 'block', fontWeight: 600 }}>Último Heartbeat:</span>
                      <span>{formatLastSeen(agent.lastSeenAt)}</span>
                    </div>
                    <div>
                      <span style={{ display: 'block', fontWeight: 600 }}>ID de Instalação:</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                        {agent.installationId ? `${agent.installationId.substring(0, 14)}...` : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {canManage && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '0.65rem', marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleRevoke(agent)}
                        disabled={revokingId === agent.id}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                      >
                        <Trash2 size={13} />
                        {revokingId === agent.id ? 'Revogando...' : 'Revogar Agente'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Pareamento por Código Canônico (WIT-XXXX-XXXX) */}
      {isPairingModalOpen && pairingData && (() => {
        const pairingCode = pairingData.pairingCode || pairingData.formattedCode || '';
        const command = pairingData.command || `witiquetas-agent-windows-x64.exe pair --code ${pairingCode}`;
        const expirationInfo = formatPairingExpiration(pairingData.expiresAt, pairingData.expiresInSeconds);

        return (
          <div
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
              style={{
                width: '100%',
                maxWidth: '560px',
                padding: '1.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Key size={20} color="var(--accent-blue)" />
                  Parear Novo Agente de Impressão
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsPairingModalOpen(false)}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Execute o instalador/agente no computador local onde as impressoras estão conectadas e informe o código gerado:
              </div>

              {/* Caixa de Código em Destaque */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1.1rem 1.25rem',
                  background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                  border: '2px solid var(--accent-blue, #3b82f6)',
                  borderRadius: '10px',
                  gap: '1rem',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.12)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-blue, #60a5fa)', fontWeight: 700 }}>
                    CÓDIGO DE PAREAMENTO
                  </div>
                  <div
                    data-testid="pairing-code-display"
                    style={{
                      fontSize: '1.85rem',
                      fontWeight: 800,
                      letterSpacing: '0.12em',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      color: 'var(--text-primary, #ffffff)',
                      userSelect: 'all',
                    }}
                  >
                    {pairingCode}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCopyCode}
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    padding: '0.55rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    whiteSpace: 'nowrap',
                    minWidth: '110px',
                    justifyContent: 'center',
                  }}
                  title="Copiar código de pareamento"
                >
                  {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                  {copiedCode ? 'Copiado ✓' : 'Copiar'}
                </button>
              </div>

              {/* Expiração sem Invalid Date */}
              <div
                data-testid="pairing-expiration-display"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.8rem',
                  color: 'var(--status-warning, #f59e0b)',
                  fontWeight: 500,
                }}
              >
                <Clock size={15} style={{ flexShrink: 0 }} />
                <span>
                  {expirationInfo.primary}
                  {expirationInfo.secondary && (
                    <span style={{ opacity: 0.9, marginLeft: '0.35rem' }}>
                      ({expirationInfo.secondary})
                    </span>
                  )}
                </span>
              </div>

              {/* Componente de Comando no Terminal de Alto Contraste (WCAG AAA) */}
              <div
                style={{
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  background: '#0f172a',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.55rem 0.85rem',
                    background: '#1e293b',
                    borderBottom: '1px solid #334155',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                    }}
                  >
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></span>
                    Comando no Terminal / Prompt
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyCommand}
                    style={{
                      background: copiedCommand ? '#166534' : 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      borderRadius: '4px',
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title="Copiar comando completo"
                  >
                    {copiedCommand ? <Check size={13} /> : <Copy size={13} />}
                    {copiedCommand ? 'Copiado ✓' : 'Copiar'}
                  </button>
                </div>

                <div
                  data-testid="pairing-command-display"
                  style={{
                    padding: '0.85rem 1rem',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: '0.82rem',
                    color: '#f8fafc',
                    overflowX: 'auto',
                    whiteSpace: 'pre',
                    userSelect: 'all',
                    lineHeight: 1.45,
                  }}
                >
                  {command}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsPairingModalOpen(false);
                    loadAgents();
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
