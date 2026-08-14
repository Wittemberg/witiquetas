import React, { useState, useEffect } from 'react';
import { useEditorStore, MOCK_PRODUCT_DATA } from './useEditorStore';
import { PrinterLanguage } from '@witiquetas/printer-core';
import { PrinterDTO, AgentDTO } from '@witiquetas/contracts';
import {
  X,
  Copy,
  Download,
  Printer,
  Check,
  AlertTriangle,
  Send,
  Radio,
  Server,
  Activity,
  Layers,
  Sparkles
} from 'lucide-react';

interface CompileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CompileModal({ isOpen, onClose }: CompileModalProps) {
  const { document } = useEditorStore();
  const [activeTab, setActiveTab] = useState<'agent' | 'manual'>('agent');

  // Estados da Impressão Direta (Agente Local)
  const [printers, setPrinters] = useState<PrinterDTO[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [copies, setCopies] = useState<number>(1);
  const [agents, setAgents] = useState<AgentDTO[]>([]);
  const [sendingJob, setSendingJob] = useState(false);
  const [jobSuccessMessage, setJobSuccessMessage] = useState<string | null>(null);

  // Estados da Compilação Manual
  const [language, setLanguage] = useState<PrinterLanguage>('PPLB');
  const [loading, setLoading] = useState(false);
  const [compiledResult, setCompiledResult] = useState<{
    command: string;
    encoding: string;
    warnings: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Carregar impressoras e agentes ao abrir
  useEffect(() => {
    if (!isOpen) return;

    // Buscar Impressoras
    fetch('/api/printers')
      .then((r) => r.json())
      .then((data) => {
        if (data.printers && data.printers.length > 0) {
          setPrinters(data.printers);
          const defaultPrn = data.printers.find((p: PrinterDTO) => p.isDefault) || data.printers[0];
          setSelectedPrinterId(defaultPrn.id);
          if (defaultPrn.language) {
            setLanguage(defaultPrn.language as any);
          }
        }
      })
      .catch(() => {
        // Fallback local se backend offline
        setPrinters([
          {
            id: 'prn-gondola-elgin-tcp',
            companyId: 'comp-matriz-01',
            name: 'Elgin L42 Pro (Gôndola / Estoque)',
            protocol: 'RAW_TCP',
            host: '192.168.1.200',
            port: 9100,
            language: 'PPLB',
            dpi: 203,
            active: true,
            isDefault: true,
            createdAt: '',
            updatedAt: '',
          },
        ]);
        setSelectedPrinterId('prn-gondola-elgin-tcp');
      });

    // Buscar Status do Agente
    fetch('/api/agents')
      .then((r) => r.json())
      .then((data) => {
        if (data.agents) {
          setAgents(data.agents);
        }
      })
      .catch(() => setAgents([]));
  }, [isOpen]);

  if (!isOpen) return null;

  // 1. Enviar Job de Impressão para o Backend / Agente Local
  const handleSendPrintJob = async () => {
    setSendingJob(true);
    setError(null);
    setJobSuccessMessage(null);

    const printer = printers.find((p) => p.id === selectedPrinterId);
    const targetLang = (printer?.language || language) as PrinterLanguage;

    try {
      const res = await fetch('/api/print-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printerId: selectedPrinterId,
          document,
          language: targetLang,
          copies,
          data: MOCK_PRODUCT_DATA,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setJobSuccessMessage(
          `Job '${json.job.id}' enviado para '${json.job.printerName}' (${copies} ${copies === 1 ? 'cópia' : 'cópias'}). O Agente Local transmitirá os bytes RAW TCP automaticamente.`
        );
      } else {
        setError(json.error || 'Falha ao despachar job de impressão.');
      }
    } catch (err: any) {
      setError(`Erro de comunicação com o servidor: ${err.message}`);
    } finally {
      setSendingJob(false);
    }
  };

  // 2. Compilar Manualmente para Preview / Download
  const handleCompile = async () => {
    setLoading(true);
    setError(null);
    setCompiledResult(null);

    try {
      const res = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document,
          language,
          data: MOCK_PRODUCT_DATA,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setCompiledResult({
          command: json.command,
          encoding: json.encoding,
          warnings: json.warnings || [],
        });
      } else {
        setError(json.error || 'Falha ao compilar etiqueta.');
      }
    } catch (err: any) {
      setError(`Erro de conexão com o backend: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!compiledResult) return;
    navigator.clipboard.writeText(compiledResult.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadTxt = () => {
    if (!compiledResult) return;
    const blob = new Blob([compiledResult.command], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = globalThis.document.createElement('a');
    a.href = url;
    a.download = `etiqueta-${language.toLowerCase()}-${document.title.toLowerCase().replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasOnlineAgent = agents.some((a) => a.status === 'ONLINE');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          backgroundColor: 'var(--modal-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '18px',
          boxShadow: 'var(--shadow-elevated)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--header-bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Printer size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Impressão Térmica de Etiquetas
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {document.title} ({document.dimensions.widthMm} × {document.dimensions.heightMm} mm)
              </p>
            </div>
          </div>
          <button className="btn" style={{ padding: '0.4rem', border: 'none' }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Alternador de Abas */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-input)' }}>
          <button
            onClick={() => setActiveTab('agent')}
            style={{
              flex: 1,
              padding: '0.85rem',
              background: activeTab === 'agent' ? 'var(--modal-bg)' : 'transparent',
              border: 'none',
              borderBottom: `2px solid ${activeTab === 'agent' ? 'var(--status-success)' : 'transparent'}`,
              color: activeTab === 'agent' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
            }}
          >
            <Send size={16} color="var(--status-success)" />
            <span>Imprimir no Agente Local (RAW TCP)</span>
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            style={{
              flex: 1,
              padding: '0.85rem',
              background: activeTab === 'manual' ? 'var(--modal-bg)' : 'transparent',
              border: 'none',
              borderBottom: `2px solid ${activeTab === 'manual' ? 'var(--accent-blue)' : 'transparent'}`,
              color: activeTab === 'manual' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
            }}
          >
            <Download size={16} color="var(--accent-blue)" />
            <span>Compilação & Arquivo .TXT (Manual)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.75rem', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ padding: '0.9rem 1.1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', color: 'var(--status-danger)', fontSize: '0.85rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'agent' ? (
            /* ==========================================================
               ABA 1: DISPARO DIRETO VIA AGENTE LOCAL
               ========================================================== */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Status do Agente */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Server size={18} color="var(--accent-blue)" />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Serviço Agente Local (Witiquetas Agent)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {agents.length > 0
                        ? `${agents.length} agente(s) pareado(s) na empresa`
                        : 'Aguardando pareamento do primeiro agente desktop'}
                    </div>
                  </div>
                </div>

                <span className={`badge ${hasOnlineAgent ? 'badge-success' : 'badge-warning'}`}>
                  <Activity size={12} />
                  {hasOnlineAgent ? 'Online & Pronto' : 'Aguardando Heartbeat'}
                </span>
              </div>

              {/* Seletor de Impressora Térmica */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                  Selecione a Impressora Térmica de Destino:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {printers.map((printer) => {
                    const isSelected = selectedPrinterId === printer.id;
                    return (
                      <div
                        key={printer.id}
                        onClick={() => {
                          setSelectedPrinterId(printer.id);
                          if (printer.language) setLanguage(printer.language as any);
                        }}
                        style={{
                          padding: '0.9rem 1.1rem',
                          borderRadius: '12px',
                          border: `2px solid ${isSelected ? 'var(--status-success)' : 'var(--border-color)'}`,
                          background: isSelected ? 'var(--bg-card-active)' : 'var(--bg-card)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{printer.name}</span>
                            {printer.isDefault && (
                              <span style={{ fontSize: '0.65rem', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', padding: '0.1rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                                Principal
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            Protocolo: <strong>{printer.protocol}</strong> • IP/Host: <strong>{printer.host}:{printer.port}</strong> • Linguagem: <strong>{printer.language}</strong>
                          </div>
                        </div>

                        {isSelected && <Check size={18} color="var(--status-success)" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quantidade de Cópias */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-card)', padding: '0.85rem 1.1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Número de Cópias:
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {[1, 2, 5, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      className={`btn ${copies === num ? 'btn-primary' : ''}`}
                      style={{ padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}
                      onClick={() => setCopies(num)}
                    >
                      {num}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    className="inspector-input"
                    style={{ width: '70px', padding: '0.3rem 0.5rem', textAlign: 'center' }}
                  />
                </div>
              </div>

              {/* Botão de Disparo */}
              <button
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '0.9rem',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                }}
                onClick={handleSendPrintJob}
                disabled={sendingJob || !selectedPrinterId}
              >
                <Send size={18} />
                <span>{sendingJob ? 'Enfileirando job no servidor...' : `Disparar Impressão Direta (${copies} ${copies === 1 ? 'cópia' : 'cópias'})`}</span>
              </button>

              {/* Mensagem de Sucesso */}
              {jobSuccessMessage && (
                <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: '10px', color: 'var(--status-success)', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <Check size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Sucesso!</strong> {jobSuccessMessage}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ==========================================================
               ABA 2: COMPILAÇÃO MANUAL (CÓPIA & TXT)
               ========================================================== */
            <div>
              {/* Escolha de Linguagem */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                  Selecione a Linguagem da Impressora Térmica:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div
                    onClick={() => setLanguage('PPLB')}
                    style={{
                      padding: '1rem',
                      borderRadius: '12px',
                      border: `2px solid ${language === 'PPLB' ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                      background: language === 'PPLB' ? 'var(--bg-card-active)' : 'var(--bg-card)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                      Elgin / Argox PPLB
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Sintaxe nativa PPLB (Comandos N, A, B, LO, P1)
                    </div>
                  </div>

                  <div
                    onClick={() => setLanguage('PPLA')}
                    style={{
                      padding: '1rem',
                      borderRadius: '12px',
                      border: `2px solid ${language === 'PPLA' ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                      background: language === 'PPLA' ? 'var(--bg-card-active)' : 'var(--bg-card)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                      Argox / Datamax PPLA
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Sintaxe nativa PPLA (Comandos STX L, E)
                    </div>
                  </div>
                </div>
              </div>

              {/* Botão de Compilar */}
              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.8rem', justifyContent: 'center', fontSize: '0.95rem', fontWeight: 600, marginBottom: '1.5rem' }}
                onClick={handleCompile}
                disabled={loading}
              >
                <Printer size={18} />
                <span>{loading ? 'Compilando via Backend API...' : `Compilar Layout para ${language}`}</span>
              </button>

              {/* Resultado Compilado */}
              {compiledResult && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--status-success)' }}>
                      ✓ Compilado com sucesso ({compiledResult.encoding})
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={handleCopy}>
                        {copied ? <Check size={14} color="var(--status-success)" /> : <Copy size={14} />}
                        <span>{copied ? 'Copiado!' : 'Copiar Comando'}</span>
                      </button>
                      <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={handleDownloadTxt}>
                        <Download size={14} />
                        <span>Baixar .TXT</span>
                      </button>
                    </div>
                  </div>

                  {compiledResult.warnings.length > 0 && (
                    <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', color: '#fbbf24', fontSize: '0.75rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <AlertTriangle size={14} />
                      <span>Avisos: {compiledResult.warnings.join(' | ')}</span>
                    </div>
                  )}

                  <pre className="code-block" style={{ maxHeight: '200px', fontSize: '0.85rem' }}>
                    {compiledResult.command}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
