import React, { useState, useEffect, useMemo } from 'react';
import { useEditorStore, formatDimensionBR } from './useEditorStore';
import { CANONICAL_FIELDS } from '@witiquetas/label-schema';
import { CURATED_FONTS, getFontCompatibility, CuratedFont } from './fontsCatalog';
import { QRCodeLibraryItemDTO } from '@witiquetas/contracts';
import {
  Trash2,
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  BringToFront,
  SendToBack,
  ChevronDown,
  ChevronRight,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Search,
  Star,
  Plus,
  BookmarkPlus,
  AlertTriangle,
  Type,
  DollarSign,
  Barcode,
  QrCode,
  Square,
  Minus,
  Sparkles,
  Layers,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

export default function PropertyInspector() {
  const {
    document,
    selectedElementIds,
    setSelectedElementId,
    updateElement,
    updateSelectedElements,
    removeElement,
    removeSelectedElements,
    duplicateSelectedElements,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    toggleLock,
    toggleVisibility,
    renameElement,
    alignElements,
    distributeElements,
    selectedPrinter,
    qrCodeLibrary,
    setQRCodeLibrary,
    addQRCodeToLibrary,
  } = useEditorStore();

  // Estados dos Accordions
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    layers: true,
    content: true,
    typography: true,
    dimensions: true,
    advanced: false,
    qrLibrary: false,
  });

  // Filtros do Seletor de Fontes
  const [onlyCompatibleFonts, setOnlyCompatibleFonts] = useState(true);
  const [fontSearch, setFontSearch] = useState('');

  // Estados da Biblioteca de QR Code
  const [qrSearch, setQrSearch] = useState('');
  const [isSavingQrModalOpen, setIsSavingQrModalOpen] = useState(false);
  const [newQrName, setNewQrName] = useState('');

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Carregar biblioteca de QR Codes do backend
  useEffect(() => {
    fetch('/api/qrcodes')
      .then((r) => r.json())
      .then((data) => {
        if (data.items) setQRCodeLibrary(data.items);
      })
      .catch(() => {
        // Fallback local se backend offline
      });
  }, [setQRCodeLibrary]);

  const selectedElements = useMemo(() => {
    return document.elements.filter((el) => selectedElementIds.includes(el.id));
  }, [document.elements, selectedElementIds]);

  const primarySelected = selectedElements.length > 0 ? selectedElements[0] : null;

  // Filtragem de Fontes Curadas
  const filteredFonts = useMemo(() => {
    return CURATED_FONTS.filter((f) => {
      if (fontSearch.trim()) {
        const term = fontSearch.toLowerCase();
        if (!f.family.toLowerCase().includes(term) && !f.description.toLowerCase().includes(term)) {
          return false;
        }
      }
      if (onlyCompatibleFonts) {
        const compat = getFontCompatibility(f.family, selectedPrinter);
        return compat.status === 'NATIVE' || compat.status === 'COMPATIBLE';
      }
      return true;
    });
  }, [fontSearch, onlyCompatibleFonts, selectedPrinter]);

  // Filtragem da Biblioteca de QR Codes
  const filteredQrCodes = useMemo(() => {
    if (!qrSearch.trim()) return qrCodeLibrary;
    const term = qrSearch.toLowerCase();
    return qrCodeLibrary.filter(
      (qr) => qr.name.toLowerCase().includes(term) || qr.url.toLowerCase().includes(term)
    );
  }, [qrCodeLibrary, qrSearch]);

  // Salvar QR Code Atual na Biblioteca
  const handleSaveCurrentQrToLibrary = async () => {
    if (!primarySelected || primarySelected.type !== 'qrcode' || !newQrName.trim()) return;

    try {
      const res = await fetch('/api/qrcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newQrName.trim(),
          url: (primarySelected as any).value,
          favorite: true,
        }),
      });
      const newItem = await res.json();
      if (res.ok) {
        addQRCodeToLibrary(newItem);
        setIsSavingQrModalOpen(false);
        setNewQrName('');
      }
    } catch {
      // Fallback local
      const localItem: QRCodeLibraryItemDTO = {
        id: `qr-${Date.now()}`,
        companyId: 'comp-matriz-01',
        name: newQrName.trim(),
        url: (primarySelected as any).value,
        favorite: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      addQRCodeToLibrary(localItem);
      setIsSavingQrModalOpen(false);
      setNewQrName('');
    }
  };

  // Helper de ícone por tipo
  const getElementIcon = (type: string) => {
    switch (type) {
      case 'text':
        return <Type size={14} color="var(--accent-blue)" />;
      case 'price':
        return <DollarSign size={14} color="#ef4444" />;
      case 'barcode':
        return <Barcode size={14} color="var(--accent-cyan)" />;
      case 'qrcode':
        return <QrCode size={14} color="var(--status-success)" />;
      case 'rectangle':
        return <Square size={14} color="var(--status-warning)" />;
      case 'line':
        return <Minus size={14} color="var(--accent-purple)" />;
      default:
        return <Layers size={14} />;
    }
  };

  // Se nada selecionado
  if (!primarySelected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Accordion: Elementos em Uso */}
        <div className="inspector-accordion">
          <div className="inspector-accordion-header" onClick={() => toggleSection('layers')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Layers size={15} color="var(--accent-blue)" />
              <span>Elementos em Uso ({document.elements.length})</span>
            </span>
            {openSections.layers ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>

          {openSections.layers && (
            <div className="inspector-accordion-content" style={{ padding: '0.5rem 0.75rem' }}>
              <div className="layers-list">
                {document.elements.length === 0 ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
                    Nenhum elemento adicionado.
                  </p>
                ) : (
                  document.elements.map((el) => (
                    <div
                      key={el.id}
                      className="layer-item"
                      onClick={() => setSelectedElementId(el.id)}
                    >
                      <div className="layer-item-title">
                        {getElementIcon(el.type)}
                        <span>{el.name || `${el.type.toUpperCase()}`}</span>
                      </div>
                      <div className="layer-item-actions">
                        <button
                          className="btn"
                          style={{ padding: '0.2rem', border: 'none' }}
                          title={el.locked ? 'Desbloquear elemento' : 'Bloquear elemento'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLock(el.id);
                          }}
                        >
                          {el.locked ? <Lock size={12} color="var(--status-warning)" /> : <Unlock size={12} color="var(--text-muted)" />}
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '0.2rem', border: 'none' }}
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
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mensagem de Instrução */}
        <div style={{ padding: '2rem 1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          <Sparkles size={28} color="var(--accent-blue)" style={{ margin: '0 auto 0.75rem' }} />
          <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
            Nenhum elemento selecionado
          </p>
          <p style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
            Clique em qualquer elemento na etiqueta ou selecione uma camada acima para formatar fontes, preços, links ou dimensões.
          </p>
        </div>
      </div>
    );
  }

  // Se múltiplos elementos selecionados
  if (selectedElements.length > 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
            MÚLTIPLOS ELEMENTOS ({selectedElements.length})
          </span>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Ações de alinhamento e distribuição em conjunto
          </p>
        </div>

        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Toolbar de Alinhamento */}
          <div>
            <label className="metric-label">Alinhar Elementos</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginTop: '0.3rem' }}>
              <button className="btn" onClick={() => alignElements('left')} title="Alinhar à Esquerda">
                <AlignLeft size={14} /> Esq
              </button>
              <button className="btn" onClick={() => alignElements('center')} title="Centralizar Horizontalmente">
                <AlignCenter size={14} /> Centro H
              </button>
              <button className="btn" onClick={() => alignElements('right')} title="Alinhar à Direita">
                <AlignRight size={14} /> Dir
              </button>
              <button className="btn" onClick={() => alignElements('top')} title="Alinhar ao Topo">
                <ArrowUp size={14} /> Topo
              </button>
              <button className="btn" onClick={() => alignElements('middle')} title="Centralizar Verticalmente">
                <AlignJustify size={14} /> Centro V
              </button>
              <button className="btn" onClick={() => alignElements('bottom')} title="Alinhar à Base">
                <ArrowDown size={14} /> Base
              </button>
            </div>
          </div>

          {/* Distribuição */}
          <div>
            <label className="metric-label">Distribuir Espaçamento</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.3rem' }}>
              <button className="btn" onClick={() => distributeElements('horizontal')}>
                Distribuir Horiz.
              </button>
              <button className="btn" onClick={() => distributeElements('vertical')}>
                Distribuir Vert.
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={duplicateSelectedElements}>
              <Copy size={14} />
              <span>Duplicar ({selectedElements.length})</span>
            </button>
            <button className="btn" style={{ color: 'var(--status-danger)' }} onClick={removeSelectedElements}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // INSPECTOR DE ELEMENTO ÚNICO
  // =========================================================================
  const elem = primarySelected;
  const isTextLike = elem.type === 'text' || elem.type === 'price';
  const isQrCode = elem.type === 'qrcode';
  const isRectangle = elem.type === 'rectangle';
  const isBarcode = elem.type === 'barcode';

  // Preview tipográfico da fonte
  const fontSampleText = elem.type === 'text' && (elem as any).text ? (elem as any).text : 'Aa 123,99 R$';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {/* Header do Inspetor: Nome amigável e ações rápidas */}
      <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1, marginRight: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
            {getElementIcon(elem.type)}
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase' }}>
              {elem.type}
            </span>
          </div>
          <input
            type="text"
            className="inspector-input"
            style={{ fontWeight: 700, fontSize: '0.85rem', padding: '0.2rem 0.4rem' }}
            value={elem.name || ''}
            placeholder={`Nome do ${elem.type}`}
            onChange={(e) => renameElement(elem.id, e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button className="btn" style={{ padding: '0.35rem' }} title="Duplicar (Ctrl+D)" onClick={duplicateSelectedElements}>
            <Copy size={14} />
          </button>
          <button className="btn" style={{ padding: '0.35rem', color: 'var(--status-danger)' }} title="Excluir (Del)" onClick={() => removeElement(elem.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Accordion 1: Camadas & Elementos em Uso */}
      <div className="inspector-accordion">
        <div className="inspector-accordion-header" onClick={() => toggleSection('layers')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Layers size={14} color="var(--accent-blue)" />
            <span>Elementos em Uso ({document.elements.length})</span>
          </span>
          {openSections.layers ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </div>

        {openSections.layers && (
          <div className="inspector-accordion-content" style={{ padding: '0.4rem 0.75rem' }}>
            <div className="layers-list">
              {document.elements.map((item) => {
                const isActive = item.id === elem.id;
                return (
                  <div
                    key={item.id}
                    className={`layer-item ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedElementId(item.id)}
                  >
                    <div className="layer-item-title">
                      {getElementIcon(item.type)}
                      <span>{item.name || `${item.type.toUpperCase()}`}</span>
                    </div>
                    <div className="layer-item-actions">
                      <button
                        className="btn"
                        style={{ padding: '0.2rem', border: 'none' }}
                        title={item.locked ? 'Desbloquear' : 'Bloquear'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLock(item.id);
                        }}
                      >
                        {item.locked ? <Lock size={12} color="var(--status-warning)" /> : <Unlock size={12} color="var(--text-muted)" />}
                      </button>
                      <button
                        className="btn"
                        style={{ padding: '0.2rem', border: 'none' }}
                        title={item.visible !== false ? 'Ocultar' : 'Exibir'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleVisibility(item.id);
                        }}
                      >
                        {item.visible !== false ? <Eye size={12} color="var(--text-muted)" /> : <EyeOff size={12} color="var(--status-danger)" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Ações de Z-Index para o elemento selecionado */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.3rem', marginTop: '0.4rem' }}>
              <button className="btn" style={{ padding: '0.25rem', fontSize: '0.7rem', justifyContent: 'center' }} title="Trazer para Frente" onClick={() => bringToFront(elem.id)}>
                <BringToFront size={12} />
              </button>
              <button className="btn" style={{ padding: '0.25rem', fontSize: '0.7rem', justifyContent: 'center' }} title="Avançar uma Camada" onClick={() => bringForward(elem.id)}>
                <ArrowUp size={12} />
              </button>
              <button className="btn" style={{ padding: '0.25rem', fontSize: '0.7rem', justifyContent: 'center' }} title="Recuar uma Camada" onClick={() => sendBackward(elem.id)}>
                <ArrowDown size={12} />
              </button>
              <button className="btn" style={{ padding: '0.25rem', fontSize: '0.7rem', justifyContent: 'center' }} title="Enviar para Trás" onClick={() => sendToBack(elem.id)}>
                <SendToBack size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Accordion 2: Conteúdo & Vínculos ERP */}
      <div className="inspector-accordion">
        <div className="inspector-accordion-header" onClick={() => toggleSection('content')}>
          <span>▾ Conteúdo & Dados</span>
          {openSections.content ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </div>

        {openSections.content && (
          <div className="inspector-accordion-content">
            {/* Vínculo ERP */}
            {(elem.type === 'text' || elem.type === 'price' || elem.type === 'barcode' || elem.type === 'qrcode') && (
              <div>
                <label className="metric-label">Vínculo com Campo ERP / Produto</label>
                <select
                  className="inspector-select"
                  value={(elem as any).field || ''}
                  onChange={(e) => updateElement(elem.id, { field: e.target.value || undefined })}
                >
                  <option value="">-- Sem vínculo (Conteúdo Manual) --</option>
                  {CANONICAL_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label} ({f.key})
                    </option>
                  ))}
                </select>
                {(elem as any).field && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--status-success)', marginTop: '0.2rem', display: 'block', fontWeight: 600 }}>
                    ✓ O valor do ERP tem prioridade visual sobre o texto manual.
                  </span>
                )}
              </div>
            )}

            {/* Texto Manual */}
            {elem.type === 'text' && (
              <div>
                <label className="metric-label">Texto Manual</label>
                <input
                  type="text"
                  className="inspector-input"
                  placeholder="Digite o texto da etiqueta..."
                  value={(elem as any).text || ''}
                  onChange={(e) => updateElement(elem.id, { text: e.target.value })}
                />
              </div>
            )}

            {/* QR Code Link & Biblioteca */}
            {isQrCode && (
              <div>
                <label className="metric-label">Link do QR Code (URL)</label>
                <input
                  type="text"
                  className="inspector-input"
                  placeholder="Cole aqui o link para gerar o QR Code"
                  value={(elem as any).value || ''}
                  onChange={(e) => updateElement(elem.id, { value: e.target.value })}
                />

                {/* Alerta de tamanho mínimo para 203 DPI */}
                {elem.width < 12 && (
                  <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.6rem', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', color: '#fbbf24', fontSize: '0.72rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                    <span>Tamanho menor que 12 mm pode comprometer a leitura em 203 DPI.</span>
                  </div>
                )}

                {/* Ação: Salvar na Biblioteca */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem' }}>
                  <button
                    className="btn"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => setIsSavingQrModalOpen(!isSavingQrModalOpen)}
                  >
                    <BookmarkPlus size={14} color="var(--accent-blue)" />
                    <span>Salvar na Biblioteca</span>
                  </button>

                  <button
                    className="btn"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => toggleSection('qrLibrary')}
                  >
                    <QrCode size={14} />
                    <span>{openSections.qrLibrary ? 'Fechar Salvos' : 'QR Codes Salvos'}</span>
                  </button>
                </div>

                {/* Modal Discreto: Salvar na Biblioteca */}
                {isSavingQrModalOpen && (
                  <div style={{ marginTop: '0.6rem', padding: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-color-glow)', borderRadius: '8px' }}>
                    <label className="metric-label">Nome do QR Code *</label>
                    <input
                      type="text"
                      className="inspector-input"
                      placeholder="Ex: Clube de Compras, Instagram"
                      value={newQrName}
                      onChange={(e) => setNewQrName(e.target.value)}
                      style={{ marginBottom: '0.5rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                      <button className="btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setIsSavingQrModalOpen(false)}>
                        Cancelar
                      </button>
                      <button className="btn btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={handleSaveCurrentQrToLibrary} disabled={!newQrName.trim()}>
                        Salvar
                      </button>
                    </div>
                  </div>
                )}

                {/* Painel Recolhível de QR Codes Salvos */}
                {openSections.qrLibrary && (
                  <div style={{ marginTop: '0.75rem', padding: '0.6rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <div className="size-search-bar" style={{ padding: '0.3rem 0.5rem', marginBottom: '0.5rem' }}>
                      <Search size={14} color="var(--text-muted)" />
                      <input
                        type="text"
                        className="size-search-input"
                        placeholder="Procurar QR Code..."
                        value={qrSearch}
                        onChange={(e) => setQrSearch(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '140px', overflowY: 'auto' }}>
                      {filteredQrCodes.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            padding: '0.4rem 0.6rem',
                            borderRadius: '6px',
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.75rem',
                          }}
                          onClick={() => updateElement(elem.id, { value: item.url, name: item.name, qrLibraryId: item.id })}
                        >
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{item.url}</div>
                          </div>
                          {item.favorite && <Star size={12} color="#fbbf24" fill="#fbbf24" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Código de Barras */}
            {isBarcode && (
              <div>
                <label className="metric-label">Formato</label>
                <select
                  className="inspector-select"
                  value={(elem as any).format || 'EAN13'}
                  onChange={(e) => updateElement(elem.id, { format: e.target.value })}
                  style={{ marginBottom: '0.5rem' }}
                >
                  <option value="EAN13">EAN-13 (Comercial Padrão)</option>
                  <option value="CODE128">Code 128 (Alfanumérico)</option>
                  <option value="EAN8">EAN-8 (Compacto)</option>
                </select>
                <label className="metric-label">Valor Padrão</label>
                <input
                  type="text"
                  className="inspector-input"
                  value={(elem as any).value || ''}
                  onChange={(e) => updateElement(elem.id, { value: e.target.value })}
                />
              </div>
            )}

            {/* Retângulo */}
            {isRectangle && (
              <div>
                <label className="metric-label">Preenchimento</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <button
                    className={`btn ${(elem as any).fillColor === 'transparent' ? 'btn-primary' : ''}`}
                    style={{ flex: 1, padding: '0.35rem', fontSize: '0.75rem' }}
                    onClick={() => updateElement(elem.id, { fillColor: 'transparent' })}
                  >
                    Transparente (Moldura)
                  </button>
                  <input
                    type="color"
                    className="inspector-input"
                    style={{ width: '45px', height: '32px', padding: '2px' }}
                    value={(elem as any).fillColor === 'transparent' ? '#ffffff' : (elem as any).fillColor || '#000000'}
                    onChange={(e) => updateElement(elem.id, { fillColor: e.target.value })}
                  />
                </div>

                <div className="grid-2x2">
                  <div>
                    <label className="metric-label">Cor da Borda</label>
                    <input
                      type="color"
                      className="inspector-input"
                      style={{ height: '32px', padding: '2px' }}
                      value={(elem as any).strokeColor || '#000000'}
                      onChange={(e) => updateElement(elem.id, { strokeColor: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="metric-label">Espessura (px)</label>
                    <input
                      type="number"
                      className="inspector-input"
                      value={(elem as any).strokeWidth || 1}
                      onChange={(e) => updateElement(elem.id, { strokeWidth: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Accordion 3: Tipografia (Texto & Preço) */}
      {isTextLike && (
        <div className="inspector-accordion">
          <div className="inspector-accordion-header" onClick={() => toggleSection('typography')}>
            <span>▾ Tipografia & Formatação</span>
            {openSections.typography ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </div>

          {openSections.typography && (
            <div className="inspector-accordion-content">
              {/* Seletor Curado de Fontes */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label className="metric-label">Família da Fonte</label>
                  <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={onlyCompatibleFonts}
                      onChange={(e) => setOnlyCompatibleFonts(e.target.checked)}
                    />
                    <span>Somente compatíveis</span>
                  </label>
                </div>

                <select
                  className="inspector-select"
                  value={(elem as any).fontFamily || 'Roboto'}
                  onChange={(e) => updateElement(elem.id, { fontFamily: e.target.value })}
                  style={{ fontWeight: 600, fontSize: '0.85rem' }}
                >
                  {filteredFonts.map((f) => {
                    const compat = getFontCompatibility(f.family, selectedPrinter);
                    return (
                      <option key={f.family} value={f.family}>
                        {f.family} ({compat.label})
                      </option>
                    );
                  })}
                </select>

                {/* Preview Tipográfico */}
                <div style={{ marginTop: '0.4rem', padding: '0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '6px', fontFamily: (elem as any).fontFamily || 'Roboto', fontSize: '0.85rem', color: 'var(--text-primary)', textAlign: 'center' }}>
                  {fontSampleText}
                </div>
              </div>

              {/* Tamanho e Cor */}
              {elem.type === 'text' && (
                <div className="grid-2x2">
                  <div>
                    <label className="metric-label">Tamanho (pt)</label>
                    <input
                      type="number"
                      className="inspector-input"
                      value={(elem as any).fontSize || 12}
                      onChange={(e) => updateElement(elem.id, { fontSize: parseInt(e.target.value) || 8 })}
                    />
                  </div>
                  <div>
                    <label className="metric-label">Cor</label>
                    <input
                      type="color"
                      className="inspector-input"
                      style={{ height: '32px', padding: '2px' }}
                      value={(elem as any).color || '#000000'}
                      onChange={(e) => updateElement(elem.id, { color: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Controles de Formatação de Preço */}
              {elem.type === 'price' && (
                <div>
                  <div className="grid-2x2" style={{ marginBottom: '0.5rem' }}>
                    <div>
                      <label className="metric-label">Tamanho R$</label>
                      <input
                        type="number"
                        className="inspector-input"
                        value={(elem as any).currencyFontSize || 12}
                        onChange={(e) => updateElement(elem.id, { currencyFontSize: parseInt(e.target.value) || 10 })}
                      />
                    </div>
                    <div>
                      <label className="metric-label">Inteiro (99)</label>
                      <input
                        type="number"
                        className="inspector-input"
                        value={(elem as any).integerFontSize || 24}
                        onChange={(e) => updateElement(elem.id, { integerFontSize: parseInt(e.target.value) || 14 })}
                      />
                    </div>
                  </div>
                  <div className="grid-2x2">
                    <div>
                      <label className="metric-label">Centavos (,99)</label>
                      <input
                        type="number"
                        className="inspector-input"
                        value={(elem as any).fractionFontSize || 14}
                        onChange={(e) => updateElement(elem.id, { fractionFontSize: parseInt(e.target.value) || 10 })}
                      />
                    </div>
                    <div>
                      <label className="metric-label">Cor Preço</label>
                      <input
                        type="color"
                        className="inspector-input"
                        style={{ height: '32px', padding: '2px' }}
                        value={(elem as any).color || '#dc2626'}
                        onChange={(e) => updateElement(elem.id, { color: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Botões: Negrito, Itálico, Sublinhado */}
              <div>
                <label className="metric-label">Estilo do Texto</label>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <button
                    className={`btn ${(elem as any).fontWeight === 'bold' ? 'btn-primary' : ''}`}
                    style={{ flex: 1, padding: '0.35rem', justifyContent: 'center' }}
                    onClick={() => updateElement(elem.id, { fontWeight: (elem as any).fontWeight === 'bold' ? 'normal' : 'bold' })}
                    title="Negrito"
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    className={`btn ${(elem as any).fontStyle === 'italic' ? 'btn-primary' : ''}`}
                    style={{ flex: 1, padding: '0.35rem', justifyContent: 'center' }}
                    onClick={() => updateElement(elem.id, { fontStyle: (elem as any).fontStyle === 'italic' ? 'normal' : 'italic' })}
                    title="Itálico"
                  >
                    <Italic size={14} />
                  </button>
                  <button
                    className={`btn ${(elem as any).textDecoration === 'underline' ? 'btn-primary' : ''}`}
                    style={{ flex: 1, padding: '0.35rem', justifyContent: 'center' }}
                    onClick={() => updateElement(elem.id, { textDecoration: (elem as any).textDecoration === 'underline' ? 'none' : 'underline' })}
                    title="Sublinhado"
                  >
                    <Underline size={14} />
                  </button>
                </div>
              </div>

              {/* Alinhamentos Horizontal e Vertical */}
              {elem.type === 'text' && (
                <div>
                  <label className="metric-label">Alinhamento</label>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button
                      className={`btn ${(elem as any).alignment === 'left' ? 'btn-primary' : ''}`}
                      style={{ flex: 1, padding: '0.35rem', justifyContent: 'center' }}
                      onClick={() => updateElement(elem.id, { alignment: 'left' })}
                      title="Alinhar à Esquerda"
                    >
                      <AlignLeft size={14} />
                    </button>
                    <button
                      className={`btn ${(elem as any).alignment === 'center' ? 'btn-primary' : ''}`}
                      style={{ flex: 1, padding: '0.35rem', justifyContent: 'center' }}
                      onClick={() => updateElement(elem.id, { alignment: 'center' })}
                      title="Centralizar"
                    >
                      <AlignCenter size={14} />
                    </button>
                    <button
                      className={`btn ${(elem as any).alignment === 'right' ? 'btn-primary' : ''}`}
                      style={{ flex: 1, padding: '0.35rem', justifyContent: 'center' }}
                      onClick={() => updateElement(elem.id, { alignment: 'right' })}
                      title="Alinhar à Direita"
                    >
                      <AlignRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Accordion 4: Posição & Tamanho (Grade 2x2 Rigorosa) */}
      <div className="inspector-accordion">
        <div className="inspector-accordion-header" onClick={() => toggleSection('dimensions')}>
          <span>▾ Posição & Tamanho (mm)</span>
          {openSections.dimensions ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </div>

        {openSections.dimensions && (
          <div className="inspector-accordion-content">
            <div className="grid-2x2">
              <div>
                <label className="metric-label">Posição X (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  className="inspector-input"
                  value={elem.x}
                  onChange={(e) => updateElement(elem.id, { x: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="metric-label">Posição Y (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  className="inspector-input"
                  value={elem.y}
                  onChange={(e) => updateElement(elem.id, { y: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="metric-label">Largura (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  className="inspector-input"
                  value={elem.width}
                  onChange={(e) => updateElement(elem.id, { width: parseFloat(e.target.value) || 1 })}
                />
              </div>
              <div>
                <label className="metric-label">Altura (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  className="inspector-input"
                  value={elem.height}
                  onChange={(e) => updateElement(elem.id, { height: parseFloat(e.target.value) || 1 })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
