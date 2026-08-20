import React, { useState, useMemo } from 'react';
import { useEditorStore, formatDimensionBR } from './useEditorStore';
import FieldPicker from './FieldPicker';
import { CANONICAL_FIELDS, TextElement, PriceElement, BarcodeElement, QrCodeElement, RectangleElement, LineElement } from '@witiquetas/label-schema';
import { CURATED_FONTS, getFontCompatibility } from './fontsCatalog';
import { QRCodeLibraryItemDTO } from '@witiquetas/contracts';
import { validateCheckDigit, BarcodeFormat } from './barcodeEngine';
import {
  Trash2,
  Copy,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ArrowUp,
  ArrowDown,
  Bold,
  Italic,
  Underline,
  Search,
  Star,
  BookmarkPlus,
  AlertTriangle,
  Type,
  DollarSign,
  Barcode,
  QrCode,
  Square,
  Minus,
  Sparkles,
  Sliders,
  RotateCw,
  Eye,
  EyeOff
} from 'lucide-react';

export default function PropertyInspector() {
  const {
    document,
    selectedElementIds,
    setSelectedElementId,
    updateElement,
    removeElement,
    duplicateSelectedElements,
    toggleLock,
    toggleVisibility,
    alignElements,
    distributeElements,
    selectedPrinter,
    qrCodeLibrary,
    addQRCodeToLibrary,
    snapToGrid,
    setSnapToGrid,
    showSafeArea,
    setShowSafeArea,
  } = useEditorStore();

  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isQrLibraryOpen, setIsQrLibraryOpen] = useState(false);
  const [qrSearch, setQrSearch] = useState('');
  const [isSavingQrModalOpen, setIsSavingQrModalOpen] = useState(false);
  const [newQrName, setNewQrName] = useState('');
  const [onlyCompatibleFonts, setOnlyCompatibleFonts] = useState(true);

  const selectedElements = useMemo(() => {
    const elements = document?.elements || [];
    return elements.filter((el) => el && (selectedElementIds || []).includes(el.id));
  }, [document?.elements, selectedElementIds]);

  const primarySelected = selectedElements.length > 0 ? selectedElements[0] : null;

  // Filtragem de fontes
  const filteredFonts = useMemo(() => {
    return CURATED_FONTS.filter((f) => {
      if (onlyCompatibleFonts) {
        const compat = getFontCompatibility(f.family, selectedPrinter);
        return compat.status === 'NATIVE' || compat.status === 'COMPATIBLE';
      }
      return true;
    });
  }, [onlyCompatibleFonts, selectedPrinter]);

  // Filtragem de QR Codes
  const filteredQrCodes = useMemo(() => {
    if (!qrSearch.trim()) return qrCodeLibrary || [];
    const term = qrSearch.toLowerCase();
    return (qrCodeLibrary || []).filter(
      (qr) => qr && (qr.name.toLowerCase().includes(term) || qr.url.toLowerCase().includes(term))
    );
  }, [qrCodeLibrary, qrSearch]);

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

  // =========================================================================
  // ESTADO 1: NENHUM ELEMENTO SELECIONADO (PROPRIEDADES DO DOCUMENTO)
  // =========================================================================
  if (!primarySelected) {
    const widthMm = Number(document?.dimensions?.widthMm) || 100;
    const heightMm = Number(document?.dimensions?.heightMm) || 30;
    const dpi = Number(document?.dimensions?.dpi) || 203;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
        <div className="inspector-section">
          <div className="inspector-section-title">Propriedades da Etiqueta</div>
          
          <div>
            <label className="metric-label">Nome do Modelo</label>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {document?.title || 'Etiqueta Térmica'}
            </div>
          </div>

          <div>
            <label className="metric-label">Dimensões Físicas</label>
            <div className="preview-dimension-badge" style={{ display: 'inline-block' }}>
              {formatDimensionBR(widthMm)} × {formatDimensionBR(heightMm)} ({dpi} DPI)
            </div>
          </div>
        </div>

        <div style={{ padding: '3rem 1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          <Sparkles size={24} color="var(--accent-blue)" style={{ margin: '0 auto 0.5rem' }} />
          <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            Selecione um elemento
          </p>
          <p style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>
            Clique em qualquer item na etiqueta para editar seu conteúdo, fonte, cores e formatação.
          </p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ESTADO 2: MÚLTIPLOS ELEMENTOS SELECIONADOS
  // =========================================================================
  if (selectedElements.length > 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
        <div className="inspector-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
              {selectedElements.length} ELEMENTOS SELECIONADOS
            </span>
            <button className="btn" style={{ padding: '0.25rem 0.5rem', color: 'var(--status-danger)' }} onClick={duplicateSelectedElements}>
              <Copy size={13} /> Duplicar
            </button>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Alinhar Elementos</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.3rem' }}>
            <button className="btn" style={{ justifyContent: 'center' }} onClick={() => alignElements('left')} title="Alinhar à Esquerda">
              <AlignLeft size={13} /> Esq
            </button>
            <button className="btn" style={{ justifyContent: 'center' }} onClick={() => alignElements('center')} title="Centralizar Horizontal">
              <AlignCenter size={13} /> Centro
            </button>
            <button className="btn" style={{ justifyContent: 'center' }} onClick={() => alignElements('right')} title="Alinhar à Direita">
              <AlignRight size={13} /> Dir
            </button>
            <button className="btn" style={{ justifyContent: 'center' }} onClick={() => alignElements('top')} title="Alinhar ao Topo">
              <ArrowUp size={13} /> Topo
            </button>
            <button className="btn" style={{ justifyContent: 'center' }} onClick={() => alignElements('middle')} title="Centralizar Vertical">
              <AlignJustify size={13} /> Meio
            </button>
            <button className="btn" style={{ justifyContent: 'center' }} onClick={() => alignElements('bottom')} title="Alinhar à Base">
              <ArrowDown size={13} /> Base
            </button>
          </div>
        </div>

        <div className="inspector-section">
          <div className="inspector-section-title">Distribuir Espaço</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
            <button className="btn" style={{ justifyContent: 'center' }} onClick={() => distributeElements('horizontal')}>
              Horizontal
            </button>
            <button className="btn" style={{ justifyContent: 'center' }} onClick={() => distributeElements('vertical')}>
              Vertical
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ESTADO 3: ELEMENTO ÚNICO (PROPRIEDADES ESTREITAMENTE CONTEXTUAIS)
  // =========================================================================
  const elem = primarySelected;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {/* Header Contextual do Elemento */}
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <input
          type="text"
          className="inspector-input"
          style={{ fontWeight: 700, fontSize: '0.85rem', padding: '0.2rem 0.4rem', border: 'none', background: 'transparent' }}
          value={elem.name || ''}
          placeholder={`Nome do ${elem.type}`}
          onChange={(e) => updateElement(elem.id, { name: e.target.value })}
        />

        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            className="btn"
            style={{ padding: '0.3rem', border: 'none' }}
            title={elem.locked ? 'Desbloquear elemento' : 'Bloquear no canvas'}
            onClick={() => toggleLock(elem.id)}
          >
            {elem.locked ? <Lock size={14} color="var(--status-warning)" /> : <Unlock size={14} color="var(--text-muted)" />}
          </button>
          <button
            className="btn"
            style={{ padding: '0.3rem', border: 'none' }}
            title="Duplicar (Ctrl+D)"
            onClick={duplicateSelectedElements}
          >
            <Copy size={14} />
          </button>
          <button
            className="btn"
            style={{ padding: '0.3rem', border: 'none', color: 'var(--status-danger)' }}
            title="Excluir (Del)"
            onClick={() => removeElement(elem.id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* =====================================================================
         TIPO: TEXTO
         ===================================================================== */}
      {elem.type === 'text' && (
        <>
          <div className="inspector-section">
            <div className="inspector-section-title">Conteúdo do Texto</div>

            <FieldPicker
              label="Campo da integração ou sistema"
              value={(elem as TextElement).field || ''}
              onChange={(val) => updateElement(elem.id, { field: val || undefined })}
            />

            <div style={{ marginTop: '0.5rem' }}>
              <label className="metric-label">Texto Manual</label>
              <input
                type="text"
                className="inspector-input"
                placeholder="Digite o texto..."
                value={(elem as TextElement).text || ''}
                onChange={(e) => updateElement(elem.id, { text: e.target.value })}
              />
            </div>
          </div>

          <div className="inspector-section">
            <div className="inspector-section-title">Tipografia & Estilo</div>

            <div>
              <label className="metric-label">Fonte</label>
              <select
                className="inspector-select"
                value={(elem as TextElement).fontFamily || 'Roboto'}
                onChange={(e) => updateElement(elem.id, { fontFamily: e.target.value })}
                style={{ fontWeight: 600 }}
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
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label className="metric-label">Tamanho (pt)</label>
                <input
                  type="number"
                  className="inspector-input"
                  value={(elem as TextElement).fontSize || 12}
                  onChange={(e) => updateElement(elem.id, { fontSize: Math.max(6, parseInt(e.target.value) || 8) })}
                />
              </div>

              <div>
                <label className="metric-label">Cor</label>
                <input
                  type="color"
                  className="inspector-input"
                  style={{ height: '32px', padding: '2px' }}
                  value={(elem as TextElement).color || '#000000'}
                  onChange={(e) => updateElement(elem.id, { color: e.target.value })}
                />
              </div>
            </div>

            {/* Formatação: B / I / U */}
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <button
                className={`btn ${(elem as TextElement).fontWeight === 'bold' ? 'btn-primary' : ''}`}
                style={{ flex: 1, justifyContent: 'center', padding: '0.35rem' }}
                onClick={() => updateElement(elem.id, { fontWeight: (elem as TextElement).fontWeight === 'bold' ? 'normal' : 'bold' })}
                title="Negrito"
              >
                <Bold size={13} />
              </button>
              <button
                className={`btn ${(elem as TextElement).fontStyle === 'italic' ? 'btn-primary' : ''}`}
                style={{ flex: 1, justifyContent: 'center', padding: '0.35rem' }}
                onClick={() => updateElement(elem.id, { fontStyle: (elem as TextElement).fontStyle === 'italic' ? 'normal' : 'italic' })}
                title="Itálico"
              >
                <Italic size={13} />
              </button>
              <button
                className={`btn ${(elem as TextElement).textDecoration === 'underline' ? 'btn-primary' : ''}`}
                style={{ flex: 1, justifyContent: 'center', padding: '0.35rem' }}
                onClick={() => updateElement(elem.id, { textDecoration: (elem as TextElement).textDecoration === 'underline' ? 'none' : 'underline' })}
                title="Sublinhado"
              >
                <Underline size={13} />
              </button>
            </div>
          </div>

          <div className="inspector-section">
            <div className="inspector-section-title">Alinhamento</div>

            {/* Alinhamento Horizontal Compacto */}
            <div>
              <label className="metric-label">Horizontal</label>
              <div className="btn-group-align">
                <button
                  className={`btn-group-item ${(elem as TextElement).alignment === 'left' ? 'active' : ''}`}
                  onClick={() => updateElement(elem.id, { alignment: 'left' })}
                  title="Esquerda"
                >
                  <AlignLeft size={14} />
                </button>
                <button
                  className={`btn-group-item ${(elem as TextElement).alignment === 'center' ? 'active' : ''}`}
                  onClick={() => updateElement(elem.id, { alignment: 'center' })}
                  title="Centro"
                >
                  <AlignCenter size={14} />
                </button>
                <button
                  className={`btn-group-item ${(elem as TextElement).alignment === 'right' ? 'active' : ''}`}
                  onClick={() => updateElement(elem.id, { alignment: 'right' })}
                  title="Direita"
                >
                  <AlignRight size={14} />
                </button>
              </div>
            </div>

            {/* Alinhamento Vertical Compacto (Item 188) */}
            <div>
              <label className="metric-label">Vertical</label>
              <div className="btn-group-align">
                <button
                  className={`btn-group-item ${(elem as TextElement).verticalAlignment === 'top' ? 'active' : ''}`}
                  onClick={() => updateElement(elem.id, { verticalAlignment: 'top' })}
                  title="Topo"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className={`btn-group-item ${(elem as TextElement).verticalAlignment === 'middle' ? 'active' : ''}`}
                  onClick={() => updateElement(elem.id, { verticalAlignment: 'middle' })}
                  title="Centro / Meio"
                >
                  <AlignJustify size={14} />
                </button>
                <button
                  className={`btn-group-item ${(elem as TextElement).verticalAlignment === 'bottom' ? 'active' : ''}`}
                  onClick={() => updateElement(elem.id, { verticalAlignment: 'bottom' })}
                  title="Base"
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            </div>

            {/* Manter em 1 Linha (Item 167) */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer', marginTop: '0.2rem' }}>
              <input
                type="checkbox"
                checked={!!(elem as TextElement).singleLine}
                onChange={(e) => updateElement(elem.id, { singleLine: e.target.checked })}
              />
              <span>Manter em uma linha (sem quebra)</span>
            </label>

            {/* Ajustar Fonte Automaticamente (AutoFit P0) */}
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer', marginTop: '0.3rem' }}
              title="Reduz o tamanho da fonte automaticamente quando o conteúdo não couber no espaço disponível"
            >
              <input
                type="checkbox"
                checked={(elem as TextElement).autoFit !== false}
                onChange={(e) => updateElement(elem.id, { autoFit: e.target.checked })}
              />
              <span>Ajustar fonte automaticamente</span>
            </label>

            {/* Reduzir segunda linha (Item 9) */}
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer', marginTop: '0.3rem' }}
              title="Exibe a segunda linha em tamanho proporcionalmente menor para criar hierarquia visual"
            >
              <input
                type="checkbox"
                checked={(elem as TextElement).secondLineScale === 0.75}
                onChange={(e) => updateElement(elem.id, { secondLineScale: e.target.checked ? 0.75 : undefined })}
              />
              <span>Reduzir segunda linha</span>
            </label>
          </div>
        </>
      )}

      {/* =====================================================================
         TIPO: PREÇO (Padrão Varejo & Centavos Reduzidos)
         ===================================================================== */}
      {elem.type === 'price' && (() => {
        const priceElem = elem as PriceElement;
        const currentPrefix = priceElem.prefix !== undefined ? priceElem.prefix : 'R$';

        return (
          <div className="inspector-section">
            <div className="inspector-section-title">Formatação do Preço</div>

            <div>
              <label className="metric-label">Vínculo ERP (Fonte da Verdade)</label>
              <select
                className="inspector-select"
                value={priceElem.field || 'produto.preco'}
                onChange={(e) => updateElement(elem.id, { field: e.target.value })}
              >
                <option value="produto.preco">Preço Normal (produto.preco)</option>
                <option value="produto.promocao.preco">Preço Promocional (produto.promocao.preco)</option>
                <option value="produto.referencia.preco">Preço por Unidade Referência</option>
                <option value="">-- Sem vínculo (Manual) --</option>
              </select>
              {priceElem.field && (
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Na impressão será utilizado o preço do produto vindo da integração.
                </div>
              )}
            </div>

            <div>
              <label className="metric-label">Valor para visualização / exemplo</label>
              <input
                type="text"
                className="inspector-input"
                value={priceElem.sampleValue || '9,99'}
                placeholder="Ex: 9,99"
                onChange={(e) => updateElement(elem.id, { sampleValue: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label className="metric-label">Prefixo</label>
                <select
                  className="inspector-select"
                  value={currentPrefix}
                  onChange={(e) => updateElement(elem.id, { prefix: e.target.value })}
                >
                  <option value="R$">R$ (Real)</option>
                  <option value="$">$ (Dólar)</option>
                  <option value="US$">US$</option>
                  <option value="€">€ (Euro)</option>
                  <option value="">Nenhum</option>
                </select>
              </div>

              <div>
                <label className="metric-label">Cor do Preço</label>
                <input
                  type="color"
                  className="inspector-input"
                  style={{ height: '32px', padding: '2px' }}
                  value={priceElem.color || '#dc2626'}
                  onChange={(e) => updateElement(elem.id, { color: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="metric-label">Fonte</label>
              <select
                className="inspector-select"
                value={priceElem.fontFamily || 'Roboto'}
                onChange={(e) => updateElement(elem.id, { fontFamily: e.target.value })}
              >
                {filteredFonts.map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.family}
                  </option>
                ))}
              </select>
            </div>

            {/* Centavos Reduzidos Padrão Varejo (Item 251–254) */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer', marginTop: '0.2rem' }}>
              <input
                type="checkbox"
                checked={priceElem.reducedCents !== false}
                onChange={(e) => updateElement(elem.id, { reducedCents: e.target.checked })}
              />
              <span>Centavos reduzidos (Padrão Varejo - 60%)</span>
            </label>
          </div>
        );
      })()}

      {/* =====================================================================
         TIPO: CÓDIGO DE BARRAS (Simbologias Técnicas & ERP)
         ===================================================================== */}
      {elem.type === 'barcode' && (() => {
        const barcodeElem = elem as BarcodeElement;
        const currentFormat = barcodeElem.format || 'AUTO';
        const currentValue = barcodeElem.value || '7894900011517';
        const checkResult = validateCheckDigit(currentFormat, currentValue);

        return (
          <div className="inspector-section">
            <div className="inspector-section-title">Código de Barras</div>

            <div>
              <label className="metric-label">Vínculo ERP (Fonte da Verdade)</label>
              <select
                className="inspector-select"
                value={barcodeElem.field || 'produto.ean'}
                onChange={(e) => updateElement(elem.id, { field: e.target.value })}
              >
                <option value="produto.ean">Código EAN do Produto (produto.ean)</option>
                <option value="produto.codigo">Código Interno (produto.codigo)</option>
                <option value="">-- Sem vínculo (Manual) --</option>
              </select>
              {barcodeElem.field && (
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Na impressão física será utilizado o código do produto vindo da integração.
                </div>
              )}
            </div>

            <div>
              <label className="metric-label">Tipo de Código / Simbologia</label>
              <select
                className="inspector-select"
                value={currentFormat}
                onChange={(e) => updateElement(elem.id, { format: e.target.value as BarcodeFormat })}
                style={{ fontWeight: 600 }}
              >
                <option value="AUTO">Automático (Detectar pelo Dado)</option>
                <option value="EAN13">EAN-13 (Comércio e Varejo - 13 Dígitos)</option>
                <option value="EAN8">EAN-8 (Embalagens Pequenas - 8 Dígitos)</option>
                <option value="UPCA">UPC-A (Padrão 12 Dígitos)</option>
                <option value="CODE128">Code 128 (Alfanumérico Geral)</option>
                <option value="ITF14">ITF-14 / DUN-14 (Caixas e Fardos - 14 Dígitos)</option>
              </select>
            </div>

            <div>
              <label className="metric-label">Valor para visualização / exemplo</label>
              <input
                type="text"
                className="inspector-input"
                value={currentValue}
                placeholder="Ex: 7894900011517"
                onChange={(e) => updateElement(elem.id, { value: e.target.value })}
              />
            </div>

            {/* Validação de Check Digit e Simbologia */}
            {!checkResult.isValid ? (
              <div style={{ padding: '0.35rem 0.5rem', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '6px', fontSize: '0.72rem', color: 'var(--status-warning)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <AlertTriangle size={13} />
                <span>{checkResult.error || 'Dígito verificador inválido no dado cadastrado.'}</span>
              </div>
            ) : (
              <div style={{ padding: '0.25rem 0.5rem', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', fontSize: '0.7rem', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span>✓ Simbologia válida para visualização</span>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer', marginTop: '0.2rem' }}>
              <input
                type="checkbox"
                checked={barcodeElem.showText !== false}
                onChange={(e) => updateElement(elem.id, { showText: e.target.checked })}
              />
              <span>Exibir numeração humana abaixo das barras</span>
            </label>
          </div>
        );
      })()}

      {/* =====================================================================
         TIPO: QR CODE
         ===================================================================== */}
      {elem.type === 'qrcode' && (
        <div className="inspector-section">
          <div className="inspector-section-title">Link do QR Code</div>

          <FieldPicker
            label="Campo da integração (Opcional)"
            allowStatic={true}
            staticLabel="-- URL / Conteúdo Fixo --"
            value={(elem as QrCodeElement).field || ''}
            onChange={(val) => updateElement(elem.id, { field: val || undefined })}
          />

          <div>
            <label className="metric-label">URL / Destino Fixo</label>
            <input
              type="text"
              className="inspector-input"
              placeholder="https://suaempresa.com.br"
              value={(elem as QrCodeElement).value || ''}
              onChange={(e) => updateElement(elem.id, { value: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
            <button
              className="btn"
              style={{ flex: 1, fontSize: '0.72rem', padding: '0.35rem 0.5rem', justifyContent: 'center' }}
              onClick={() => setIsSavingQrModalOpen(!isSavingQrModalOpen)}
            >
              <BookmarkPlus size={13} color="var(--accent-blue)" />
              <span>Salvar na Biblioteca</span>
            </button>
            <button
              className="btn"
              style={{ fontSize: '0.72rem', padding: '0.35rem 0.5rem' }}
              onClick={() => setIsQrLibraryOpen(!isQrLibraryOpen)}
            >
              <QrCode size={13} />
              <span>Salvos</span>
            </button>
          </div>

          {/* Modal rápido de salvar QR Code */}
          {isSavingQrModalOpen && (
            <div style={{ padding: '0.65rem', background: 'var(--bg-card)', border: '1px solid var(--border-color-glow)', borderRadius: '8px', marginTop: '0.4rem' }}>
              <label className="metric-label">Nome do QR Code *</label>
              <input
                type="text"
                className="inspector-input"
                placeholder="Ex: Clube de Compras"
                value={newQrName}
                onChange={(e) => setNewQrName(e.target.value)}
                style={{ marginBottom: '0.4rem' }}
              />
              <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                <button className="btn" style={{ padding: '0.2rem 0.4rem', fontSize: '0.72rem' }} onClick={() => setIsSavingQrModalOpen(false)}>
                  Cancelar
                </button>
                <button className="btn btn-primary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }} onClick={handleSaveCurrentQrToLibrary} disabled={!newQrName.trim()}>
                  Salvar
                </button>
              </div>
            </div>
          )}

          {/* Lista de QR Codes Salvos */}
          {isQrLibraryOpen && (
            <div style={{ padding: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', marginTop: '0.4rem' }}>
              <div className="size-search-bar" style={{ padding: '0.25rem 0.5rem', marginBottom: '0.4rem' }}>
                <Search size={13} color="var(--text-muted)" />
                <input
                  type="text"
                  className="size-search-input"
                  placeholder="Procurar..."
                  value={qrSearch}
                  onChange={(e) => setQrSearch(e.target.value)}
                  style={{ fontSize: '0.75rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '130px', overflowY: 'auto' }}>
                {filteredQrCodes.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '0.35rem 0.5rem',
                      borderRadius: '5px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                    }}
                    onClick={() => updateElement(elem.id, { value: item.url, name: item.name })}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{item.url}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
         TIPO: MOLDURA / RETÂNGULO
         ===================================================================== */}
      {elem.type === 'rectangle' && (
        <div className="inspector-section">
          <div className="inspector-section-title">Moldura & Preenchimento</div>

          <div>
            <label className="metric-label">Cor de fundo</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="color"
                className="inspector-input"
                style={{ width: '45px', height: '32px', padding: '2px' }}
                value={(elem as RectangleElement).fillColor === 'transparent' ? '#ffffff' : (elem as RectangleElement).fillColor || '#000000'}
                onChange={(e) => updateElement(elem.id, { fillColor: e.target.value })}
                disabled={(elem as RectangleElement).fillColor === 'transparent'}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={(elem as RectangleElement).fillColor === 'transparent'}
                  onChange={(e) => updateElement(elem.id, { fillColor: e.target.checked ? 'transparent' : '#ffffff' })}
                />
                <span>Transparente</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label className="metric-label">Cor da Borda</label>
              <input
                type="color"
                className="inspector-input"
                style={{ height: '32px', padding: '2px' }}
                value={(elem as RectangleElement).strokeColor || '#000000'}
                onChange={(e) => updateElement(elem.id, { strokeColor: e.target.value })}
              />
            </div>
            <div>
              <label className="metric-label">Espessura (px)</label>
              <input
                type="number"
                min="0"
                max="20"
                className="inspector-input"
                value={(elem as RectangleElement).strokeWidth || 1}
                onChange={(e) => updateElement(elem.id, { strokeWidth: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
         TIPO: LINHA
         ===================================================================== */}
      {elem.type === 'line' && (
        <div className="inspector-section">
          <div className="inspector-section-title">Propriedades da Linha</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label className="metric-label">Cor</label>
              <input
                type="color"
                className="inspector-input"
                style={{ height: '32px', padding: '2px' }}
                value={(elem as LineElement).color || '#000000'}
                onChange={(e) => updateElement(elem.id, { color: e.target.value })}
              />
            </div>
            <div>
              <label className="metric-label">Espessura (px)</label>
              <input
                type="number"
                min="1"
                max="20"
                className="inspector-input"
                value={(elem as LineElement).strokeWidth || 1}
                onChange={(e) => updateElement(elem.id, { strokeWidth: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
         REGRAS DE EXIBIÇÃO CONDICIONAL (Texto e Preço)
         ===================================================================== */}
      {(elem.type === 'text' || elem.type === 'price') && (() => {
        const rule = elem.visibilityRule;
        const isEnabled = !!rule && !!rule.field;

        const handleToggle = (checked: boolean) => {
          if (checked) {
            const defaultField = activeCatalog && activeCatalog.length > 0 ? activeCatalog[0].id : 'system.printDateTime';
            updateElement(elem.id, {
              visibilityRule: {
                field: defaultField,
                operator: 'not_empty',
                value: '',
              },
            });
          } else {
            updateElement(elem.id, { visibilityRule: undefined });
          }
        };

        return (
          <div className="inspector-section" style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
            <div className="inspector-section-title">Regras de Exibição</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer', minWidth: 0 }}>
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => handleToggle(e.target.checked)}
              />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ativar exibição condicional</span>
            </label>

            {isEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  Mostrar este conteúdo quando...
                </div>
                <div style={{ width: '100%', minWidth: 0 }}>
                  <FieldPicker
                    label="Campo da integração"
                    allowStatic={false}
                    value={rule?.field || 'produto.promocao'}
                    onChange={(val) => updateElement(elem.id, { visibilityRule: { ...rule!, field: val } })}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', minWidth: 0 }}>
                  <div style={{ width: '100%', minWidth: 0 }}>
                    <label className="metric-label">Operador</label>
                    <select
                      className="inspector-select"
                      style={{ width: '100%', minWidth: 0, textOverflow: 'ellipsis' }}
                      value={rule?.operator || '>'}
                      onChange={(e) => updateElement(elem.id, { visibilityRule: { ...rule, operator: e.target.value as any } })}
                    >
                      <option value=">">Maior que (&gt;)</option>
                      <option value=">=">Maior ou igual (&gt;=)</option>
                      <option value="<">Menor que (&lt;)</option>
                      <option value="<=">Menor ou igual (&lt;=)</option>
                      <option value="=">Igual (=)</option>
                      <option value="!=">Diferente (!=)</option>
                      <option value="not_empty">Preenchido (not empty)</option>
                      <option value="empty">Vazio (empty)</option>
                    </select>
                  </div>

                  {!['empty', 'not_empty'].includes(rule?.operator || '') && (
                    <div style={{ width: '100%', minWidth: 0 }}>
                      <label className="metric-label">Valor Esperado</label>
                      <input
                        type="text"
                        className="inspector-input"
                        style={{ width: '100%', minWidth: 0 }}
                        value={rule?.value || ''}
                        placeholder="Ex: 0"
                        onChange={(e) => updateElement(elem.id, { visibilityRule: { ...rule, value: e.target.value } })}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* =====================================================================
         SEÇÃO ÚNICA AVANÇADA (RECOLHÍVEL)
         ===================================================================== */}
      <div className="inspector-section" style={{ borderBottom: 'none', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
        >
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            ▸ Avançado
          </span>
          {isAdvancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>

        {isAdvancedOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem', width: '100%', minWidth: 0 }}>
            <div>
              <label className="metric-label">Rotação (Graus)</label>
              <select
                className="inspector-select"
                value={elem.rotation || 0}
                onChange={(e) => updateElement(elem.id, { rotation: parseInt(e.target.value) || 0 })}
              >
                <option value={0}>0° (Normal)</option>
                <option value={90}>90° (Girar Direita)</option>
                <option value={180}>180° (Invertido)</option>
                <option value={270}>270° (Girar Esquerda)</option>
              </select>
            </div>

            {/* Customização de Formato de Data/Hora (system.printDateTime) */}
            {((elem as TextElement).field === 'system.printDateTime' || (elem as any).binding?.fieldId === 'system.printDateTime') && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', width: '100%', minWidth: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!(elem as any).customFormatActive}
                    onChange={(e) => updateElement(elem.id, { customFormatActive: e.target.checked, format: e.target.checked ? ((elem as any).format || 'datetime') : 'datetime' })}
                  />
                  <span>Personalizar formato de data/hora</span>
                </label>

                {(elem as any).customFormatActive && (
                  <div style={{ marginTop: '0.4rem', width: '100%', minWidth: 0 }}>
                    <label className="metric-label">Formato de Exibição</label>
                    <select
                      className="inspector-select"
                      style={{ width: '100%', minWidth: 0, textOverflow: 'ellipsis' }}
                      value={(elem as any).format || 'datetime'}
                      onChange={(e) => updateElement(elem.id, { format: e.target.value as any })}
                    >
                      <option value="datetime">Data e hora</option>
                      <option value="date">Data</option>
                      <option value="time">Hora</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Metadados de Origem do Round-Trip */}
            {elem.sourceReference && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Origem:</span>
                  <span className="preview-dimension-badge" style={{ fontSize: '0.62rem', padding: '0.1rem 0.35rem' }}>
                    {elem.sourceReference.state === 'modified' ? 'MODIFICADO' : elem.sourceReference.state === 'created' ? 'CRIADO' : 'ORIGINAL'}
                  </span>
                </div>
                {elem.sourceReference.originalLine && (
                  <div style={{ marginTop: '0.2rem' }}>
                    Linha original: #{elem.sourceReference.originalLine}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.4rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', width: '100%', minWidth: 0 }}>
              <button
                className="btn"
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem', minWidth: 0 }}
                onClick={() => toggleLock(elem.id)}
              >
                {elem.locked ? <Lock size={12} color="var(--status-warning)" /> : <Unlock size={12} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{elem.locked ? 'Bloqueado' : 'Desbloqueado'}</span>
              </button>

              <button
                className="btn"
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.72rem', minWidth: 0 }}
                onClick={() => toggleVisibility(elem.id)}
              >
                {elem.visible !== false ? <Eye size={12} /> : <EyeOff size={12} color="var(--status-danger)" />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{elem.visible !== false ? 'Visível' : 'Oculto'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
