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
    } catch (err: any) {
      setError(err.message || 'Falha ao gerar código de pareamento.');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleCopyCode = () => {
    if (pairingData?.formattedCode) {
      navigator.clipboard.writeText(pairingData.formattedCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
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
      {isPairingModalOpen && pairingData && (
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
              maxWidth: '520px',
              padding: '1.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
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

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Execute o agente no computador local onde as impressoras estão conectadas e informe o código abaixo:
            </div>

            {/* Caixa de Código em Destaque */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.25rem',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid var(--accent-blue)',
                borderRadius: '8px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-blue)', fontWeight: 700 }}>
                  Código de Pareamento Único
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '0.12em', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {pairingData.formattedCode}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCopyCode}
                style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                {copiedCode ? 'Copiado!' : 'Copiar'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--status-warning, #f59e0b)' }}>
              <Clock size={14} />
              <span>Este código expira em {Math.round(pairingData.expiresInSeconds / 60)} minutos ({new Date(pairingData.expiresAt).toLocaleTimeString('pt-BR')}).</span>
            </div>

            <div style={{ padding: '0.85rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <strong>Comando no Terminal / Prompt:</strong>
              <div style={{ fontFamily: 'monospace', background: 'rgba(0, 0, 0, 0.4)', padding: '0.5rem', borderRadius: '4px', marginTop: '0.35rem', color: '#38bdf8' }}>
                witiquetas-agent-windows-x64.exe pair --code {pairingData.formattedCode}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
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
      )}
    </div>
  );
};
