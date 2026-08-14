import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Rect, Text, Group, Line, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from 'use-image';
import {
  useEditorStore,
  mmToPx,
  pxToMm,
  MOCK_PRODUCT_DATA,
} from './useEditorStore';
import { LabelElement, QrCodeElement } from '@witiquetas/label-schema';
import { generateQRCodeDataUrl } from './qrCodeGenerator';
import {
  Copy,
  Scissors,
  Trash2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  BringToFront,
  SendToBack,
  Layers,
  Sparkles,
  AlertTriangle
} from 'lucide-react';

// Subcomponente para renderizar QR Code localmente via KonvaImage
function KonvaQRCode({
  elem,
  xPx,
  yPx,
  wPx,
  hPx,
  dpi,
  onDragEnd,
  onTransformEnd,
  onClick,
  onDblClick,
  onContextMenu,
}: {
  elem: QrCodeElement;
  xPx: number;
  yPx: number;
  wPx: number;
  hPx: number;
  dpi: number;
  onDragEnd: (e: any) => void;
  onTransformEnd: (e: any) => void;
  onClick: (e: any) => void;
  onDblClick: (e: any) => void;
  onContextMenu: (e: any) => void;
}) {
  const qrDataUrl = useMemo(() => generateQRCodeDataUrl(elem.value || 'https://witiquetas.wrtec.com.br', 256), [elem.value]);
  const [image] = useImage(qrDataUrl);

  return (
    <Group
      id={elem.id}
      x={xPx}
      y={yPx}
      width={wPx}
      height={hPx}
      draggable={!elem.locked}
      onClick={onClick}
      onTap={onClick}
      onDblClick={onDblClick}
      onDblTap={onDblClick}
      onContextMenu={onContextMenu}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    >
      {image ? (
        <KonvaImage
          image={image}
          width={wPx}
          height={hPx}
        />
      ) : (
        <Rect
          width={wPx}
          height={hPx}
          fill="#f1f5f9"
          stroke="#000000"
          strokeWidth={1}
        />
      )}
    </Group>
  );
}

