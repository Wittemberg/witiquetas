import React, { useState, useEffect, useRef } from 'react';
import {
  KeyRound,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Cpu,
  Monitor,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { ensurePreRbacSession } from '../auth/session';

interface PairAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface PairingData {
  pairingCode: string;
  expiresInSeconds: number;
  companyName: string;
  companyId: string;
}

interface PairedAgentDetails {
  id: string;
  machineName: string;
  os: string;
  architecture: string;
  agentVersion: string;
  status: string;
}

export default function PairAgentModal({ isOpen, onClose, onSuccess }: PairAgentModalProps) {
  const [pairingData, setPairingData] = useState<PairingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPaired, setIsPaired] = useState(false);
  const [pairedAgent, setPairedAgent] = useState<PairedAgentDetails | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(900); // 15 minutos em segundos

  const pollIntervalRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);

  const generateCode = async () => {
    setLoading(true);
    setError(null);
    setIsPaired(false);
    setPairedAgent(null);

    try {
      // PRE-RBAC / TEMPORÁRIA: Garante que a sessão Web esteja válida antes de solicitar o código
      const session = await ensurePreRbacSession();
      if (!session.authenticated) {
        throw new Error('Não foi possível iniciar o pareamento. A sessão do Witiquetas não está disponível.');
      }

      const res = await fetch('/api/agents/generate-pairing-code', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Não foi possível iniciar o pareamento. A sessão do Witiquetas não está disponível.');
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Não foi possível iniciar o pareamento. A sessão do Witiquetas não está disponível.');
      }

      const data: PairingData = await res.json();
      setPairingData(data);
      setTimeLeft(data.expiresInSeconds || 900);
    } catch (err: any) {
      setError(err.message || 'Falha ao comunicar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      generateCode();
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isOpen]);

  // Contagem regressiva de expiração
  useEffect(() => {
    if (!pairingData || isPaired) return;

    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [pairingData, isPaired]);

  // Polling leve para detectar quando o Agent executou o pareamento
  useEffect(() => {
    if (!pairingData || isPaired || timeLeft <= 0) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/agents/pairing-status/${encodeURIComponent(pairingData.pairingCode)}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'USED' && data.agent) {
            setIsPaired(true);
            setPairedAgent(data.agent);
            clearInterval(pollIntervalRef.current);
            if (onSuccess) onSuccess();
          }
        }
      } catch {
        // ignora erros pontuais de polling
      }
    }, 2500);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [pairingData, isPaired, timeLeft]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!pairingData) return;
    navigator.clipboard.writeText(pairingData.pairingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="wizard-modal-overlay" onClick={onClose}>
      <div
        className="wizard-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '560px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          background: 'var(--modal-bg)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-card-hover)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              }}
            >
              <KeyRound size={18} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Conectar Agent de Impressão
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
                {pairingData?.companyName || 'Pareamento Seguro de Terminal'}
              </p>
            </div>
          </div>

          <button
            className="btn"
            onClick={onClose}
            style={{
              padding: '0.4rem',
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loading && (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} className="spin" style={{ margin: '0 auto 0.75rem auto', display: 'block', color: 'var(--accent-blue)' }} />
              <p style={{ margin: 0, fontSize: '0.9rem' }}>Gerando código criptográfico seguro...</p>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '1rem 1.25rem',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '12px',
                color: 'var(--status-danger)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <AlertCircle size={20} />
              <div style={{ flex: 1, fontSize: '0.9rem', lineHeight: '1.4' }}>
                {error}
              </div>
              <button className="btn" onClick={generateCode} style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && pairingData && !isPaired && (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                Abra o Agent no computador que possui acesso às impressoras térmicas e informe o código abaixo:
              </p>

              {/* Box de Exibição do Código Grande */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '2px dashed var(--accent-blue)',
                  borderRadius: '14px',
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Código de Pareamento de Uso Único
                </div>

                <div
                  style={{
                    fontSize: '2rem',
                    fontWeight: 900,
                    letterSpacing: '0.15em',
                    fontFamily: 'monospace',
                    color: 'var(--text-primary)',
                    userSelect: 'all',
                  }}
                >
                  {pairingData.pairingCode}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleCopy}
                    style={{
                      padding: '0.5rem 1.2rem',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    <span>{copied ? 'Código Copiado!' : 'Copiar Código'}</span>
                  </button>

                  <button
                    className="btn"
                    onClick={generateCode}
                    style={{ fontSize: '0.8rem', padding: '0.5rem 0.8rem' }}
                    title="Gerar novo código"
                  >
                    <RefreshCw size={14} />
                    <span>Novo código</span>
                  </button>
                </div>
              </div>

              {/* Status de Expiração e Espera */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Clock size={14} color={timeLeft < 180 ? 'var(--status-danger)' : 'var(--accent-blue)'} />
                  <span>
                    {timeLeft > 0 ? (
                      <>Expira em: <strong style={{ color: 'var(--text-primary)' }}>{formatTime(timeLeft)}</strong></>
                    ) : (
                      <strong style={{ color: 'var(--status-danger)' }}>Código expirado. Gere um novo código.</strong>
                    )}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <RefreshCw size={10} className="spin" />
                    Aguardando Agent...
                  </span>
                </div>
              </div>

              {/* Instruções Rápidas */}
              <div
                style={{
                  background: 'var(--bg-card-hover)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '1rem 1.25rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Terminal size={14} color="var(--accent-cyan)" />
                  <span>Passo a passo no terminal:</span>
                </div>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                  <li>Execute <code>witiquetas-agent-windows-x64.exe</code> no computador da loja/estoque.</li>
                  <li>Cole ou digite o código <strong>{pairingData.pairingCode}</strong> e pressione Enter.</li>
                  <li>Esta tela reconhecerá a conexão instantaneamente.</li>
                </ol>
              </div>
            </>
          )}

          {/* Estado de Sucesso: Agent Conectado! */}
          {isPaired && pairedAgent && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(59, 130, 246, 0.12))',
                border: '1.5px solid var(--status-success)',
                borderRadius: '14px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={28} color="var(--status-success)" />
              </div>

              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 0.3rem 0', color: 'var(--text-primary)' }}>
                  Agent Conectado com Sucesso!
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                  O terminal agora está autorizado e pronto para receber ordens de impressão direta.
                </p>
              </div>

              {/* Métricas do Agente Conectado */}
              <div
                style={{
                  width: '100%',
                  background: 'var(--bg-card)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  padding: '0.75rem 1rem',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.5rem',
                  textAlign: 'left',
                  fontSize: '0.8rem',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Computador:</span>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pairedAgent.machineName}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Sistema:</span>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pairedAgent.os} ({pairedAgent.architecture})</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Versão:</span>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>v{pairedAgent.agentVersion}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                  <div style={{ fontWeight: 700, color: 'var(--status-success)' }}>🟢 Online</div>
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={onClose}
                style={{ width: '100%', padding: '0.65rem', marginTop: '0.5rem', fontWeight: 700 }}
              >
                Concluir e Voltar ao Painel
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-card)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={13} color="var(--status-success)" />
            <span>Isolamento estrito por tenant. Token salvo apenas localmente no Agent.</span>
          </div>

          <button className="btn" onClick={onClose} style={{ padding: '0.5rem 1.2rem' }}>
            {isPaired ? 'Concluir' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  );
}
