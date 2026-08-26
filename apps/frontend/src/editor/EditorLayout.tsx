import React, { useState, useEffect } from 'react';
import { useEditorStore, formatDimensionBR, isEditingTextInput } from './useEditorStore';
import CanvasArea from './CanvasArea';
import PropertyInspector from './PropertyInspector';
import NewTemplateWizard from './NewTemplateWizard';
import CompileModal from './CompileModal';
import ImportModal from './ImportModal';
import {
  Sparkles,
  Printer,
  Grid,
  FileUp,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  Maximize2,
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
  Layers,
  Save,
  AlertCircle,
  AlertTriangle,
  Loader2
} from 'lucide-react';

import { getTabSessionIdSync, resolveTabSessionId } from './sessionUtils.js';

export interface EditorLayoutProps {
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
    fitToScreen,
    showPreviewData,
    setShowPreviewData,
    showGhostConditionalElements,
    toggleShowGhostConditionalElements,
    previewScenario,
    setPreviewScenario,
    isDirty,
    saveStatus,
    saveDocumentToBackend,
    conflictInfo,
    currentTemplateId,
    resolveConflictSaveAsCopy,
    resolveConflictReloadRemote,
    resolveConflictContinueEditing,
    resolveDeletedSaveAsNew,
    snapToGrid,
    setSnapToGrid,
    showSafeArea,
    setShowSafeArea,
    showRulers,
    setShowRulers,
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
    toggleLock,
    toggleVisibility,
    isLeftSidebarCollapsed,
    isRightSidebarCollapsed,
    toggleLeftSidebar,
    toggleRightSidebar,
  } = useEditorStore();

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isCompileOpen, setIsCompileOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isUnsavedExitModalOpen, setIsUnsavedExitModalOpen] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [isDeletedModalOpen, setIsDeletedModalOpen] = useState(false);
  const [isReloadConfirmOpen, setIsReloadConfirmOpen] = useState(false);
  const [isSavingCopy, setIsSavingCopy] = useState(false);

  // Abrir modal de conflito automaticamente quando saveStatus alternar para conflict
  useEffect(() => {
    if (saveStatus === 'conflict') {
      setIsConflictModalOpen(true);
    }
  }, [saveStatus]);

  // Heartbeat de Presença de Edição (15s)
  useEffect(() => {
    if (!currentTemplateId) return;

    let isMounted = true;
    let intervalId: any = null;
    let currentSid = '';

    let browser = 'Browser';
    let os = 'Windows';
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      if (ua.includes('Firefox')) browser = 'Firefox';
      else if (ua.includes('Edg/')) browser = 'Edge';
      else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';
      else if (ua.includes('Chrome')) browser = 'Chrome';
      else if (ua.includes('Safari')) browser = 'Safari';

      if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
      else if (ua.includes('Linux')) os = 'Linux';
      else if (ua.includes('Windows')) os = 'Windows';
    }

    resolveTabSessionId().then((sessionInfo) => {
      if (!isMounted) return;
      currentSid = sessionInfo.sessionId;

      const userIdentifier = `${browser} • ${os} • Sessão ${currentSid.substring(0, 6).toUpperCase()}`;

      const runHeartbeat = () => {
        import('../services/templatesApi.js').then(({ templatesApi }) => {
          if (!isMounted) return;
          templatesApi.sendHeartbeat(currentTemplateId, {
            sessionId: currentSid,
            userIdentifier,
            os,
            browser,
          }).catch(() => { });
        });
      };

      runHeartbeat();
      intervalId = setInterval(runHeartbeat, 15000);
    });

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
      if (currentSid) {
        import('../services/templatesApi.js').then(({ templatesApi }) => {
          templatesApi.leavePresence(currentTemplateId, currentSid);
        });
      }
    };
  }, [currentTemplateId]);

  // Escuta de Atalhos Globais do Teclado (Isolamento Estrito com isEditingTextInput)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputActive = isEditingTextInput();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Se o usuário estiver digitando em um campo de texto, inputs têm prioridade absoluta
      if (isInputActive) {
        // Apenas Ctrl+S é permitido durante edição de campo
        if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          if (saveStatus === 'conflict') {
            setIsConflictModalOpen(true);
          } else if (saveStatus === 'deleted') {
            setIsDeletedModalOpen(true);
          } else {
            saveDocumentToBackend();
          }
        }
        return;
      }

      // Atalhos do Canvas quando nenhum input de texto estiver focado
      if (isCtrlOrCmd) {
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          if (saveStatus === 'conflict') {
            setIsConflictModalOpen(true);
          } else if (saveStatus === 'deleted') {
            setIsDeletedModalOpen(true);
          } else {
            saveDocumentToBackend();
          }
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          redo();
        } else if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          copySelection();
        } else if (e.key === 'x' || e.key === 'X') {
          e.preventDefault();
          cutSelection();
        } else if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          pasteSelection();
        } else if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          duplicateSelectedElements();
        } else if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          selectAll();
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          saveDocumentToBackend();
        }
      } else {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedElementIds.length > 0) {
            e.preventDefault();
            removeSelectedElements();
          }
        } else if (e.key === 'Escape') {
          clearSelection();
          setIsViewMenuOpen(false);
        } else if (
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown'
        ) {
          if (selectedElementIds.length > 0) {
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
    saveDocumentToBackend,
    selectedElementIds,
  ]);

  const handleBackClick = () => {
    if (isDirty) {
      setIsUnsavedExitModalOpen(true);
    } else {
      onBackToDashboard?.();
    }
  };

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

  const widthMm = Number(document?.dimensions?.widthMm) || 100;
  const heightMm = Number(document?.dimensions?.heightMm) || 30;
  const dpi = Number(document?.dimensions?.dpi) || 203;

  return (
    <div className="editor-root-container">
      {/* =========================================================================
         TOOLBAR SUPERIOR ULTRA-LIMPA (56px FIXA)
         ========================================================================= */}
      <header className="editor-header-fixed">
        {/* Lado Esquerdo: Navegação, Identificação e Estado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div className="brand-icon" style={{ width: '26px', height: '26px', borderRadius: '6px' }}>
              <Sparkles size={13} color="#ffffff" />
            </div>
            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              Witiquetas
            </span>
          </div>

          {onBackToDashboard && (
            <button className="btn" onClick={handleBackClick} style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}>
              <ChevronLeft size={14} />
              <span>Modelos</span>
            </button>
          )}

          <div style={{ width: '1px', height: '18px', background: 'var(--border-color)' }} />

          {/* Dimensões da Etiqueta */}
          <div className="preview-dimension-badge" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
            {formatDimensionBR(widthMm)} × {formatDimensionBR(heightMm)} ({dpi} DPI)
          </div>

          {/* Tag de Formato Original / Round-Trip (Item 321) */}
          {document?.sourceFile && (
            <div
              className="preview-dimension-badge"
              style={{
                fontSize: '0.7rem',
                padding: '0.15rem 0.45rem',
                background: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--accent-blue)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
              title="Este modelo foi importado e suporta round-trip com preservação total de comandos e comentários"
            >
              {document.sourceFile.format.toUpperCase()} (Round-Trip)
            </div>
          )}

          {/* Indicador e Ação Explícita de Salvamento */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div
              className="save-status-indicator"
              style={{
                cursor: saveStatus === 'conflict' || saveStatus === 'deleted' || saveStatus === 'error' ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (saveStatus === 'conflict') setIsConflictModalOpen(true);
                else if (saveStatus === 'deleted') setIsDeletedModalOpen(true);
                else if (saveStatus === 'error') saveDocumentToBackend();
              }}
              title={
                saveStatus === 'conflict'
                  ? 'Conflito de versão detectado. Clique para ver detalhes e opções de resolução.'
                  : saveStatus === 'deleted'
                    ? 'Este modelo foi removido no servidor. Clique para opções de recuperação.'
                    : saveStatus === 'error'
                      ? 'Erro ao salvar. Clique para tentar novamente.'
                      : undefined
              }
            >
              <div
                className={`save-status-dot ${saveStatus === 'unsaved'
                    ? 'unsaved'
                    : saveStatus === 'error' || saveStatus === 'conflict' || saveStatus === 'deleted'
                      ? 'unsaved'
                      : 'saved'
                  }`}
              />
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: saveStatus === 'conflict' || saveStatus === 'deleted' ? 700 : 400,
                  color:
                    saveStatus === 'unsaved'
                      ? 'var(--status-warning)'
                      : saveStatus === 'error' || saveStatus === 'conflict' || saveStatus === 'deleted'
                        ? 'var(--status-danger)'
                        : 'var(--status-success)',
                }}
              >
                {saveStatus === 'saving'
                  ? 'Salvando...'
                  : saveStatus === 'unsaved'
                    ? 'Não salvo'
                    : saveStatus === 'error'
                      ? 'Erro ao salvar'
                      : saveStatus === 'conflict'
                        ? 'Conflito de versão'
                        : saveStatus === 'deleted'
                          ? 'Modelo removido'
                          : 'Salvo'}
              </span>
            </div>

            {saveStatus === 'unsaved' && (
              <button
                className="btn"
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  background: 'var(--accent-blue)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
                onClick={() => saveDocumentToBackend()}
                title="Salvar modelo no servidor (Ctrl+S)"
              >
                <Save size={12} />
                <span>Salvar</span>
              </button>
            )}

            {saveStatus === 'conflict' && (
              <button
                className="btn"
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  background: 'var(--status-warning)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
                onClick={() => setIsConflictModalOpen(true)}
                title="Ver opções de resolução do conflito"
              >
                <AlertTriangle size={12} />
                <span>Resolver</span>
              </button>
            )}
          </div>
        </div>

        {/* Lado Direito: Ações Globais Essenciais (Desfazer, Zoom, Guias [▦], Dados, Tema, Imprimir) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Seletor 'Visualizar como' (Itens 5 e 6 da especificacao UX) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <select
              className="inspector-select"
              style={{
                padding: '0.2rem 0.5rem',
                fontSize: '0.72rem',
                height: '28px',
                background: 'var(--bg-card)',
                minWidth: '110px',
                fontWeight: 600,
              }}
              value={previewScenario}
              onChange={(e) => setPreviewScenario(e.target.value as any)}
              title="Simula diferentes condições dos dados para conferir como a etiqueta será impressa."
            >
              <option value="normal">Visualizar como: Normal</option>
              <option value="promo">Visualizar como: Promoção</option>
            </select>
          </div>

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
            <button
              className="btn"
              style={{ padding: '0.35rem 0.55rem', fontSize: '0.72rem', fontWeight: 600 }}
              onClick={() => fitToScreen()}
              title="Ajustar etiqueta à área disponível da tela"
            >
              <span>Ajustar</span>
            </button>
          </div>

          <div style={{ width: '1px', height: '18px', background: 'var(--border-color)' }} />

          {/* Menu Suspenso de Visualização & Guias [▦] (Item 222, 286) */}
          <div style={{ position: 'relative' }}>
            <button
              className={`btn ${isViewMenuOpen ? 'btn-primary' : ''}`}
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
              title="Opções de Visualização, Grade e Margens"
            >
              <Grid size={13} />
              <span>Guias</span>
            </button>

            {isViewMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '6px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '0.75rem 0.85rem',
                  boxShadow: 'var(--shadow-elevated)',
                  zIndex: 50,
                  minWidth: '240px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.55rem',
                }}
              >
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Visualização & Guias
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', cursor: 'pointer' }} title="Exibe de forma transparente os elementos ocultos pelas Regras de Exibição para permitir sua edição. Eles não serão impressos neste cenário.">
                  <input
                    type="checkbox"
                    checked={snapToGrid}
                    onChange={(e) => setSnapToGrid(e.target.checked)}
                  />
                  <span>Grade Magnética (1 mm)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showSafeArea}
                    onChange={(e) => setShowSafeArea(e.target.checked)}
                  />
                  <span>Margem Segura (1.0 mm)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showRulers}
                    onChange={(e) => setShowRulers(e.target.checked)}
                  />
                  <span>Réguas em Milímetros</span>
                </label>

                <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.2rem 0' }} />

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showGhostConditionalElements}
                    onChange={toggleShowGhostConditionalElements}
                  />
                  <span>Mostrar elementos ocultos</span>
                </label>
              </div>
            )}
          </div>

          {/* Alternador Discreto de Dados: Exemplo / ERP */}
          <button
            className={`btn ${showPreviewData ? 'btn-primary' : ''}`}
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
            onClick={() => setShowPreviewData(!showPreviewData)}
            title="Alternar dados de teste da integração"
          >
            {showPreviewData ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>Dados de Integração</span>
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
         WORKSPACE PRINCIPAL (3 COLUNAS: ESQUERDA 250px | CANVAS FLEX:1 | DIREITA 290px)
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
            {/* Botões de Ação do Topo da Barra Lateral */}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.78rem', padding: '0.45rem' }}
                onClick={() => setIsWizardOpen(true)}
              >
                <Plus size={14} />
                <span>Novo Formato</span>
              </button>

              <button
                className="btn"
                style={{ justifyContent: 'center', fontSize: '0.78rem', padding: '0.45rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                onClick={() => setIsImportModalOpen(true)}
                title="Importar modelo existente (PPLB, ZPL, Legado)"
              >
                <FileUp size={14} color="var(--accent-blue)" />
                <span>Importar</span>
              </button>
            </div>

            {/* Paleta de Criação de Elementos (Grid 2 Colunas Aprovado) */}
            <div>
              <label className="metric-label" style={{ marginBottom: '0.4rem' }}>Adicionar à Etiqueta</label>
              <div className="creation-palette-grid">
                <button className="creation-tool-btn" onClick={() => addElement('text')}>
                  <Type size={16} color="var(--accent-blue)" />
                  <span>Texto</span>
                </button>
                <button className="creation-tool-btn" onClick={() => addElement('price')}>
                  <DollarSign size={16} color="#dc2626" />
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

            {/* Lista de Camadas Compacta */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label className="metric-label">Camadas ({(document?.elements || []).length})</label>
              </div>

              <div className="layers-compact-list">
                {(document?.elements || []).map((el) => {
                  if (!el) return null;
                  const isSelected = selectedElementIds.includes(el.id);
                  const hasFlag = el.locked || el.visible === false;
                  const hasCondition = !!el.visibilityRule;

                  return (
                    <div
                      key={el.id}
                      className={`layer-compact-row ${isSelected ? 'active' : ''} ${hasFlag ? 'has-flag' : ''}`}
                      onClick={() => setSelectedElementId(el.id)}
                    >
                      <div className="layer-compact-left">
                        {getElementIcon(el.type)}
                        <span>{el.name || el.type.toUpperCase()}</span>
                        {hasCondition && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 800,
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#ef4444',
                              padding: '0.05rem 0.25rem',
                              borderRadius: '3px',
                              marginLeft: '0.2rem',
                            }}
                            title={`Condição: ${el.visibilityRule!.field.split('.').pop()?.toUpperCase()} ${el.visibilityRule!.operator} ${el.visibilityRule!.value}`}
                          >
                            fx
                          </span>
                        )}
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

      {/* Modal de Confirmação de Saída com Alterações Não Salvas (Item 227) */}
      {isUnsavedExitModalOpen && (
        <div className="wizard-modal-overlay">
          <div className="wizard-modal-content" style={{ maxWidth: '420px', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Alterações não salvas
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Você possui alterações que ainda não foram salvas neste modelo. Deseja salvar antes de retornar aos modelos?
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setIsUnsavedExitModalOpen(false)}>
                Continuar Editando
              </button>
              <button
                className="btn"
                style={{ color: 'var(--status-danger)' }}
                onClick={() => {
                  setIsUnsavedExitModalOpen(false);
                  onBackToDashboard?.();
                }}
              >
                Descartar e Sair
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await saveDocumentToBackend();
                  setIsUnsavedExitModalOpen(false);
                  onBackToDashboard?.();
                }}
              >
                Salvar e Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Conflito de Versão */}
      {isConflictModalOpen && !isReloadConfirmOpen && (
        <div className="wizard-modal-overlay">
          <div className="wizard-modal-content" style={{ maxWidth: '480px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <AlertTriangle size={20} color="var(--status-warning)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Conflito de Versão Detectado
              </h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Este modelo foi alterado em outro local enquanto você o editava. A versão disponível no servidor é mais recente que a versão usada para iniciar esta edição.
            </p>
            <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--status-success)', marginBottom: '1.25rem' }}>
              ✓ Suas alterações locais foram totalmente preservadas.
            </p>

            {conflictInfo && (
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                <div><strong>Versão local em edição:</strong> v{conflictInfo.expectedVersion || 1}</div>
                <div><strong>Versão no servidor:</strong> v{conflictInfo.currentVersion || 2}</div>
                {conflictInfo.updatedAt && (
                  <div><strong>Data da alteração remota:</strong> {new Date(conflictInfo.updatedAt).toLocaleString('pt-BR')}</div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  if (isDirty) {
                    setIsReloadConfirmOpen(true);
                  } else {
                    await resolveConflictReloadRemote();
                    setIsConflictModalOpen(false);
                  }
                }}
              >
                Carregar versão mais recente do servidor
              </button>

              <button
                className="btn"
                style={{ background: 'var(--accent-blue)', color: '#ffffff' }}
                onClick={async () => {
                  const ok = await resolveConflictSaveAsCopy();
                  if (ok) setIsConflictModalOpen(false);
                }}
              >
                Salvar minhas alterações como cópia
              </button>

              <button
                className="btn"
                onClick={() => {
                  resolveConflictContinueEditing();
                  setIsConflictModalOpen(false);
                }}
              >
                Continuar editando localmente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Sobrescrita do Trabalho Local ao Carregar Versão Remota */}
      {isReloadConfirmOpen && !isConflictModalOpen && (
        <div className="wizard-modal-overlay" style={{ zIndex: 1100 }}>
          <div className="wizard-modal-content" style={{ maxWidth: '400px', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Descartar alterações locais?
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Você possui alterações locais não salvas. Ao carregar a versão mais recente do servidor, o trabalho local atual será descartado e substituído pelo modelo remoto.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setIsReloadConfirmOpen(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--status-danger)', borderColor: 'var(--status-danger)' }}
                onClick={async () => {
                  setIsReloadConfirmOpen(false);
                  await resolveConflictReloadRemote();
                  setIsConflictModalOpen(false);
                }}
              >
                Sim, descartar e recarregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Modelo Removido no Servidor */}
      {(isDeletedModalOpen || saveStatus === 'deleted') && (
        <div className="wizard-modal-overlay">
          <div className="wizard-modal-content" style={{ maxWidth: '440px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <AlertTriangle size={20} color="var(--status-danger)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Modelo Não Encontrado no Servidor
              </h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Este modelo não existe mais no servidor (pode ter sido excluído por outro usuário).
            </p>
            <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--status-success)', marginBottom: '1.25rem' }}>
              ✓ Suas alterações locais continuam disponíveis no canvas.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={() => {
                  setIsDeletedModalOpen(false);
                  onBackToDashboard?.();
                }}
              >
                Voltar para Meus Modelos
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const ok = await resolveDeletedSaveAsNew();
                  if (ok) setIsDeletedModalOpen(false);
                }}
              >
                Salvar como novo modelo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modais */}
      <NewTemplateWizard isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} />
      <CompileModal isOpen={isCompileOpen} onClose={() => setIsCompileOpen(false)} />
      <ImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} />
    </div>
  );
}