export default function CanvasArea() {
  const {
    document,
    selectedElementIds,
    setSelectedElementId,
    toggleSelectElement,
    setSelectedElementIds,
    zoom,
    snapToGrid,
    gridSizeMm,
    showRulers,
    showSafeArea,
    safeAreaMarginMm,
    showPreviewData,
    updateElement,
    duplicateSelectedElements,
    removeSelectedElements,
    copySelection,
    cutSelection,
    pasteSelection,
    bringToFront,
    sendToBack,
    toggleLock,
    toggleVisibility,
  } = useEditorStore();

  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);

  // Estados de seleção por área (Marquee Selection)
  const [isMarqueeActive, setIsMarqueeActive] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<{ x: number; y: number } | null>(null);

  // Menu de contexto com botão direito
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetId: string | null;
  } | null>(null);

  const { widthMm, heightMm, dpi } = document.dimensions;
  const stageWidthPx = mmToPx(widthMm, dpi);
  const stageHeightPx = mmToPx(heightMm, dpi);
  const gridSizePx = mmToPx(gridSizeMm, dpi);
  const safeAreaMarginPx = mmToPx(safeAreaMarginMm, dpi);

  // Atualizar seleção do Transformer do Konva para seleção individual ou múltipla
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    if (selectedElementIds.length > 0) {
      const nodes = selectedElementIds
        .map((id) => stageRef.current.findOne(`#${id}`))
        .filter((node): node is any => !!node);

      transformerRef.current.nodes(nodes);
      transformerRef.current.getLayer()?.batchDraw();
    } else {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedElementIds, document.elements]);

  // Fechar menu de contexto ao clicar em qualquer lugar
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const snapValue = (valPx: number): number => {
    if (!snapToGrid) return valPx;
    return Math.round(valPx / gridSizePx) * gridSizePx;
  };

  // Verificar se algum elemento ultrapassa as dimensões da etiqueta
  const outOfBoundsElement = document.elements.find(
    (el) => el.x < 0 || el.y < 0 || el.x + el.width > widthMm || el.y + el.height > heightMm
  );

  // Marquee Drag Handlers
  const handleStageMouseDown = (e: any) => {
    const clickedOnEmpty = e.target === stageRef.current;
    if (clickedOnEmpty) {
      if (!e.evt.shiftKey && !e.evt.ctrlKey) {
        setSelectedElementIds([]);
      }
      const stage = stageRef.current.getStage();
      const pointer = stage.getPointerPosition();
      if (pointer) {
        setIsMarqueeActive(true);
        setMarqueeStart({ x: pointer.x / zoom, y: pointer.y / zoom });
        setMarqueeEnd({ x: pointer.x / zoom, y: pointer.y / zoom });
      }
    }
  };

  const handleStageMouseMove = () => {
    if (!isMarqueeActive || !stageRef.current) return;
    const stage = stageRef.current.getStage();
    const pointer = stage.getPointerPosition();
    if (pointer) {
      setMarqueeEnd({ x: pointer.x / zoom, y: pointer.y / zoom });
    }
  };

  const handleStageMouseUp = (e: any) => {
    if (!isMarqueeActive || !marqueeStart || !marqueeEnd) {
      setIsMarqueeActive(false);
      return;
    }

    const x1 = Math.min(marqueeStart.x, marqueeEnd.x);
    const x2 = Math.max(marqueeStart.x, marqueeEnd.x);
    const y1 = Math.min(marqueeStart.y, marqueeEnd.y);
    const y2 = Math.max(marqueeStart.y, marqueeEnd.y);

    // Se o arrasto for significativo (> 5px), selecionar os elementos interceptados
    if (x2 - x1 > 5 || y2 - y1 > 5) {
      const selected: string[] = [];
      document.elements.forEach((el) => {
        if (el.visible === false) return;
        const elX = mmToPx(el.x, dpi);
        const elY = mmToPx(el.y, dpi);
        const elW = mmToPx(el.width, dpi);
        const elH = mmToPx(el.height, dpi);

        const intersects = !(elX > x2 || elX + elW < x1 || elY > y2 || elY + elH < y1);
        if (intersects) {
          selected.push(el.id);
        }
      });

      if (e.evt.shiftKey || e.evt.ctrlKey) {
        const union = Array.from(new Set([...selectedElementIds, ...selected]));
        setSelectedElementIds(union);
      } else {
        setSelectedElementIds(selected);
      }
    }

    setIsMarqueeActive(false);
    setMarqueeStart(null);
    setMarqueeEnd(null);
  };

  // Renderizador de Elementos
  const renderElement = (elem: LabelElement) => {
    if (elem.visible === false) return null;

    const isSelected = selectedElementIds.includes(elem.id);
    const xPx = mmToPx(elem.x, dpi);
    const yPx = mmToPx(elem.y, dpi);
    const wPx = mmToPx(elem.width, dpi);
    const hPx = mmToPx(elem.height, dpi);

    const handleClick = (e: any) => {
      e.cancelBubble = true;
      const isMulti = e.evt.shiftKey || e.evt.ctrlKey;
      toggleSelectElement(elem.id, isMulti);
    };

    const handleContextMenu = (e: any) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      if (!selectedElementIds.includes(elem.id)) {
        setSelectedElementId(elem.id);
      }
      setContextMenu({
        x: e.evt.clientX,
        y: e.evt.clientY,
        targetId: elem.id,
      });
    };

    const handleDragEnd = (e: any) => {
      const newXPx = snapValue(e.target.x());
      const newYPx = snapValue(e.target.y());
      updateElement(elem.id, {
        x: pxToMm(newXPx, dpi),
        y: pxToMm(newYPx, dpi),
      });
    };

    const handleTransformEnd = (e: any) => {
      const node = e.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      node.scaleX(1);
      node.scaleY(1);

      const newWPx = Math.max(10, node.width() * scaleX);
      const newHPx = Math.max(10, node.height() * scaleY);

      updateElement(elem.id, {
        x: pxToMm(node.x(), dpi),
        y: pxToMm(node.y(), dpi),
        width: pxToMm(newWPx, dpi),
        height: pxToMm(newHPx, dpi),
      });
    };

    switch (elem.type) {
      case 'text': {
        const textContent = showPreviewData && elem.field && MOCK_PRODUCT_DATA[elem.field]
          ? MOCK_PRODUCT_DATA[elem.field]
          : elem.text;

        const isBold = elem.fontWeight === 'bold' || elem.fontWeight === '700' || elem.fontWeight === '600';
        const isItalic = elem.fontStyle === 'italic';
        const fontStyleStr = isBold && isItalic ? 'italic bold' : isBold ? 'bold' : isItalic ? 'italic' : 'normal';

        return (
          <Text
            key={elem.id}
            id={elem.id}
            x={xPx}
            y={yPx}
            width={wPx}
            height={hPx}
            text={textContent}
            fontFamily={elem.fontFamily || 'Roboto'}
            fontSize={elem.fontSize * (dpi / 72)}
            fontStyle={fontStyleStr}
            textDecoration={elem.textDecoration || 'none'}
            align={elem.alignment || 'left'}
            verticalAlign={elem.verticalAlignment || 'top'}
            fill={elem.color || '#000000'}
            draggable={!elem.locked}
            onClick={handleClick}
            onTap={handleClick}
            onContextMenu={handleContextMenu}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          />
        );
      }

      case 'price': {
        const rawPriceStr = showPreviewData && elem.field && MOCK_PRODUCT_DATA[elem.field]
          ? MOCK_PRODUCT_DATA[elem.field]
          : '9.99';

        const [integerPart, fractionPart] = rawPriceStr.split('.');
        const integerSize = elem.integerFontSize * (dpi / 72);
        const fractionSize = elem.fractionFontSize * (dpi / 72);
        const currencySize = (elem.currencyFontSize || 12) * (dpi / 72);

        return (
          <Group
            key={elem.id}
            id={elem.id}
            x={xPx}
            y={yPx}
            width={wPx}
            height={hPx}
            draggable={!elem.locked}
            onClick={handleClick}
            onTap={handleClick}
            onContextMenu={handleContextMenu}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          >
            <Text
              text={elem.prefix || 'R$'}
              fontFamily={elem.fontFamily || 'Roboto'}
              fontSize={currencySize}
              fontStyle="bold"
              fill={elem.color || '#dc2626'}
              x={0}
              y={0}
            />
            <Text
              text={integerPart}
              fontFamily={elem.fontFamily || 'Roboto'}
              fontSize={integerSize}
              fontStyle="bold"
              fill={elem.color || '#dc2626'}
              x={currencySize * 1.5}
              y={0}
            />
            <Text
              text={`,${fractionPart || '00'}`}
              fontFamily={elem.fontFamily || 'Roboto'}
              fontSize={fractionSize}
              fontStyle="bold"
              fill={elem.color || '#dc2626'}
              x={currencySize * 1.5 + integerSize * (integerPart?.length || 1) * 0.55}
              y={0}
            />
          </Group>
        );
      }

      case 'barcode': {
        const valueStr = showPreviewData && elem.field && MOCK_PRODUCT_DATA[elem.field]
          ? MOCK_PRODUCT_DATA[elem.field]
          : elem.value;

        return (
          <Group
            key={elem.id}
            id={elem.id}
            x={xPx}
            y={yPx}
            width={wPx}
            height={hPx}
            draggable={!elem.locked}
            onClick={handleClick}
            onTap={handleClick}
            onContextMenu={handleContextMenu}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          >
            {Array.from({ length: 24 }).map((_, i) => (
              <Rect
                key={i}
                x={(wPx / 24) * i}
                y={0}
                width={(wPx / 24) * (i % 3 === 0 ? 0.7 : 0.4)}
                height={hPx * 0.75}
                fill="#000000"
              />
            ))}
            {elem.showText && (
              <Text
                text={valueStr}
                x={0}
                y={hPx * 0.78}
                width={wPx}
                fontFamily="Courier New"
                fontSize={10 * (dpi / 72)}
                align="center"
                fontStyle="bold"
                fill="#000000"
              />
            )}
          </Group>
        );
      }

      case 'qrcode': {
        return (
          <KonvaQRCode
            key={elem.id}
            elem={elem as QrCodeElement}
            xPx={xPx}
            yPx={yPx}
            wPx={wPx}
            hPx={hPx}
            dpi={dpi}
            onClick={handleClick}
            onDblClick={() => setSelectedElementId(elem.id)}
            onContextMenu={handleContextMenu}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          />
        );
      }

      case 'rectangle': {
        return (
          <Rect
            key={elem.id}
            id={elem.id}
            x={xPx}
            y={yPx}
            width={wPx}
            height={hPx}
            fill={elem.fillColor === 'transparent' ? undefined : elem.fillColor || undefined}
            stroke={elem.strokeColor || '#000000'}
            strokeWidth={elem.strokeWidth || 1}
            cornerRadius={elem.cornerRadius || 0}
            draggable={!elem.locked}
            onClick={handleClick}
            onTap={handleClick}
            onContextMenu={handleContextMenu}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          />
        );
      }

      case 'line': {
        return (
          <Line
            key={elem.id}
            id={elem.id}
            points={[xPx, yPx, xPx + wPx, yPx]}
            stroke={elem.color || '#000000'}
            strokeWidth={elem.strokeWidth || 1}
            draggable={!elem.locked}
            onClick={handleClick}
            onTap={handleClick}
            onContextMenu={handleContextMenu}
            onDragEnd={handleDragEnd}
          />
        );
      }

      default:
        return null;
    }
  };

  // Linhas da Grade de Fundo
  const renderGridLines = () => {
    const lines = [];
    for (let i = 0; i <= stageWidthPx; i += gridSizePx) {
      lines.push(
        <Line
          key={`v-${i}`}
          points={[i, 0, i, stageHeightPx]}
          stroke="rgba(59, 130, 246, 0.12)"
          strokeWidth={1}
          dash={[2, 2]}
        />
      );
    }
    for (let j = 0; j <= stageHeightPx; j += gridSizePx) {
      lines.push(
        <Line
          key={`h-${j}`}
          points={[0, j, stageWidthPx, j]}
          stroke="rgba(59, 130, 246, 0.12)"
          strokeWidth={1}
          dash={[2, 2]}
        />
      );
    }
    return lines;
  };

  // Marquee Selection Box
  const marqueeBoxProps = useMemo(() => {
    if (!isMarqueeActive || !marqueeStart || !marqueeEnd) return null;
    return {
      x: Math.min(marqueeStart.x, marqueeEnd.x),
      y: Math.min(marqueeStart.y, marqueeEnd.y),
      width: Math.abs(marqueeEnd.x - marqueeStart.x),
      height: Math.abs(marqueeEnd.y - marqueeStart.y),
    };
  }, [isMarqueeActive, marqueeStart, marqueeEnd]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--canvas-bg)',
        position: 'relative',
        userSelect: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Alerta de elemento fora dos limites da etiqueta */}
      {outOfBoundsElement && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(245, 158, 11, 0.9)',
            color: '#000000',
            padding: '0.35rem 0.85rem',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: 10,
          }}
        >
          <AlertTriangle size={14} />
          <span>Parte do elemento está fora da área imprimível da etiqueta</span>
        </div>
      )}

      {/* Réguas em Milímetros no Topo */}
      {showRulers && (
        <div className="ruler-container-h" style={{ display: 'flex', alignItems: 'center', paddingLeft: '24px' }}>
          {Array.from({ length: Math.ceil(widthMm / 10) + 1 }).map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${24 + mmToPx(i * 10, dpi) * zoom}px`,
                borderLeft: '1px solid var(--border-color)',
                height: '100%',
                paddingLeft: '2px',
              }}
            >
              {i * 10} mm
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'auto', position: 'relative' }}>
        {/* Régua Vertical Lateral */}
        {showRulers && (
          <div className="ruler-container-v">
            {Array.from({ length: Math.ceil(heightMm / 10) + 1 }).map((_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: `${mmToPx(i * 10, dpi) * zoom}px`,
                  borderTop: '1px solid var(--border-color)',
                  width: '100%',
                  paddingTop: '2px',
                  fontSize: '8px',
                }}
              >
                {i * 10}
              </div>
            ))}
          </div>
        )}

        {/* Prancheta Central */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2.5rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedElementIds([]);
            }
          }}
        >
          <div
            style={{
              width: stageWidthPx * zoom,
              height: stageHeightPx * zoom,
              backgroundColor: '#ffffff',
              boxShadow: 'var(--shadow-elevated), 0 0 0 1px rgba(0,0,0,0.1)',
              position: 'relative',
              borderRadius: '2px',
              overflow: 'hidden',
              cursor: isMarqueeActive ? 'crosshair' : 'default',
              transition: 'width 0.15s ease, height 0.15s ease',
            }}
          >
            <Stage
              ref={stageRef}
              width={stageWidthPx * zoom}
              height={stageHeightPx * zoom}
              scaleX={zoom}
              scaleY={zoom}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseUp={handleStageMouseUp}
            >
              {/* Camada da Grade */}
              {snapToGrid && <Layer>{renderGridLines()}</Layer>}

              {/* Linha Guia de Margem Segura (1.5 mm) */}
              {showSafeArea && (
                <Layer>
                  <Rect
                    x={safeAreaMarginPx}
                    y={safeAreaMarginPx}
                    width={stageWidthPx - safeAreaMarginPx * 2}
                    height={stageHeightPx - safeAreaMarginPx * 2}
                    stroke="rgba(245, 158, 11, 0.4)"
                    strokeWidth={1}
                    dash={[4, 4]}
                  />
                </Layer>
              )}

              {/* Camada dos Elementos Visuais */}
              <Layer>
                {document.elements.map(renderElement)}

                {/* Caixa do Marquee de Seleção */}
                {marqueeBoxProps && (
                  <Rect
                    x={marqueeBoxProps.x}
                    y={marqueeBoxProps.y}
                    width={marqueeBoxProps.width}
                    height={marqueeBoxProps.height}
                    fill="rgba(59, 130, 246, 0.15)"
                    stroke="#3b82f6"
                    strokeWidth={1}
                    dash={[3, 3]}
                  />
                )}

                {/* Konva Transformer para elementos selecionados */}
                <Transformer
                  ref={transformerRef}
                  rotateEnabled={true}
                  keepRatio={false}
                  boundBoxFunc={(oldBox, newBox) => {
                    if (newBox.width < 8 || newBox.height < 8) return oldBox;
                    return newBox;
                  }}
                />
              </Layer>
            </Stage>
          </div>
        </div>
      </div>

      {/* Menu de Contexto no Botão Direito */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            background: 'var(--modal-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            boxShadow: 'var(--shadow-elevated)',
            padding: '0.4rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem',
            zIndex: 150,
            minWidth: '180px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="btn"
            style={{ justifyContent: 'flex-start', border: 'none', padding: '0.4rem 0.6rem' }}
            onClick={() => {
              duplicateSelectedElements();
              setContextMenu(null);
            }}
          >
            <Copy size={14} />
            <span>Duplicar (Ctrl+D)</span>
          </button>
          <button
            className="btn"
            style={{ justifyContent: 'flex-start', border: 'none', padding: '0.4rem 0.6rem' }}
            onClick={() => {
              copySelection();
              setContextMenu(null);
            }}
          >
            <Copy size={14} />
            <span>Copiar (Ctrl+C)</span>
          </button>
          <button
            className="btn"
            style={{ justifyContent: 'flex-start', border: 'none', padding: '0.4rem 0.6rem' }}
            onClick={() => {
              cutSelection();
              setContextMenu(null);
            }}
          >
            <Scissors size={14} />
            <span>Recortar (Ctrl+X)</span>
          </button>
          <button
            className="btn"
            style={{ justifyContent: 'flex-start', border: 'none', padding: '0.4rem 0.6rem' }}
            onClick={() => {
              pasteSelection();
              setContextMenu(null);
            }}
          >
            <Copy size={14} />
            <span>Colar (Ctrl+V)</span>
          </button>

          <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.2rem 0' }} />

          {contextMenu.targetId && (
            <>
              <button
                className="btn"
                style={{ justifyContent: 'flex-start', border: 'none', padding: '0.4rem 0.6rem' }}
                onClick={() => {
                  bringToFront(contextMenu.targetId!);
                  setContextMenu(null);
                }}
              >
                <BringToFront size={14} />
                <span>Trazer para Frente</span>
              </button>
              <button
                className="btn"
                style={{ justifyContent: 'flex-start', border: 'none', padding: '0.4rem 0.6rem' }}
                onClick={() => {
                  sendToBack(contextMenu.targetId!);
                  setContextMenu(null);
                }}
              >
                <SendToBack size={14} />
                <span>Enviar para Trás</span>
              </button>
              <button
                className="btn"
                style={{ justifyContent: 'flex-start', border: 'none', padding: '0.4rem 0.6rem' }}
                onClick={() => {
                  toggleLock(contextMenu.targetId!);
                  setContextMenu(null);
                }}
              >
                <Lock size={14} />
                <span>Bloquear / Desbloquear</span>
              </button>
              <button
                className="btn"
                style={{ justifyContent: 'flex-start', border: 'none', padding: '0.4rem 0.6rem' }}
                onClick={() => {
                  toggleVisibility(contextMenu.targetId!);
                  setContextMenu(null);
                }}
              >
                <EyeOff size={14} />
                <span>Ocultar Elemento</span>
              </button>
            </>
          )}

          <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.2rem 0' }} />

          <button
            className="btn"
            style={{ justifyContent: 'flex-start', border: 'none', padding: '0.4rem 0.6rem', color: 'var(--status-danger)' }}
            onClick={() => {
              removeSelectedElements();
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} />
            <span>Excluir (Del)</span>
          </button>
        </div>
      )}
    </div>
  );
}
