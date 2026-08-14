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
  Image as ImageIcon,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Lock,
  Unlock,
  Layers
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
    setSelectedElementId,
    zoom,
    setZoom,
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
    toggleLock,
    toggleVisibility,
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

  const getElementIcon = (type: string) => {
    switch (type) {
      case 'text':
        return <Type size={13} color="var(--accent-blue)" />;
      case 'price':
        return <DollarSign size={13} color="#ef4444" />;
      case 'barcode':
        return <Barcode size={13} color="var(--accent-cyan)" />;
      case 'qrcode':
        return <QrCode size={13} color="var(--status-success)" />;
      case 'rectangle':
        return <Square size={13} color="var(--status-warning)" />;
      case 'line':
        return <Minus size={13} color="var(--accent-purple)" />;
      default:
        return <Layers size={13} />;
    }
  };

  const widthMm = document.dimensions?.widthMm || 100;
  const heightMm = document.dimensions?.heightMm || 30;
  const dpi = document.dimensions?.dpi || 203;

  return (
    <div className="editor-root-container">
      {/* =========================================================================
         TOOLBAR SUPERIOR ULTRA-LIMPA (56px FIXA)
         ========================================================================= */}
      <header className="editor-header-fixed">
        {/* Lado Esquerdo: Navegação, Identificação e Estado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {onBackToDashboard && (
            <button className="btn" onClick={onBackToDashboard} style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}>
              <ChevronLeft size={14} />
              <span>Modelos</span>
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div className="brand-icon" style={{ width: '26px', height: '26px', borderRadius: '6px' }}>
              <Sparkles size={13} color="#ffffff" />
            </div>
            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              Witiquetas
            </span>
          </div>

          <div style={{ width: '1px', height: '18px', background: 'var(--border-color)' }} />

          {/* Dimensões da Etiqueta */}
          <div className="preview-dimension-badge" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
            {formatDimensionBR(widthMm)} × {formatDimensionBR(heightMm)} ({dpi} DPI)
          </div>

          {/* Indicador Discreto de Salvamento */}
          <div className="save-status-indicator">
            <div className={`save-status-dot ${isDirty ? 'unsaved' : 'saved'}`} />
            <span style={{ fontSize: '0.72rem', color: isDirty ? 'var(--status-warning)' : 'var(--status-success)' }}>
              {isDirty ? 'Alterações não salvas' : 'Salvo'}
            </span>
          </div>
        </div>

        {/* Lado Direito: Ações Globais Essenciais (Desfazer, Zoom, Dados, Tema, Imprimir) */}
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

          <div style={{ width: '1px', height: '18px', background: 'var(--border-color)' }} />

          {/* Controles de Zoom */}
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

          <div style={{ width: '1px', height: '18px', background: 'var(--border-color)' }} />

          {/* Alternador Discreto de Dados: Exemplo / ERP */}
          <button
            className={`btn ${showPreviewData ? 'btn-primary' : ''}`}
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
            onClick={() => setShowPreviewData(!showPreviewData)}
            title="Alternar dados comerciais de teste do ERP"
          >
            {showPreviewData ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>Dados ERP</span>
          </button>

          {/* Alternância de Tema */}
          {onToggleTheme && (
            <button className="btn-theme-toggle" onClick={onToggleTheme} title="Alternar Modo Escuro / Claro">
              {theme === 'dark' ? <Sun size={15} color="#f59e0b" /> : <Moon size={15} color="#3b82f6" />}
            </button>
          )}

          {/* Botão de Ação Primária: Imprimir */}
          <button
            className="btn btn-primary"
            onClick={() => setIsCompileOpen(true)}
            style={{ padding: '0.45rem 1.1rem', fontSize: '0.825rem' }}
          >
            <Printer size={15} />
            <span>Imprimir</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
         WORKSPACE PRINCIPAL
         ========================================================================= */}
      <div className="editor-workspace-row">
        {/* Painel Esquerdo: Biblioteca de Criação & Camadas */}
        <aside className={`editor-sidebar-left ${isLeftSidebarCollapsed ? 'collapsed' : ''}`}>
          {/* Header do Painel Esquerdo */}
          <div style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Elementos
            </span>
            <button className="btn" style={{ padding: '0.2rem', border: 'none' }} onClick={toggleLeftSidebar} title="Recolher Painel">
              <ChevronLeft size={14} />
            </button>
          </div>

          <div style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Botão Novo Formato */}
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', fontSize: '0.78rem', padding: '0.45rem' }}
              onClick={() => setIsWizardOpen(true)}
            >
              <Plus size={14} />
              <span>Novo Formato / Nicho</span>
            </button>

            {/* Paleta de Criação de Elementos (Item 161) */}
            <div>
              <label className="metric-label" style={{ marginBottom: '0.4rem' }}>Adicionar à Etiqueta</label>
              <div className="creation-palette-grid">
                <button className="creation-tool-btn" onClick={() => addElement('text')}>
                  <Type size={16} color="var(--accent-blue)" />
                  <span>Texto</span>
                </button>
                <button className="creation-tool-btn" onClick={() => addElement('price')}>
                  <DollarSign size={16} color="#ef4444" />
                  <span>Preço</span>
                </button>
                <button className="creation-tool-btn" onClick={() => addElement('barcode')}>
                  <Barcode size={16} color="var(--accent-cyan)" />
                  <span>Código Barras</span>
                </button>
                <button className="creation-tool-btn" onClick={() => addElement('qrcode')}>
                  <QrCode size={16} color="var(--status-success)" />
                  <span>QR Code</span>
                </button>
                <button className="creation-tool-btn" onClick={() => addElement('rectangle')}>
                  <Square size={16} color="var(--status-warning)" />
                  <span>Moldura</span>
                </button>
                <button className="creation-tool-btn" onClick={() => addElement('line')}>
                  <Minus size={16} color="var(--accent-purple)" />
                  <span>Linha</span>
                </button>
              </div>
            </div>

            {/* Lista de Camadas Compacta (Item 180, 182, 183) */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label className="metric-label">Camadas ({document.elements.length})</label>
              </div>

              <div className="layers-compact-list">
                {document.elements.map((el) => {
                  const isSelected = selectedElementIds.includes(el.id);
                  const hasFlag = el.locked || el.visible === false;

                  return (
                    <div
                      key={el.id}
                      className={`layer-compact-row ${isSelected ? 'active' : ''} ${hasFlag ? 'has-flag' : ''}`}
                      onClick={() => setSelectedElementId(el.id)}
                    >
                      <div className="layer-compact-left">
                        {getElementIcon(el.type)}
                        <span>{el.name || el.type.toUpperCase()}</span>
                      </div>

                      <div className="layer-compact-actions">
                        <button
                          className="btn"
                          style={{ padding: '0.15rem', border: 'none' }}
                          title={el.locked ? 'Desbloquear elemento' : 'Bloquear no canvas'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLock(el.id);
                          }}
                        >
                          {el.locked ? <Lock size={12} color="var(--status-warning)" /> : <Unlock size={12} color="var(--text-muted)" />}
                        </button>

                        <button
                          className="btn"
                          style={{ padding: '0.15rem', border: 'none' }}
                          title={el.visible !== false ? 'Ocultar elemento' : 'Exibir elemento'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleVisibility(el.id);
                          }}
                        >
                          {el.visible !== false ? <Eye size={12} color="var(--text-muted)" /> : <EyeOff size={12} color="var(--status-danger)" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* Botão de Expansão do Painel Esquerdo se Recolhido */}
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
            title="Expandir Biblioteca de Elementos"
          >
            <PanelLeftOpen size={16} color="var(--accent-blue)" />
          </button>
        )}

        {/* Canvas Central */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
          <CanvasArea />
        </main>

        {/* Botão de Expansão do Painel Direito se Recolhido */}
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

        {/* Painel Direito: Inspetor Contextual */}
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
