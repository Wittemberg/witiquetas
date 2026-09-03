import React, { useMemo } from 'react';
import { Stage, Layer, Rect, Text, Group, Line, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import type {
  LabelDocument,
  LabelElement,
  TextElement,
  PriceElement,
  BarcodeElement,
  QrCodeElement,
  LineElement,
  RectangleElement,
  ImageElement,
} from '@witiquetas/label-schema';
import { resolveFieldValue, evaluateVisibilityRule } from '@witiquetas/label-schema';
import { mmToPx } from '../../editor/useEditorStore.js';
import { getPriceRenderMetrics, computeTextLines, normalizeRotation } from '../../editor/bounds.js';
import { generateBarcodeModules } from '../../editor/barcodeEngine.js';
import { generateQRCodeDataUrl } from '../../editor/qrCodeGenerator.js';
import { Eye, FileText, AlertCircle } from 'lucide-react';

export interface PrintPreviewProps {
  document: LabelDocument | null;
  data: Record<string, unknown> | null;
  modelName?: string;
  printerLanguage?: string;
  targetWidthPx?: number;
}

// Subcomponente QR Code Read-Only para Prévia
function KonvaQRCodePreview({
  elem,
  xPx,
  yPx,
  wPx,
  hPx,
  dataContext,
}: {
  elem: QrCodeElement;
  xPx: number;
  yPx: number;
  wPx: number;
  hPx: number;
  dataContext: Record<string, unknown>;
}) {
  const valueStr = useMemo(() => {
    const fieldKey = elem.field || (elem.binding ? elem.binding.fieldId : undefined);
    if (fieldKey) {
      const resolved = resolveFieldValue(fieldKey, dataContext);
      if (resolved !== undefined && resolved !== null && String(resolved).trim() !== '') {
        return String(resolved);
      }
    }
    return elem.value || 'https://witiquetas.wrtec.com.br';
  }, [elem.field, elem.binding, elem.value, dataContext]);

  const qrDataUrl = useMemo(() => generateQRCodeDataUrl(valueStr, 256), [valueStr]);
  const [image] = useImage(qrDataUrl);

  return (
    <Group x={xPx} y={yPx} width={wPx} height={hPx} rotation={normalizeRotation(elem.rotation)}>
      {image ? (
        <KonvaImage image={image} width={wPx} height={hPx} />
      ) : (
        <Rect width={wPx} height={hPx} fill="#f1f5f9" stroke="#000000" strokeWidth={1} />
      )}
    </Group>
  );
}

// Subcomponente Imagem Read-Only para Prévia
function KonvaImagePreview({
  elem,
  xPx,
  yPx,
  wPx,
  hPx,
}: {
  elem: ImageElement;
  xPx: number;
  yPx: number;
  wPx: number;
  hPx: number;
}) {
  const imgSrc = elem.src || elem.source || '';
  const [image] = useImage(imgSrc);

  return (
    <Group x={xPx} y={yPx} width={wPx} height={hPx} rotation={normalizeRotation(elem.rotation)}>
      {image ? (
        <KonvaImage image={image} width={wPx} height={hPx} />
      ) : (
        <Rect width={wPx} height={hPx} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={1} />
      )}
    </Group>
  );
}

// Subcomponente para Renderizar um Único Elemento do Modelo
function SingleElementPreview({
  elem,
  dpi,
  dataContext,
}: {
  elem: LabelElement;
  dpi: number;
  dataContext: Record<string, unknown>;
}) {
  // Avaliar regra de visibilidade relacional
  if (elem.visibilityRule && !evaluateVisibilityRule(elem.visibilityRule, dataContext)) {
    return null;
  }

  const xPx = mmToPx(elem.x, dpi);
  const yPx = mmToPx(elem.y, dpi);
  const wPx = mmToPx(elem.width, dpi);
  const hPx = mmToPx(elem.height, dpi);

  switch (elem.type) {
    case 'text': {
      const textElem = elem as TextElement;
      const source = textElem.binding?.source ?? (
        textElem.field?.startsWith('system.') ? 'system' :
        textElem.field ? 'integration' :
        'manual'
      );
      const fieldKey = textElem.field || (textElem.binding ? textElem.binding.fieldId : undefined);

      let rawContent = textElem.text || '';
      if (source === 'manual') {
        rawContent = textElem.text || '';
      } else if (fieldKey) {
        const resolved = resolveFieldValue(fieldKey, dataContext, textElem.format);
        if (resolved !== undefined && resolved !== null) {
          rawContent = String(resolved);
        }
      } else if (rawContent.includes('[[')) {
        rawContent = resolveFieldValue(rawContent, dataContext, textElem.format) || rawContent;
      }

      const calculatedFontSize = mmToPx(textElem.fontSizeMm || (textElem.fontSize ? textElem.fontSize / 3.78 : 3.5), dpi);
      const fontStyleStr = [textElem.fontWeight === 'bold' ? 'bold' : '', textElem.fontStyle === 'italic' ? 'italic' : '']
        .filter(Boolean)
        .join(' ') || 'normal';

      if (textElem.singleLine) {
        const computed = computeTextLines(
          rawContent,
          wPx,
          hPx,
          textElem.fontFamily || 'Roboto',
          calculatedFontSize,
          fontStyleStr
        );

        const lineNodes = computed.lines.map((lineText, idx) => {
          const lineY = computed.startY + idx * (computed.fontSize * 1.15);
          return (
            <Text
              key={idx}
              text={lineText}
              fontFamily={textElem.fontFamily || 'Roboto'}
              fontSize={computed.fontSize}
              fontStyle={fontStyleStr}
              textDecoration={textElem.textDecoration || 'none'}
              align={textElem.alignment || 'left'}
              fill={textElem.reversePrint ? '#ffffff' : textElem.color || '#000000'}
              y={lineY}
              wrap="none"
            />
          );
        });

        return (
          <Group key={textElem.id} x={xPx} y={yPx} width={wPx} height={hPx} rotation={textElem.rotation || 0}>
            {textElem.reversePrint && (
              <Rect width={wPx} height={hPx} fill={textElem.color || '#000000'} cornerRadius={1} />
            )}
            {lineNodes}
          </Group>
        );
      }

      if (textElem.reversePrint) {
        return (
          <Group key={textElem.id} x={xPx} y={yPx} width={wPx} height={hPx} rotation={textElem.rotation || 0}>
            <Rect width={wPx} height={hPx} fill={textElem.color || '#000000'} cornerRadius={1} />
            <Text
              width={wPx}
              height={hPx}
              text={rawContent}
              fontFamily={textElem.fontFamily || 'Roboto'}
              fontSize={calculatedFontSize}
              fontStyle={fontStyleStr}
              textDecoration={textElem.textDecoration || 'none'}
              align={textElem.alignment || 'left'}
              verticalAlign={textElem.verticalAlignment || 'top'}
              wrap={textElem.wrap || 'word'}
              fill="#ffffff"
            />
          </Group>
        );
      }

      return (
        <Text
          key={textElem.id}
          x={xPx}
          y={yPx}
          width={wPx}
          height={hPx}
          text={rawContent}
          fontFamily={textElem.fontFamily || 'Roboto'}
          fontSize={calculatedFontSize}
          fontStyle={fontStyleStr}
          textDecoration={textElem.textDecoration || 'none'}
          align={textElem.alignment || 'left'}
          verticalAlign={textElem.verticalAlignment || 'top'}
          wrap={textElem.wrap || 'word'}
          fill={textElem.color || '#000000'}
          rotation={textElem.rotation || 0}
        />
      );
    }

    case 'price': {
      const priceElem = elem as PriceElement;
      const fieldKey = priceElem.field || (priceElem.binding ? priceElem.binding.fieldId : undefined);

      let rawValueStr = priceElem.sampleValue || '9.99';
      if (fieldKey) {
        const resolved = resolveFieldValue(fieldKey, dataContext);
        if (resolved !== undefined && resolved !== null && String(resolved).trim() !== '') {
          rawValueStr = String(resolved);
        }
      }

      const metrics = getPriceRenderMetrics(priceElem, dpi, rawValueStr);

      return (
        <Group key={priceElem.id} x={xPx} y={yPx} width={wPx} height={hPx} rotation={priceElem.rotation || 0}>
          {metrics.prefix && (
            <Text
              text={metrics.prefix}
              fontFamily={priceElem.fontFamily || 'Roboto'}
              fontSize={metrics.prefixSizePx}
              fontStyle="bold"
              fill={priceElem.color || '#dc2626'}
              x={0}
              y={metrics.prefixYPx}
              wrap="none"
            />
          )}

          <Text
            text={metrics.integerPart}
            fontFamily={priceElem.fontFamily || 'Roboto'}
            fontSize={metrics.integerSizePx}
            fontStyle="bold"
            fill={priceElem.color || '#dc2626'}
            x={metrics.prefixWidthPx}
            y={metrics.baseYPx}
            wrap="none"
          />

          <Text
            text={`,${metrics.fractionPart}`}
            fontFamily={priceElem.fontFamily || 'Roboto'}
            fontSize={metrics.centsSizePx}
            fontStyle="bold"
            fill={priceElem.color || '#dc2626'}
            x={metrics.prefixWidthPx + metrics.integerWidthPx + 1}
            y={metrics.centsYPx}
            wrap="none"
          />
        </Group>
      );
    }

    case 'barcode': {
      const barcodeElem = elem as BarcodeElement;
      const fieldKey = barcodeElem.field || (barcodeElem.binding ? barcodeElem.binding.fieldId : undefined);

      let valueStr = barcodeElem.value || '7894900011517';
      if (fieldKey) {
        const resolved = resolveFieldValue(fieldKey, dataContext);
        if (resolved !== undefined && resolved !== null && String(resolved).trim() !== '') {
          valueStr = String(resolved);
        }
      }

      const encoding = generateBarcodeModules(barcodeElem.format || 'AUTO', valueStr);
      const totalModules = encoding.totalModules || 95;
      const moduleWidth = wPx / totalModules;
      const showHumanText = barcodeElem.showText !== false;
      const barHeight = showHumanText ? Math.max(6, hPx - 13) : hPx;

      const barRuns: { start: number; length: number }[] = [];
      let currentRun: { start: number; length: number } | null = null;
      encoding.modules.forEach((isBlack, idx) => {
        if (isBlack) {
          if (!currentRun) {
            currentRun = { start: idx, length: 1 };
          } else {
            currentRun.length++;
          }
        } else {
          if (currentRun) {
            barRuns.push(currentRun);
            currentRun = null;
          }
        }
      });
      if (currentRun) barRuns.push(currentRun);

      return (
        <Group key={barcodeElem.id} x={xPx} y={yPx} width={wPx} height={hPx} rotation={barcodeElem.rotation || 0}>
          {barRuns.map((run, i) => (
            <Rect
              key={i}
              x={run.start * moduleWidth}
              y={0}
              width={run.length * moduleWidth}
              height={barHeight}
              fill="#000000"
            />
          ))}

          {showHumanText && (
            <Text
              text={valueStr}
              x={0}
              y={barHeight + 2}
              width={wPx}
              fontFamily="Courier New, monospace"
              fontSize={Math.max(8, Math.min(12, hPx * 0.22, (wPx / (valueStr.length || 1)) * 0.9))}
              align="center"
              fontStyle="bold"
              wrap="none"
              fill="#000000"
            />
          )}
        </Group>
      );
    }

    case 'qrcode': {
      return (
        <KonvaQRCodePreview
          key={elem.id}
          elem={elem as QrCodeElement}
          xPx={xPx}
          yPx={yPx}
          wPx={wPx}
          hPx={hPx}
          dataContext={dataContext}
        />
      );
    }

    case 'line': {
      const lineElem = elem as any;
      return (
        <Group key={lineElem.id} x={xPx} y={yPx} width={wPx} height={Math.max(10, mmToPx(lineElem.strokeWidth || 0.5, dpi))} rotation={lineElem.rotation || 0}>
          <Line
            points={[0, 0, wPx, 0]}
            stroke={lineElem.color || '#000000'}
            strokeWidth={mmToPx(lineElem.strokeWidth || lineElem.thicknessMm || 0.5, dpi)}
          />
        </Group>
      );
    }

    case 'rectangle': {
      const rectElem = elem as RectangleElement;
      return (
        <Rect
          key={rectElem.id}
          x={xPx}
          y={yPx}
          width={wPx}
          height={hPx}
          fill={rectElem.fill || 'transparent'}
          stroke={rectElem.stroke || '#000000'}
          strokeWidth={mmToPx(rectElem.strokeWidthMm || rectElem.strokeWidth || 0.5, dpi)}
          cornerRadius={mmToPx(rectElem.cornerRadiusMm || 0, dpi)}
          rotation={rectElem.rotation || 0}
        />
      );
    }

    case 'image': {
      return (
        <KonvaImagePreview
          key={elem.id}
          elem={elem as ImageElement}
          xPx={xPx}
          yPx={yPx}
          wPx={wPx}
          hPx={hPx}
        />
      );
    }

    default:
      return null;
  }
}

export const PrintPreview: React.FC<PrintPreviewProps> = ({
  document,
  data,
  modelName,
  printerLanguage = 'PPLB',
  targetWidthPx = 280,
}) => {
  // ESTADO SEM MODELO SELECIONADO
  if (!document) {
    return (
      <div className="print-center-card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
        <FileText style={{ width: '2rem', height: '2rem', margin: '0 auto 0.5rem auto', color: 'var(--text-muted)' }} />
        <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Selecione um modelo de etiqueta.
        </h4>
      </div>
    );
  }

  // ESTADO SEM REGISTRO SELECIONADO
  if (!data) {
    return (
      <div className="print-center-card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
        <AlertCircle style={{ width: '2rem', height: '2rem', margin: '0 auto 0.5rem auto', color: 'var(--text-muted)' }} />
        <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Selecione um registro para visualizar a impressão.
        </h4>
      </div>
    );
  }

  const widthMm = document.dimensions?.widthMm || 100;
  const heightMm = document.dimensions?.heightMm || 30;
  const dpi = document.dimensions?.dpi || 203;

  const nativeWidthPx = mmToPx(widthMm, dpi);
  const nativeHeightPx = mmToPx(heightMm, dpi);

  // Escala para ajustar ao card sem deformar a proporção widthMm:heightMm
  const scale = targetWidthPx / nativeWidthPx;
  const scaledWidthPx = targetWidthPx;
  const scaledHeightPx = nativeHeightPx * scale;

  // Extrair descrição curta do registro para identificação no topo
  const recordSummary =
    String(
      data['retail.description'] ||
        data['produto.descricao'] ||
        data['hospital.patientName'] ||
        data['logistics.recipient'] ||
        data['retail.code'] ||
        data['produto.codigo'] ||
        'Registro Ativo'
    );

  return (
    <div className="print-center-card">
      <div className="print-center-card-header">
        <h3 className="print-center-card-title">
          <Eye style={{ width: '1rem', height: '1rem' }} className="print-center-icon-blue" />
          Prévia de Impressão
        </h3>
        <span
          style={{
            fontSize: '0.6875rem',
            color: 'var(--text-muted)',
            maxWidth: '140px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={recordSummary}
        >
          {recordSummary}
        </span>
      </div>

      {/* RENDERIZADOR REAL READ-ONLY VIA STAGE / KONVA */}
      <div
        style={{
          background: '#e2e8f0',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <div
          style={{
            width: `${scaledWidthPx}px`,
            height: `${scaledHeightPx}px`,
            background: '#ffffff',
            borderRadius: '2px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            overflow: 'hidden',
          }}
        >
          <Stage
            width={scaledWidthPx}
            height={scaledHeightPx}
            scaleX={scale}
            scaleY={scale}
          >
            <Layer>
              {/* Fundo do Papel */}
              <Rect
                width={nativeWidthPx}
                height={nativeHeightPx}
                fill="#ffffff"
                stroke="#e2e8f0"
                strokeWidth={1}
              />

              {/* Renderização de todos os elementos com dados do registro */}
              {document.elements.map((elem) => (
                <SingleElementPreview
                  key={elem.id}
                  elem={elem}
                  dpi={dpi}
                  dataContext={data as Record<string, unknown>}
                />
              ))}
            </Layer>
          </Stage>
        </div>
      </div>

      {/* METADADOS DA MÍDIA */}
      <div style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
        {widthMm} × {heightMm} mm • {dpi} DPI • {printerLanguage}
      </div>

      <div style={{ fontSize: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Registro: </span>
        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{recordSummary}</span>
      </div>
    </div>
  );
};

export default PrintPreview;
