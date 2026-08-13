import React, { useState } from 'react';
import { useEditorStore, MOCK_PRODUCT_DATA } from './useEditorStore';
import { PrinterLanguage } from '@witiquetas/printer-core';
import { X, Copy, Download, Printer, Check, AlertTriangle } from 'lucide-react';

interface CompileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CompileModal({ isOpen, onClose }: CompileModalProps) {
  const { document } = useEditorStore();
  const [language, setLanguage] = useState<PrinterLanguage>('PPLB');
  const [loading, setLoading] = useState(false);
  const [compiledResult, setCompiledResult] = useState<{
    command: string;
    encoding: string;
    warnings: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Enviar para a API /api/compile
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

  // Copiar comando para a área de transferência
  const handleCopy = () => {
    if (!compiledResult) return;
    navigator.clipboard.writeText(compiledResult.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Baixar arquivo .txt
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

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
          maxWidth: '680px',
          backgroundColor: '#0f1525',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(22, 28, 45, 0.8)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Printer color="#10b981" size={22} />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Compilar & Testar Impressão Física
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Gere comandos nativos de impressora térmica a partir do LabelDocument v1
              </p>
            </div>
          </div>
          <button className="btn" style={{ padding: '0.4rem', border: 'none' }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
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
                  borderRadius: '10px',
                  border: `2px solid ${language === 'PPLB' ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                  background: language === 'PPLB' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(10, 14, 23, 0.6)',
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
                  borderRadius: '10px',
                  border: `2px solid ${language === 'PPLA' ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                  background: language === 'PPLA' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(10, 14, 23, 0.6)',
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

          {/* Erro */}
          {error && (
            <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#f87171', fontSize: '0.85rem' }}>
              <strong>Falha na Compilação:</strong> {error}
            </div>
          )}

          {/* Resultado Compilado */}
          {compiledResult && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--status-success)' }}>
                  ✓ Compilado com sucesso ({compiledResult.encoding})
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={handleCopy}>
                    {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                    <span>{copied ? 'Copiado!' : 'Copiar Comando'}</span>
                  </button>
                  <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={handleDownloadTxt}>
                    <Download size={14} />
                    <span>Baixar .TXT</span>
                  </button>
                </div>
              </div>

              {/* Warnings se houver */}
              {compiledResult.warnings.length > 0 && (
                <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', color: '#fbbf24', fontSize: '0.75rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <AlertTriangle size={14} />
                  <span>Avisos: {compiledResult.warnings.join(' | ')}</span>
                </div>
              )}

              {/* Caixa do Código RAW */}
              <pre className="code-block" style={{ maxHeight: '200px', fontSize: '0.85rem', color: '#6ee7b7' }}>
                {compiledResult.command}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
