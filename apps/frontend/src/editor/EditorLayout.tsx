import React, { useState, useEffect } from 'react';
import { useEditorStore, formatDimensionBR } from './useEditorStore';
import CanvasArea from './CanvasArea';
import PropertyInspector from './PropertyInspector';
import NewTemplateWizard from './NewTemplateWizard';
import CompileModal from './CompileModal';
import {
  Sparkles,
  Printer,
  Grid,
  Eye,
  EyeOff,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  Type,
  DollarSign,
  Barcode,
  QrCode,
  Square,
  Minus,
  Save,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus
} from 'lucide-react';

interface EditorLayoutProps {
  onBackToDashboard?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export default function EditorLayout({
  onBackToDashboard,
  theme = 'dark',
  onToggleTheme,
}: EditorLayoutProps) {
  const {
    document,
    selectedElementIds,
    zoom,
    setZoom,
    snapToGrid,
    setSnapToGrid,
    showRulers,
    setShowRulers,
    showSafeArea,
    setShowSafeArea,
    showPreviewData,
    setShowPreviewData,
    isDirty,
    undo,
    redo,
    addElement,
    selectAll,
    clearSelection,
    duplicateSelectedElements,
    removeSelectedElements,
    copySelection,
    cutSelection,
    pasteSelection,
    nudgeElements,
    markSaved,
    isLeftSidebarCollapsed,
    isRightSidebarCollapsed,
    toggleLeftSidebar,
    toggleRightSidebar,
  } = useEditorStore();

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isCompileOpen, setIsCompileOpen] = useState(false);

