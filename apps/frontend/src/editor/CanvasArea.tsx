import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Stage, Layer, Rect, Text, Group, Line, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from 'use-image';
import {
  useEditorStore,
  mmToPx,
  pxToMm,
  MOCK_PRODUCT_DATA,
} from './useEditorStore';
import { LabelElement, QrCodeElement, TextElement, BarcodeElement, PriceElement } from '@witiquetas/label-schema';
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
  AlertTriangle
} from 'lucide-react';

// =========================================================================
// SUBCOMPONENTE DE RÉGUA HORIZONTAL EM MILÍMETROS (0 ➔ widthMm)
// =========================================================================
function HorizontalRuler({
  widthMm,
  dpi,
  zoom,
  cursorXmm,
}: {
  widthMm: number;
  dpi: number;
  zoom: number;
  cursorXmm: number | null;
}) {
  const totalPx = mmToPx(widthMm, dpi) * zoom;
  const majorTicks = [];
  const mediumTicks = [];
  const minorTicks = [];

  for (let mm = 0; mm <= widthMm; mm += 1) {
    const x = mmToPx(mm, dpi) * zoom;
    if (mm % 10 === 0) {
      majorTicks.push({ mm, x });
    } else if (mm % 5 === 0) {
      mediumTicks.push({ mm, x });
    } else {
      minorTicks.push({ mm, x });
    }
  }

  const cursorXpx = cursorXmm !== null ? mmToPx(cursorXmm, dpi) * zoom : null;

  return (
    <svg
      width={totalPx}
      height={22}
      style={{
        display: 'block',
        background: 'var(--aside-bg)',
        borderBottom: '1px solid var(--border-color)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {minorTicks.map(({ mm, x }) => (
        <line
          key={`min-${mm}`}
          x1={x}
          y1={16}
          x2={x}
          y2={22}
          stroke="var(--text-muted)"
          strokeWidth={1}
          opacity={0.35}
        />
      ))}
      {mediumTicks.map(({ mm, x }) => (
        <line
          key={`med-${mm}`}
          x1={x}
          y1={12}
          x2={x}
          y2={22}
          stroke="var(--text-muted)"
          strokeWidth={1}
          opacity={0.7}
        />
      ))}
      {majorTicks.map(({ mm, x }) => (
        <g key={`maj-${mm}`}>
          <line
            x1={x}
            y1={5}
            x2={x}
            y2={22}
            stroke="var(--accent-blue)"
            strokeWidth={1.2}
          />
          <text
            x={x + 2}
            y={10}
            fill="var(--text-secondary)"
            fontSize={9}
            fontFamily="var(--font-mono)"
            fontWeight="bold"
            textAnchor="start"
          >
            {mm}
          </text>
        </g>
      ))}
      {cursorXpx !== null && cursorXpx >= 0 && cursorXpx <= totalPx && (
        <line
          x1={cursorXpx}
          y1={0}
          x2={cursorXpx}
          y2={22}
          stroke="#ef4444"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}

// =========================================================================
// SUBCOMPONENTE DE RÉGUA VERTICAL EM MILÍMETROS (0 ➔ heightMm)
// =========================================================================
function VerticalRuler({
  heightMm,
  dpi,
  zoom,
  cursorYmm,
}: {
  heightMm: number;
  dpi: number;
  zoom: number;
  cursorYmm: number | null;
}) {
  const totalPx = mmToPx(heightMm, dpi) * zoom;
  const majorTicks = [];
  const mediumTicks = [];
  const minorTicks = [];

  for (let mm = 0; mm <= heightMm; mm += 1) {
    const y = mmToPx(mm, dpi) * zoom;
    if (mm % 10 === 0) {
      majorTicks.push({ mm, y });
    } else if (mm % 5 === 0) {
      mediumTicks.push({ mm, y });
    } else {
      minorTicks.push({ mm, y });
    }
  }

  const cursorYpx = cursorYmm !== null ? mmToPx(cursorYmm, dpi) * zoom : null;

  return (
    <svg
      width={22}
      height={totalPx}
      style={{
        display: 'block',
        background: 'var(--aside-bg)',
        borderRight: '1px solid var(--border-color)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {minorTicks.map(({ mm, y }) => (
        <line
          key={`min-${mm}`}
          x1={16}
          y1={y}
          x2={22}
          y2={y}
          stroke="var(--text-muted)"
          strokeWidth={1}
          opacity={0.35}
        />
      ))}
      {mediumTicks.map(({ mm, y }) => (
        <line
          key={`med-${mm}`}
          x1={12}
          y1={y}
          x2={22}
          y2={y}
          stroke="var(--text-muted)"
          strokeWidth={1}
          opacity={0.7}
        />
      ))}
      {majorTicks.map(({ mm, y }) => (
        <g key={`maj-${mm}`}>
          <line
            x1={5}
            y1={y}
            x2={22}
            y2={y}
            stroke="var(--accent-blue)"
            strokeWidth={1.2}
          />
          <text
            x={1}
            y={y + 8}
            fill="var(--text-secondary)"
            fontSize={8}
            fontFamily="var(--font-mono)"
            fontWeight="bold"
            textAnchor="start"
          >
            {mm}
          </text>
        </g>
      ))}
      {cursorYpx !== null && cursorYpx >= 0 && cursorYpx <= totalPx && (
        <line
          x1={0}
          y1={cursorYpx}
          x2={22}
          y2={cursorYpx}
          stroke="#ef4444"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}

// Subcomponente QR Code Local
function KonvaQRCode({
  elem,
  xPx,
  yPx,
  wPx,
  hPx,
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

  const [cursorMm, setCursorMm] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [isMarqueeActive, setIsMarqueeActive] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<{ x: number; y: number } | null>(null);

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

  const primarySelected = useMemo(() => {
    return document.elements.find((el) => selectedElementIds.includes(el.id));
  }, [document.elements, selectedElementIds]);

  // Atualizar seleção do Transformer do Konva com proporção inteligente por tipo
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    if (selectedElementIds.length > 0) {
      const nodes = selectedElementIds
        .map((id) => stageRef.current.findOne(`#${id}`))
        .filter((node): node is any => !!node);

      // Trava proporção 1:1 apenas para QR Code e Imagem
      const shouldKeepRatio = primarySelected?.type === 'qrcode' || primarySelected?.type === 'image';
      transformerRef.current.keepRatio(shouldKeepRatio);
      transformerRef.current.nodes(nodes);
      transformerRef.current.getLayer()?.batchDraw();
    } else {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedElementIds, document.elements, primarySelected]);

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const snapValue = (valPx: number): number => {
    if (!snapToGrid) return valPx;
    return Math.round(valPx / gridSizePx) * gridSizePx;
  };

  const outOfBoundsElement = document.elements.find(
    (el) => el.x < 0 || el.y < 0 || el.x + el.width > widthMm || el.y + el.height > heightMm
  );

  const handleStageMouseMove = () => {
    if (!stageRef.current) return;
    const stage = stageRef.current.getStage();
    const pointer = stage.getPointerPosition();

    if (pointer) {
      const xMm = pxToMm(pointer.x / zoom, dpi);
      const yMm = pxToMm(pointer.y / zoom, dpi);
      setCursorMm({
        x: Math.max(0, Math.min(widthMm, xMm)),
        y: Math.max(0, Math.min(heightMm, yMm)),
      });

      if (isMarqueeActive) {
        setMarqueeEnd({ x: pointer.x / zoom, y: pointer.y / zoom });
      }
    }
  };

  const handleStageMouseLeave = () => {
    setCursorMm({ x: null, y: null });
  };

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

  const handleStageMouseUp = (e: any) => {
    if (!isMarqueeActive || !marqueeStart || !marqueeEnd) {
      setIsMarqueeActive(false);
      return;
    }

    const x1 = Math.min(marqueeStart.x, marqueeEnd.x);
    const x2 = Math.max(marqueeStart.x, marqueeEnd.x);
    const y1 = Math.min(marqueeStart.y, marqueeEnd.y);
    const y2 = Math.max(marqueeStart.y, marqueeEnd.y);

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

  // Renderizador Inteligente de Elementos
  const renderElement = (elem: LabelElement) => {
    if (elem.visible === false) return null;

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

      let newWPx = Math.max(10, node.width() * scaleX);
      let newHPx = Math.max(8, node.height() * scaleY);

      // QR Code sempre quadrado 1:1
      if (elem.type === 'qrcode') {
        const side = Math.max(newWPx, newHPx);
        newWPx = side;
        newHPx = side;
      }

      updateElement(elem.id, {
        x: pxToMm(node.x(), dpi),
        y: pxToMm(node.y(), dpi),
        width: pxToMm(newWPx, dpi),
        height: pxToMm(newHPx, dpi),
      });
    };

    switch (elem.type) {
      case 'text': {
        const textElem = elem as TextElement;
        const textContent = showPreviewData && textElem.field && MOCK_PRODUCT_DATA[textElem.field]
          ? MOCK_PRODUCT_DATA[textElem.field]
          : textElem.text;

        const isBold = textElem.fontWeight === 'bold' || textElem.fontWeight === '700' || textElem.fontWeight === '600';
        const isItalic = textElem.fontStyle === 'italic';
        const fontStyleStr = isBold && isItalic ? 'italic bold' : isBold ? 'bold' : isItalic ? 'italic' : 'normal';

        // AutoFit Inteligente: se o texto não couber na largura/altura, reduz progressivamente a fonte respeitando 6pt
        let calculatedFontSize = textElem.fontSize * (dpi / 72);
        if (textElem.autoFit !== false && textElem.singleLine) {
          const estimatedChars = textContent.length || 1;
          const maxAllowedSize = (wPx / estimatedChars) * 1.6;
          if (maxAllowedSize < calculatedFontSize) {
            calculatedFontSize = Math.max(6 * (dpi / 72), maxAllowedSize);
          }
        }

        return (
          <Text
            key={textElem.id}
            id={textElem.id}
            x={xPx}
            y={yPx}
            width={wPx}
            height={hPx}
            text={textContent}
            fontFamily={textElem.fontFamily || 'Roboto'}
            fontSize={calculatedFontSize}
            fontStyle={fontStyleStr}
            textDecoration={textElem.textDecoration || 'none'}
            align={textElem.alignment || 'left'}
            verticalAlign={textElem.verticalAlignment || 'top'}
            wrap={textElem.singleLine ? 'none' : textElem.wrap || 'word'}
            ellipsis={!!textElem.singleLine}
            fill={textElem.color || '#000000'}
            draggable={!textElem.locked}
            onClick={handleClick}
            onTap={handleClick}
            onDblClick={() => setSelectedElementId(textElem.id)}
            onContextMenu={handleContextMenu}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          />
        );
      }

      case 'price': {
        const priceElem = elem as PriceElement;
        const rawPriceStr = showPreviewData && priceElem.field && MOCK_PRODUCT_DATA[priceElem.field]
          ? MOCK_PRODUCT_DATA[priceElem.field]
          : '9.99';

        const [integerPart, fractionPart] = rawPriceStr.split('.');
        const scaleFactor = Math.min(wPx / 140, hPx / 50, 1.8);
        const integerSize = Math.max(12, priceElem.integerFontSize * (dpi / 72) * Math.max(0.6, scaleFactor));
        const fractionSize = Math.max(8, priceElem.fractionFontSize * (dpi / 72) * Math.max(0.6, scaleFactor));
        const currencySize = Math.max(7, (priceElem.currencyFontSize || 12) * (dpi / 72) * Math.max(0.6, scaleFactor));

        return (
          <Group
            key={priceElem.id}
            id={priceElem.id}
            x={xPx}
            y={yPx}
            width={wPx}
            height={hPx}
            draggable={!priceElem.locked}
            onClick={handleClick}
            onTap={handleClick}
            onDblClick={() => setSelectedElementId(priceElem.id)}
            onContextMenu={handleContextMenu}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          >
            <Text
              text={priceElem.prefix || 'R$'}
              fontFamily={priceElem.fontFamily || 'Roboto'}
              fontSize={currencySize}
              fontStyle="bold"
              fill={priceElem.color || '#dc2626'}
              x={0}
              y={Math.max(0, (hPx - integerSize) / 2)}
            />
            <Text
              text={integerPart}
              fontFamily={priceElem.fontFamily || 'Roboto'}
              fontSize={integerSize}
              fontStyle="bold"
              fill={priceElem.color || '#dc2626'}
              x={currencySize * 1.5}
              y={Math.max(0, (hPx - integerSize) / 2)}
            />
            <Text
              text={`,${fractionPart || '00'}`}
              fontFamily={priceElem.fontFamily || 'Roboto'}
              fontSize={fractionSize}
              fontStyle="bold"
              fill={priceElem.color || '#dc2626'}
              x={currencySize * 1.5 + integerSize * (integerPart?.length || 1) * 0.55}
              y={Math.max(0, (hPx - integerSize) / 2)}
            />
          </Group>
        );
      }

      case 'barcode': {
        const barcodeElem = elem as BarcodeElement;
        const valueStr = showPreviewData && barcodeElem.field && MOCK_PRODUCT_DATA[barcodeElem.field]
          ? MOCK_PRODUCT_DATA[barcodeElem.field]
          : barcodeElem.value || '7894900011517';

        // EAN-13: 13 dígitos contínuos indissociáveis das barras
        const barHeight = barcodeElem.showText ? hPx * 0.72 : hPx;
        const barCount = 30;
        const barUnitWidth = wPx / (barCount * 1.2);

        return (
          <Group
            key={barcodeElem.id}
            id={barcodeElem.id}
            x={xPx}
            y={yPx}
            width={wPx}
            height={hPx}
            draggable={!barcodeElem.locked}
            onClick={handleClick}
            onTap={handleClick}
            onDblClick={() => setSelectedElementId(barcodeElem.id)}
            onContextMenu={handleContextMenu}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          >
            {/* Barras EAN */}
            {Array.from({ length: barCount }).map((_, i) => {
              const isThick = (i % 3 === 0 || i % 7 === 0) && i > 2 && i < barCount - 2;
              return (
                <Rect
                  key={i}
                  x={i * (wPx / barCount)}
                  y={0}
                  width={isThick ? barUnitWidth * 1.8 : barUnitWidth}
                  height={barHeight}
                  fill="#000000"
                />
              );
            })}

            {/* Numeração Humana: NUNCA QUEBRA LINHA (13 DÍGITOS JUNTOS) */}
            {barcodeElem.showText !== false && (
              <Text
                text={valueStr}
                x={0}
                y={barHeight + 2}
                width={wPx}
                fontFamily="Courier New, monospace"
                fontSize={Math.max(7, Math.min(11, (wPx / 13) * 1.1))}
                align="center"
                fontStyle="bold"
                wrap="none"
                ellipsis={false}
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

  const marqueeBoxProps = useMemo(() => {
    if (!isMarqueeActive || !marqueeStart || !marqueeEnd) return null;
    return {
      x: Math.min(marqueeStart.x, marqueeEnd.x),
      y: Math.min(marqueeStart.y, marqueeEnd.y),
      width: Math.abs(marqueeEnd.x - marqueeStart.x),
      height: Math.abs(marqueeEnd.y - marqueeStart.y),
    };
  }, [isMarqueeActive, marqueeStart, marqueeEnd]);

  // Alerta de tamanho para código de barras EAN-13
  const isBarcodeTooSmall = primarySelected?.type === 'barcode' && (primarySelected.width < 25 || primarySelected.height < 8);

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
      {/* Alertas Flutuantes Discretos */}
      {outOfBoundsElement && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(245, 158, 11, 0.92)',
            color: '#000000',
            padding: '0.3rem 0.8rem',
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
          <span>Elemento fora da área imprimível da etiqueta</span>
        </div>
      )}

      {isBarcodeTooSmall && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(239, 68, 68, 0.92)',
            color: '#ffffff',
            padding: '0.3rem 0.8rem',
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
          <span>Tamanho pequeno para leitura segura em impressoras 203 DPI</span>
        </div>
      )}

      {/* Área Central: Prancheta com Réguas Precisas (0,0) */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
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
            display: 'grid',
            gridTemplateColumns: showRulers ? '22px auto' : 'auto',
            gridTemplateRows: showRulers ? '22px auto' : 'auto',
            boxShadow: 'var(--shadow-elevated), 0 0 0 1px var(--border-color)',
            borderRadius: '4px',
            overflow: 'hidden',
            background: 'var(--aside-bg)',
          }}
        >
          {/* Canto mm */}
          {showRulers && (
            <div
              style={{
                width: 22,
                height: 22,
                background: 'var(--aside-bg)',
                borderRight: '1px solid var(--border-color)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                fontWeight: 800,
                color: 'var(--accent-blue)',
                fontFamily: 'var(--font-mono)',
                userSelect: 'none',
              }}
              title="Milímetros (mm)"
            >
              mm
            </div>
          )}

          {/* Régua Horizontal */}
          {showRulers && (
            <HorizontalRuler
              widthMm={widthMm}
              dpi={dpi}
              zoom={zoom}
              cursorXmm={cursorMm.x}
            />
          )}

          {/* Régua Vertical */}
          {showRulers && (
            <VerticalRuler
              heightMm={heightMm}
              dpi={dpi}
              zoom={zoom}
              cursorYmm={cursorMm.y}
            />
          )}

          {/* Canvas da Etiqueta */}
          <div
            style={{
              width: stageWidthPx * zoom,
              height: stageHeightPx * zoom,
              backgroundColor: '#ffffff',
              position: 'relative',
              overflow: 'hidden',
              cursor: isMarqueeActive ? 'crosshair' : 'default',
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
              onMouseLeave={handleStageMouseLeave}
              onMouseUp={handleStageMouseUp}
            >
              {snapToGrid && <Layer>{renderGridLines()}</Layer>}

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

              <Layer>
                {document.elements.map(renderElement)}

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

      {/* Menu de Contexto com Botão Direito */}
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
