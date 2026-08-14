import React, { useState, useEffect } from 'react';
import { useEditorStore, formatDimensionBR } from './useEditorStore';
import { parseImportContent, detectAdapter, ImportResult } from './importers';
import {
  FileUp,
  FileText,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  X,
  Layers,
  ArrowRight,
  Upload
} from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const { setDocument } = useEditorStore();
  const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
  const [content, setContent] = useState('');
  const [parsedResult, setParsedResult] = useState<ImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Exemplo padrão para visualização imediata
  const sampleLegacyContent = `[[TAMANHO: 100x30x203]]
[[DESCRICAO]]
[[PRECO]]
[[EAN]]
[[QR: https://empresa.com.br/clube]]
[[TEXT: PRODUTO EM OFERTA - VALIDADE 15 DIAS]]
[[LINHA]]`;

  useEffect(() => {
    if (isOpen && !content) {
      setContent(sampleLegacyContent);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!content.trim()) {
      setParsedResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsProcessing(true);
      try {
        const result = await parseImportContent(content);
        setParsedResult(result);
      } catch (err) {
        console.error('Erro ao interpretar modelo:', err);
      } finally {
        setIsProcessing(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [content]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setContent(text);
        setActiveTab('paste');
      }
    };
    reader.readAsText(file);
  };

  const handleImportToCanvas = () => {
    if (!parsedResult) return;
    setDocument(parsedResult.document);
    onClose();
  };

  return (
    <div className="wizard-modal-overlay">
      <div className="wizard-modal-content" style={{ maxWidth: '780px' }}>
        {/* Header do Modal */}
        <div className="wizard-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div className="niche-card-icon" style={{ width: '36px', height: '36px' }}>
              <FileUp size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Importar Modelo de Etiqueta
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Abra arquivos legados (tags [[PRECO]], [[EAN]], ZPL, PPLA) e converta em elementos editáveis.
              </p>
            </div>
          </div>
          <button className="btn" style={{ padding: '0.4rem', border: 'none' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0 1.25rem', marginTop: '0.5rem' }}>
          <button
            className={`btn ${activeTab === 'paste' ? 'btn-primary' : ''}`}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setActiveTab('paste')}
          >
            <FileText size={14} />
            <span>Colar Conteúdo</span>
          </button>
          <label
            className="btn"
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Upload size={14} />
            <span>Carregar Arquivo (.txt, .zpl, .prn)</span>
            <input
              type="file"
              accept=".txt,.zpl,.prn,.lbl,.wlbl,.json"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {/* Corpo com 2 Colunas: Editor de Texto e Diagnóstico */}
        <div className="wizard-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxHeight: '420px', overflowY: 'auto' }}>
          {/* Coluna Esquerda: Texto */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label className="metric-label">Conteúdo do Arquivo</label>
            <textarea
              className="inspector-input"
              style={{
                height: '280px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                lineHeight: 1.4,
                resize: 'none',
              }}
              value={content}
              placeholder="Cole o código do modelo aqui (ex: [[DESCRICAO]], [[PRECO]], ^XA...^XZ)..."
              onChange={(e) => setContent(e.target.value)}
            />
            <button
              className="btn"
              style={{ fontSize: '0.72rem', alignSelf: 'flex-start', color: 'var(--accent-blue)' }}
              onClick={() => setContent(sampleLegacyContent)}
            >
              Restaurar Exemplo Legado
            </button>
          </div>

          {/* Coluna Direita: Diagnóstico e Reconhecimento */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <label className="metric-label">Diagnóstico da Conversão</label>

            {parsedResult ? (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* Formato Detectado */}
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Formato Identificado:</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-blue)' }}>
                    {parsedResult.formatName}
                  </div>
                </div>

                {/* Dimensões Extraídas */}
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Dimensões:</span>
                  <span className="preview-dimension-badge" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>
                    {formatDimensionBR(parsedResult.document.dimensions.widthMm)} × {formatDimensionBR(parsedResult.document.dimensions.heightMm)} ({parsedResult.document.dimensions.dpi} DPI)
                  </span>
                </div>

                {/* Resumo de Elementos */}
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--status-success)', fontWeight: 700 }}>
                    ✓ {parsedResult.elementsCount} elementos convertidos
                  </span>
                  {parsedResult.warningsCount > 0 && (
                    <span style={{ color: 'var(--status-warning)', fontWeight: 700 }}>
                      ⚠ {parsedResult.warningsCount} avisos
                    </span>
                  )}
                </div>

                {/* Lista de Diagnósticos */}
                <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {parsedResult.diagnostics.map((diag, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        background: 'var(--bg-input)',
                        fontSize: '0.7rem',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.4rem',
                      }}
                    >
                      {diag.status === 'converted' && <CheckCircle2 size={13} color="var(--status-success)" style={{ marginTop: '2px' }} />}
                      {diag.status === 'partial' && <AlertTriangle size={13} color="var(--status-warning)" style={{ marginTop: '2px' }} />}
                      {diag.status === 'unrecognized' && <HelpCircle size={13} color="var(--text-muted)" style={{ marginTop: '2px' }} />}
                      <span style={{ color: diag.status === 'unrecognized' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                        {diag.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                <Sparkles size={20} color="var(--accent-blue)" style={{ margin: '0 auto 0.5rem' }} />
                <span>Insira o conteúdo do modelo para iniciar o diagnóstico automático.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer do Modal */}
        <div className="wizard-footer">
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>

          <button
            className="btn btn-primary"
            onClick={handleImportToCanvas}
            disabled={!parsedResult || parsedResult.elementsCount === 0}
          >
            <span>Importar para o Canvas</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