  // Escuta de Atalhos Globais do Teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar se o usuário estiver digitando em um input de texto
      const activeTag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      const isInputActive = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd) {
        if (e.key === 'z' || e.key === 'Z') {
          if (!isInputActive) {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          if (!isInputActive) {
            e.preventDefault();
            redo();
          }
        } else if (e.key === 'c' || e.key === 'C') {
          if (!isInputActive) {
            e.preventDefault();
            copySelection();
          }
        } else if (e.key === 'x' || e.key === 'X') {
          if (!isInputActive) {
            e.preventDefault();
            cutSelection();
          }
        } else if (e.key === 'v' || e.key === 'V') {
          if (!isInputActive) {
            e.preventDefault();
            pasteSelection();
          }
        } else if (e.key === 'd' || e.key === 'D') {
          if (!isInputActive) {
            e.preventDefault();
            duplicateSelectedElements();
          }
        } else if (e.key === 'a' || e.key === 'A') {
          if (!isInputActive) {
            e.preventDefault();
            selectAll();
          }
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          markSaved();
        }
      } else {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (!isInputActive && selectedElementIds.length > 0) {
            e.preventDefault();
            removeSelectedElements();
          }
        } else if (e.key === 'Escape') {
          if (!isInputActive) {
            clearSelection();
          }
        } else if (
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown'
        ) {
          if (!isInputActive && selectedElementIds.length > 0) {
            e.preventDefault();
            const step = e.shiftKey ? 2.0 : 0.5;
            if (e.key === 'ArrowLeft') nudgeElements(-step, 0);
            if (e.key === 'ArrowRight') nudgeElements(step, 0);
            if (e.key === 'ArrowUp') nudgeElements(0, -step);
            if (e.key === 'ArrowDown') nudgeElements(0, step);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    undo,
    redo,
    copySelection,
    cutSelection,
    pasteSelection,
    duplicateSelectedElements,
    selectAll,
    clearSelection,
    removeSelectedElements,
    nudgeElements,
    markSaved,
    selectedElementIds,
  ]);

  return (
    <div className="editor-root-container">
      {/* =========================================================================
         TOOLBAR SUPERIOR (56px FIXA)
         ========================================================================= */}
      <header className="editor-header-fixed">
        {/* Lado Esquerdo: Navegação & Título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {onBackToDashboard && (
            <button className="btn" onClick={onBackToDashboard} style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}>
              <ChevronLeft size={14} />
              <span>Modelos</span>
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className="brand-icon" style={{ width: '28px', height: '28px', borderRadius: '6px' }}>
              <Sparkles size={14} color="#ffffff" />
            </div>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              Witiquetas
            </span>
          </div>

          <div style={{ width: '1px', height: '20px', background: 'var(--border-color)', margin: '0 0.2rem' }} />

          {/* Dimensões da Etiqueta */}
          <div className="preview-dimension-badge" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
            {formatDimensionBR(document.dimensions.widthMm)} × {formatDimensionBR(document.dimensions.heightMm)} ({document.dimensions.dpi} DPI)
          </div>

          {/* Indicador de Salvamento */}
          <div className="save-status-indicator" style={{ marginLeft: '0.3rem' }}>
            <div className={`save-status-dot ${isDirty ? 'unsaved' : 'saved'}`} />
            <span style={{ fontSize: '0.72rem', color: isDirty ? 'var(--status-warning)' : 'var(--status-success)' }}>
              {isDirty ? 'Alterações não salvas' : 'Salvo'}
            </span>
          </div>
        </div>

        {/* Centro: Ferramentas de Adição de Elementos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button className="btn" onClick={() => addElement('text')} title="Adicionar Texto">
            <Type size={14} color="var(--accent-blue)" />
            <span>Texto</span>
          </button>
          <button className="btn" onClick={() => addElement('price')} title="Adicionar Preço">
            <DollarSign size={14} color="#ef4444" />
            <span>Preço</span>
          </button>
          <button className="btn" onClick={() => addElement('barcode')} title="Adicionar Código de Barras">
            <Barcode size={14} color="var(--accent-cyan)" />
            <span>Barras</span>
          </button>
          <button className="btn" onClick={() => addElement('qrcode')} title="Adicionar QR Code">
            <QrCode size={14} color="var(--status-success)" />
            <span>QR Code</span>
          </button>
          <button className="btn" onClick={() => addElement('rectangle')} title="Adicionar Retângulo / Moldura">
            <Square size={14} color="var(--status-warning)" />
            <span>Moldura</span>
          </button>
          <button className="btn" onClick={() => addElement('line')} title="Adicionar Linha Divisória">
            <Minus size={14} color="var(--accent-purple)" />
            <span>Linha</span>
          </button>
        </div>

        {/* Lado Direito: Visualização, Zoom, Tema e Impressão */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Desfazer / Refazer */}
          <div style={{ display: 'flex', gap: '0.2rem' }}>
            <button className="btn" style={{ padding: '0.35rem' }} onClick={undo} title="Desfazer (Ctrl+Z)">
              <Undo2 size={14} />
            </button>
            <button className="btn" style={{ padding: '0.35rem' }} onClick={redo} title="Refazer (Ctrl+Y)">
              <Redo2 size={14} />
            </button>
          </div>

          <div style={{ width: '1px', height: '20px', background: 'var(--border-color)' }} />

          {/* Toggles de Visualização */}
          <button
            className={`btn ${snapToGrid ? 'btn-primary' : ''}`}
            style={{ padding: '0.35rem' }}
            onClick={() => setSnapToGrid(!snapToGrid)}
            title={snapToGrid ? 'Grade Ativada' : 'Ativar Grade'}
          >
            <Grid size={14} />
          </button>

          <button
            className={`btn ${showSafeArea ? 'btn-primary' : ''}`}
            style={{ padding: '0.35rem' }}
            onClick={() => setShowSafeArea(!showSafeArea)}
            title="Margem Segura de Impressão (1.5mm)"
          >
            <ShieldAlert size={14} />
          </button>

          <button
            className={`btn ${showPreviewData ? 'btn-primary' : ''}`}
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
            onClick={() => setShowPreviewData(!showPreviewData)}
            title="Alternar dados de exemplo do ERP"
          >
            {showPreviewData ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>Preview ERP</span>
          </button>

          <div style={{ width: '1px', height: '20px', background: 'var(--border-color)' }} />

          {/* Zoom: - / 100% / + */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            <button className="btn" style={{ padding: '0.35rem' }} onClick={() => setZoom(zoom - 0.15)} title="Diminuir Zoom">
              <ZoomOut size={14} />
            </button>
            <button
              className="btn"
              style={{ padding: '0.35rem 0.55rem', fontSize: '0.72rem', fontWeight: 700 }}
              onClick={() => setZoom(1.0)}
              title="Restaurar Zoom para 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button className="btn" style={{ padding: '0.35rem' }} onClick={() => setZoom(zoom + 0.15)} title="Aumentar Zoom">
              <ZoomIn size={14} />
            </button>
          </div>

          <div style={{ width: '1px', height: '20px', background: 'var(--border-color)' }} />

          {/* Alternância de Tema */}
          {onToggleTheme && (
            <button className="btn-theme-toggle" onClick={onToggleTheme} title="Alternar Modo Escuro / Claro">
              {theme === 'dark' ? <Sun size={15} color="#f59e0b" /> : <Moon size={15} color="#3b82f6" />}
            </button>
          )}

          {/* Novo Modelo via Nicho */}
          <button className="btn" onClick={() => setIsWizardOpen(true)} style={{ fontSize: '0.75rem' }}>
            <Plus size={14} />
            <span>Novo Formato</span>
          </button>

          {/* Botão de Ação Primária: Imprimir */}
          <button
            className="btn btn-primary"
            onClick={() => setIsCompileOpen(true)}
            style={{ padding: '0.45rem 1rem', fontSize: '0.825rem' }}
          >
            <Printer size={15} />
            <span>Imprimir</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
         WORKSPACE (COLUNAS LATERAIS CONGELADAS & CANVAS CENTRAL)
         ========================================================================= */}
      <div className="editor-workspace-row">
        {/* Painel Esquerdo: Ferramentas Rápidas e Modelos Recentes */}
        <aside className={`editor-sidebar-left ${isLeftSidebarCollapsed ? 'collapsed' : ''}`}>
          <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              BIBLIOTECA & FERRAMENTAS
            </span>
            <button className="btn" style={{ padding: '0.2rem', border: 'none' }} onClick={toggleLeftSidebar} title="Recolher Painel">
              <ChevronLeft size={14} />
            </button>
          </div>

          <div style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setIsWizardOpen(true)}>
              <Plus size={14} />
              <span>Novo Modelo por Nicho</span>
            </button>

            <div style={{ marginTop: '0.5rem' }}>
              <label className="metric-label">Dimensões da Etiqueta</label>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {document.title}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Resolução: {document.dimensions.dpi} DPI (~8 dots/mm)
              </div>
            </div>

            <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
              <label className="metric-label">Atalhos de Produtividade</label>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div><kbd style={{ background: 'var(--bg-input)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>Ctrl+D</kbd> Duplicar com offset</div>
                <div><kbd style={{ background: 'var(--bg-input)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>Ctrl+C / V</kbd> Copiar e Colar</div>
                <div><kbd style={{ background: 'var(--bg-input)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>Shift + Setas</kbd> Nudge de precisão (2mm)</div>
                <div><kbd style={{ background: 'var(--bg-input)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>Arrastar no Vazio</kbd> Seleção múltipla</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Botão Flutuante de Abrir Painel Esquerdo se Recolhido */}
        {isLeftSidebarCollapsed && (
          <button
            className="btn"
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              zIndex: 25,
              padding: '0.4rem',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-elevated)',
            }}
            onClick={toggleLeftSidebar}
            title="Expandir Painel Esquerdo"
          >
            <PanelLeftOpen size={16} color="var(--accent-blue)" />
          </button>
        )}

        {/* Canvas Central */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
          <CanvasArea />
        </main>

        {/* Botão Flutuante de Abrir Painel Direito se Recolhido */}
        {isRightSidebarCollapsed && (
          <button
            className="btn"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 25,
              padding: '0.4rem',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-elevated)',
            }}
            onClick={toggleRightSidebar}
            title="Expandir Inspetor de Propriedades"
          >
            <PanelRightOpen size={16} color="var(--accent-blue)" />
          </button>
        )}

        {/* Painel Direito: Inspetor de Propriedades e Camadas */}
        <aside className={`editor-sidebar-right ${isRightSidebarCollapsed ? 'collapsed' : ''}`}>
          <PropertyInspector />
        </aside>
      </div>

      {/* Modais */}
      <NewTemplateWizard isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} />
      <CompileModal isOpen={isCompileOpen} onClose={() => setIsCompileOpen(false)} />
    </div>
  );
}
