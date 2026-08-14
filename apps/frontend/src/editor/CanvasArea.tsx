import React, { useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Text, Group, Line, Transformer } from 'react-konva';
import { useEditorStore, mmToPx, pxToMm, MOCK_PRODUCT_DATA } from './useEditorStore';
import { LabelElement } from '@witiquetas/label-schema';

export default function CanvasArea() {
  const {
    document,
    selectedElementId,
    setSelectedElementId,
    zoom,
    snapToGrid,
    gridSizeMm,
    showPreviewData,
    updateElement,
  } = useEditorStore();

  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);

  const { widthMm, heightMm, dpi } = document.dimensions;

  // Tamanho físico do canvas em pixels
  const stageWidthPx = mmToPx(widthMm, dpi);
  const stageHeightPx = mmToPx(heightMm, dpi);

  // Tamanho da grade em pixels
  const gridSizePx = mmToPx(gridSizeMm, dpi);

  // Atualizar seleção do Transformer do Konva quando selectedElementId muda
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    if (selectedElementId) {
      const selectedNode = stageRef.current.findOne(`#${selectedElementId}`);
      if (selectedNode) {
        transformerRef.current.nodes([selectedNode]);
        transformerRef.current.getLayer().batchDraw();
      } else {
        transformerRef.current.nodes([]);
      }
    } else {
      transformerRef.current.nodes([]);
    }
  }, [selectedElementId, document.elements]);

  // Função de Snap à Grade
  const snapValue = (valPx: number): number => {
    if (!snapToGrid) return valPx;
    return Math.round(valPx / gridSizePx) * gridSizePx;
  };

  // Renderizador de cada elemento
  const renderElement = (elem: LabelElement) => {
    const isSelected = elem.id === selectedElementId;
    const xPx = mmToPx(elem.x, dpi);
    const yPx = mmToPx(elem.y, dpi);
    const wPx = mmToPx(elem.width, dpi);
    const hPx = mmToPx(elem.height, dpi);

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

      // Resetar escala e aplicar no tamanho real
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

        return (
          <Text
            key={elem.id}
            id={elem.id}
            x={xPx}
            y={yPx}
            width={wPx}
            height={hPx}
            text={textContent}
            fontFamily={elem.fontFamily || 'Inter'}
            fontSize={elem.fontSize * (dpi / 72)} // Ajuste pt/px
            fontStyle={elem.fontWeight === 'bold' ? 'bold' : 'normal'}
            align={elem.alignment || 'left'}
            fill={elem.color || '#000000'}
            draggable
            onClick={() => setSelectedElementId(elem.id)}
            onTap={() => setSelectedElementId(elem.id)}
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
            draggable
            onClick={() => setSelectedElementId(elem.id)}
            onTap={() => setSelectedElementId(elem.id)}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          >
            {/* Cifrão R$ */}
            <Text
              text={elem.prefix || 'R$'}
              fontSize={currencySize}
              fontStyle="bold"
              fill={elem.color || '#dc2626'}
              x={0}
              y={0}
            />
            {/* Parte Inteira (99) */}
            <Text
              text={integerPart}
              fontSize={integerSize}
              fontStyle="bold"
              fill={elem.color || '#dc2626'}
              x={currencySize * 1.5}
              y={0}
            />
            {/* Parte Fracionária (,99) */}
            <Text
              text={`,${fractionPart || '00'}`}
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

        // Renderizador simulado de código de barras
        return (
          <Group
            key={elem.id}
            id={elem.id}
            x={xPx}
            y={yPx}
            width={wPx}
            height={hPx}
            draggable
            onClick={() => setSelectedElementId(elem.id)}
            onTap={() => setSelectedElementId(elem.id)}
            onDragEnd={handleDragEnd}
            onTransformEnd={handleTransformEnd}
          >
            {/* Linhas simuladas do código de barras */}
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
            {/* Texto numérico do EAN-13 */}
            {elem.showText && (
              <Text
                text={valueStr}
                x={0}
                y={hPx * 0.78}
                width={wPx}
                fontSize={10 * (dpi / 72)}
                align="center"
                fontStyle="bold"
                fill="#000000"
              />
            )}
          </Group>
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
            fill={elem.fillColor || 'transparent'}
            stroke={elem.strokeColor || '#000000'}
            strokeWidth={elem.strokeWidth || 1}
            draggable
            onClick={() => setSelectedElementId(elem.id)}
            onTap={() => setSelectedElementId(elem.id)}
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
            draggable
            onClick={() => setSelectedElementId(elem.id)}
            onTap={() => setSelectedElementId(elem.id)}
            onDragEnd={handleDragEnd}
          />
        );
      }

      default:
        return null;
    }
  };

  // Desenhar linhas da grade no fundo do canvas
  const renderGridLines = () => {
    const lines = [];
    // Linhas verticais
    for (let i = 0; i <= stageWidthPx; i += gridSizePx) {
      lines.push(
        <Line
          key={`v-${i}`}
          points={[i, 0, i, stageHeightPx]}
          stroke="rgba(59, 130, 246, 0.15)"
          strokeWidth={1}
          dash={[2, 2]}
        />
      );
    }
    // Linhas horizontais
    for (let j = 0; j <= stageHeightPx; j += gridSizePx) {
      lines.push(
        <Line
          key={`h-${j}`}
          points={[0, j, stageWidthPx, j]}
          stroke="rgba(59, 130, 246, 0.15)"
          strokeWidth={1}
          dash={[2, 2]}
        />
      );
    }
    return lines;
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        background: 'var(--canvas-bg)',
        padding: '2rem',
        position: 'relative',
        transition: 'background-color 0.25s ease',
      }}
      onClick={(e) => {
        // Clicar fora deseleciona elementos
        if (e.target === e.currentTarget) {
          setSelectedElementId(null);
        }
      }}
    >
      {/* Moldura física da etiqueta com efeito de sombra */}
      <div
        style={{
          width: stageWidthPx * zoom,
          height: stageHeightPx * zoom,
          backgroundColor: '#ffffff',
          boxShadow: 'var(--shadow-elevated), 0 0 0 1px rgba(0,0,0,0.1)',
          position: 'relative',
          borderRadius: '2px',
          overflow: 'hidden',
          transition: 'width 0.2s, height 0.2s',
        }}
      >
        <Stage
          ref={stageRef}
          width={stageWidthPx * zoom}
          height={stageHeightPx * zoom}
          scaleX={zoom}
          scaleY={zoom}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) {
              setSelectedElementId(null);
            }
          }}
        >
          {/* Camada da Grade */}
          {snapToGrid && <Layer>{renderGridLines()}</Layer>}

          {/* Camada dos Elementos Visuais */}
          <Layer>
            {document.elements.map(renderElement)}
            {/* Transformador do Konva para o elemento ativo */}
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                // Tamanho mínimo ao redimensionar
                if (newBox.width < 10 || newBox.height < 10) {
                  return oldBox;
                }
                return newBox;
              }}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
