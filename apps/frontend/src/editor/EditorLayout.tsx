import React, { useState } from 'react';
import { useEditorStore } from './useEditorStore';
import CanvasArea from './CanvasArea';
import PropertyInspector from './PropertyInspector';
import CompileModal from './CompileModal';
import NewTemplateWizard from './NewTemplateWizard';
import {
  Type,
  DollarSign,
  Barcode,
  QrCode,
  Square,
  Minus,
  ZoomIn,
  ZoomOut,
  Grid,
  Eye,
  Undo2,
  Redo2,
  Save,
  Download,
  ArrowLeft,
  Printer,
  Sun,
  Moon,
  Sparkles,
  Maximize2,
  AlertTriangle
} from 'lucide-react';

interface EditorLayoutProps {
  onBackToDashboard: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export default function EditorLayout({ onBackToDashboard, theme, onToggleTheme }: EditorLayoutProps) {
  const [isCompileModalOpen, setIsCompileModalOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const {
    document,
    updateDimensions,
    zoom,
    setZoom,
    snapToGrid,
    setSnapToGrid,
    showPreviewData,
    setShowPreviewData,
    addElement,
    undo,
    redo,
    historyIndex,
    history,
  } = useEditorStore();

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Alerta de limite térmico padrão (104 mm)
  const isOverThermalLimit = document.dimensions.widthMm > 104;

  // Salvar Modelo na API Backend
  const handleSaveBackend = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.title,
          document,
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert('Erro ao salvar modelo na API.');
      }
    } catch (err: any) {
      alert(`Falha ao conectar com o backend: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Exportar JSON abstrato LabelDocument v1
  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(document, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = globalThis.document.createElement('a');
    a.href = url;
    a.download = `${document.title.toLowerCase().replace(/\s+/g, '-')}-label.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Barra de Ferramentas Superior (Header) */}
      <header
        style={{
          height: '60px',
          background: 'var(--header-bg)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.25rem',
          backdropFilter: 'blur(12px)',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn" onClick={onBackToDashboard} title="Voltar ao Painel de Status">
            <ArrowLeft size={16} />
            <span>Voltar</span>
          </button>

          <div style={{ height: '24px', width: '1px', background: 'var(--border-color)' }} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {document.title}
              </h2>
              <button
                className="btn"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', height: '24px' }}
                onClick={() => setIsWizardOpen(true)}
                title="Trocar formato ou nicho da etiqueta"
              >
                <Maximize2 size={12} />
                <span>Trocar Formato</span>
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span>{document.dimensions.widthMm} × {document.dimensions.heightMm} mm</span>
              <span>•</span>
              <span>{document.dimensions.dpi} DPI</span>
              <span>•</span>
              <span>Schema v{document.schemaVersion}</span>
              {isOverThermalLimit && (
                <span style={{ color: 'var(--status-warning)', display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 600 }}>
                  <AlertTriangle size={12} />
                  Largura &gt; 104mm
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Controles Centrais */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            className="btn"
            onClick={undo}
            disabled={historyIndex <= 0}
            style={{ opacity: historyIndex <= 0 ? 0.4 : 1 }}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="btn"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            style={{ opacity: historyIndex >= history.length - 1 ? 0.4 : 1 }}
            title="Refazer (Ctrl+Y)"
          >
            <Redo2 size={16} />
          </button>

          <div style={{ height: '24px', width: '1px', background: 'var(--border-color)', margin: '0 0.25rem' }} />

          <button
            className="btn"
            onClick={() => setSnapToGrid(!snapToGrid)}
            style={{ borderColor: snapToGrid ? 'var(--accent-blue)' : 'var(--border-color)', color: snapToGrid ? 'var(--accent-blue)' : 'var(--text-primary)' }}
            title="Grade com Snap Magnético"
          >
            <Grid size={16} />
            <span>Grade</span>
          </button>

          <button
            className="btn"
            onClick={() => setShowPreviewData(!showPreviewData)}
            style={{ borderColor: showPreviewData ? 'var(--status-success)' : 'var(--border-color)', color: showPreviewData ? 'var(--status-success)' : 'var(--text-primary)' }}
            title="Alternar dados de produto reais/simulados"
          >
            <Eye size={16} />
            <span>{showPreviewData ? 'Preview ON' : 'Preview OFF'}</span>
          </button>

          <div style={{ height: '24px', width: '1px', background: 'var(--border-color)', margin: '0 0.25rem' }} />

          {/* Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--bg-input)', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <button className="btn" style={{ padding: '0.2rem', border: 'none' }} onClick={() => setZoom(zoom - 0.25)}>
              <ZoomOut size={14} />
            </button>
            <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', minWidth: '45px', textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button className="btn" style={{ padding: '0.2rem', border: 'none' }} onClick={() => setZoom(zoom + 0.25)}>
              <ZoomIn size={14} />
            </button>
          </div>
        </div>

        {/* Ações da Direita + Alternador de Tema */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Alternador Sol / Lua */}
          <button
            className="btn-theme-toggle"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Alternar para Modo Claro (Light)' : 'Alternar para Modo Escuro (Dark)'}
          >
            {theme === 'dark' ? <Sun size={18} color="#f59e0b" /> : <Moon size={18} color="#3b82f6" />}
          </button>

          <button
            className="btn"
            style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', color: 'var(--status-success)' }}
            onClick={() => setIsCompileModalOpen(true)}
            title="Compilar para linguagem nativa PPLA/PPLB"
          >
            <Printer size={16} />
            <span>Compilar / Impressão</span>
          </button>

          <button className="btn" onClick={handleExportJSON} title="Baixar arquivo JSON LabelDocument v1">
            <Download size={16} />
            <span>Exportar JSON</span>
          </button>

          <button className="btn btn-primary" onClick={handleSaveBackend} disabled={saving}>
            <Save size={16} />
            <span>{saving ? 'Salvando...' : saveSuccess ? 'Salvo!' : 'Salvar Modelo'}</span>
          </button>
        </div>
      </header>

      {/* Corpo Principal (Esquerda: Paleta | Centro: Canvas | Direita: Inspetor) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Painel Esquerdo — Inserção de Elementos */}
        <aside
          style={{
            width: '240px',
            background: 'var(--aside-bg)',
            borderRight: '1px solid var(--border-color)',
            padding: '1.25rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Adicionar Elemento
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => addElement('text')}>
              <Type size={16} color="var(--accent-blue)" />
              <span>Texto Simples</span>
            </button>

            <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => addElement('price')}>
              <DollarSign size={16} color="#ef4444" />
              <span>Preço em R$</span>
            </button>

            <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => addElement('barcode')}>
              <Barcode size={16} color="var(--accent-cyan)" />
              <span>Código EAN-13</span>
            </button>

            <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => addElement('qrcode')}>
              <QrCode size={16} color="var(--status-success)" />
              <span>QR Code</span>
            </button>

            <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => addElement('rectangle')}>
              <Square size={16} color="var(--status-warning)" />
              <span>Retângulo</span>
            </button>

            <button className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => addElement('line')}>
              <Minus size={16} color="var(--accent-purple)" />
              <span>Linha Divisória</span>
            </button>
          </div>

          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Dimensões da Etiqueta
              </label>
              <button
                style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => setIsWizardOpen(true)}
              >
                Nichos
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <span className="metric-label">Largura (mm)</span>
                <input
                  type="number"
                  className="inspector-input"
                  value={document.dimensions.widthMm}
                  onChange={(e) => updateDimensions(parseFloat(e.target.value) || 10, document.dimensions.heightMm, document.dimensions.dpi)}
                />
              </div>
              <div>
                <span className="metric-label">Altura (mm)</span>
                <input
                  type="number"
                  className="inspector-input"
                  value={document.dimensions.heightMm}
                  onChange={(e) => updateDimensions(document.dimensions.widthMm, parseFloat(e.target.value) || 10, document.dimensions.dpi)}
                />
              </div>
            </div>

            {isOverThermalLimit && (
              <div style={{ padding: '0.4rem 0.6rem', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', color: '#fbbf24', fontSize: '0.7rem', marginBottom: '0.5rem' }}>
                ⚠️ Atenção: Largura acima do padrão de 104 mm.
              </div>
            )}

            <span className="metric-label">Resolução Impressora</span>
            <select
              className="inspector-select"
              value={document.dimensions.dpi}
              onChange={(e) => updateDimensions(document.dimensions.widthMm, document.dimensions.heightMm, parseInt(e.target.value) as any)}
            >
              <option value={203}>203 DPI (Padrão Térmica)</option>
              <option value={300}>300 DPI (Alta Resolução)</option>
            </select>
          </div>
        </aside>

        {/* Área Central — Canvas Interativo */}
        <CanvasArea />

        {/* Painel Direito — Inspetor de Propriedades */}
        <aside
          style={{
            width: '320px',
            background: 'var(--aside-bg)',
            borderLeft: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <PropertyInspector />
        </aside>
      </div>

      <CompileModal isOpen={isCompileModalOpen} onClose={() => setIsCompileModalOpen(false)} />
      <NewTemplateWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={() => setIsWizardOpen(false)}
      />
    </div>
  );
}
