import { LabelDocument, LabelElement } from '@witiquetas/label-schema';
import { ImportAdapter, ImportResult, ImportDiagnosticItem } from './types';
import { pxToMm } from '../useEditorStore';

/**
 * Adaptador de Importação para Zebra Programming Language (ZPL)
 * Processa comandos básicos ^XA, ^LL, ^PW, ^FO, ^FD, ^BC, ^BQ, ^GB
 */
export const zplAdapter: ImportAdapter = {
  id: 'zpl',
  name: 'Zebra ZPL II',

  detect: (content: string): boolean => {
    return /\^XA/i.test(content) || /\^FO\d+,\d+/i.test(content);
  },

  parse: async (content: string): Promise<ImportResult> => {
    const diagnostics: ImportDiagnosticItem[] = [];
    const elements: LabelElement[] = [];

    const dpi = 203;
    let widthMm = 100;
    let heightMm = 30;

    // Detectar largura (^PW<dots>)
    const pwMatch = content.match(/\^PW(\d+)/i);
    if (pwMatch) {
      widthMm = pxToMm(parseInt(pwMatch[1]), dpi) || 100;
    }

    // Detectar altura (^LL<dots>)
    const llMatch = content.match(/\^LL(\d+)/i);
    if (llMatch) {
      heightMm = pxToMm(parseInt(llMatch[1]), dpi) || 30;
    }

    diagnostics.push({
      status: 'converted',
      originalSnippet: '^XA ... ^XZ',
      message: `Dimensões ZPL identificadas: ${widthMm}x${heightMm} mm (203 DPI)`,
    });

    // Encontrar blocos ^FO<x>,<y>...^FS
    const fieldRegex = /\^FO(\d+),(\d+)([\s\S]*?)\^FS/gi;
    let match;
    let elemIdx = 0;

    while ((match = fieldRegex.exec(content)) !== null) {
      elemIdx++;
      const xDots = parseInt(match[1]) || 0;
      const yDots = parseInt(match[2]) || 0;
      const body = match[3];

      const xMm = pxToMm(xDots, dpi);
      const yMm = pxToMm(yDots, dpi);

      // Extrair dados do campo ^FD...^FS
      const fdMatch = body.match(/\^FD([^^]+)/i);
      const dataStr = fdMatch ? fdMatch[1].trim() : '';

      // Código de barras Code 128 / EAN (^BC ou ^BE)
      if (/\^B[C83E]/i.test(body)) {
        const id = `elem-zpl-bar-${elemIdx}`;
        elements.push({
          id,
          name: `Código de Barras ZPL ${elemIdx}`,
          type: 'barcode',
          format: 'AUTO',
          value: dataStr || '7894900011517',
          showText: true,
          x: xMm,
          y: yMm,
          width: Math.min(50, widthMm - xMm),
          height: 12,
          locked: false,
          visible: true,
        });
        diagnostics.push({
          status: 'converted',
          originalSnippet: match[0].trim(),
          message: `Código de barras ZPL convertido (${dataStr})`,
          targetElementId: id,
        });
        continue;
      }

      // QR Code (^BQ)
      if (/\^BQ/i.test(body)) {
        const id = `elem-zpl-qr-${elemIdx}`;
        elements.push({
          id,
          name: `QR Code ZPL ${elemIdx}`,
          type: 'qrcode',
          value: dataStr.replace(/^QA,/, '') || 'https://suaempresa.com.br',
          x: xMm,
          y: yMm,
          width: 15,
          height: 15,
          locked: false,
          visible: true,
        });
        diagnostics.push({
          status: 'converted',
          originalSnippet: match[0].trim(),
          message: 'QR Code ZPL convertido',
          targetElementId: id,
        });
        continue;
      }

      // Caixa Gráfica / Moldura (^GB<w>,<h>,<t>)
      const gbMatch = body.match(/\^GB(\d+),(\d+),(\d+)?/i);
      if (gbMatch) {
        const wDots = parseInt(gbMatch[1]) || 50;
        const hDots = parseInt(gbMatch[2]) || 50;
        const tDots = parseInt(gbMatch[3] || '1') || 1;
        const id = `elem-zpl-box-${elemIdx}`;
        elements.push({
          id,
          name: `Moldura ZPL ${elemIdx}`,
          type: 'rectangle',
          x: xMm,
          y: yMm,
          width: pxToMm(wDots, dpi),
          height: pxToMm(hDots, dpi),
          strokeWidth: Math.max(1, Math.round(pxToMm(tDots, dpi))),
          strokeColor: '#000000',
          fillColor: 'transparent',
          locked: false,
          visible: true,
        });
        diagnostics.push({
          status: 'converted',
          originalSnippet: match[0].trim(),
          message: 'Moldura/Retângulo ZPL convertida',
          targetElementId: id,
        });
        continue;
      }

      // Preço ou Texto
      if (dataStr) {
        if (dataStr.includes('R$') || /^\d+[.,]\d{2}$/.test(dataStr)) {
          const id = `elem-zpl-price-${elemIdx}`;
          elements.push({
            id,
            name: `Preço ZPL ${elemIdx}`,
            type: 'price',
            field: 'produto.preco',
            prefix: 'R$',
            sampleValue: dataStr.replace('R$', '').trim() || '9,99',
            reducedCents: true,
            fontFamily: 'Roboto',
            x: xMm,
            y: yMm,
            width: Math.min(40, widthMm - xMm),
            height: 12,
            color: '#dc2626',
            locked: false,
            visible: true,
          });
          diagnostics.push({
            status: 'converted',
            originalSnippet: match[0].trim(),
            message: `Preço ZPL convertido (${dataStr})`,
            targetElementId: id,
          });
        } else {
          const id = `elem-zpl-txt-${elemIdx}`;
          elements.push({
            id,
            name: `Texto ZPL ${elemIdx}`,
            type: 'text',
            text: dataStr,
            fontFamily: 'Roboto',
            fontSize: 10,
            alignment: 'left',
            x: xMm,
            y: yMm,
            width: Math.min(80, widthMm - xMm),
            height: 6,
            color: '#000000',
            locked: false,
            visible: true,
          });
          diagnostics.push({
            status: 'converted',
            originalSnippet: match[0].trim(),
            message: `Texto ZPL convertido ("${dataStr}")`,
            targetElementId: id,
          });
        }
      }
    }

    const doc: LabelDocument = {
      schemaVersion: 1,
      title: `Modelo ZPL Importado (${widthMm}x${heightMm}mm)`,
      dimensions: {
        widthMm,
        heightMm,
        dpi: 203,
        orientation: widthMm >= heightMm ? 'landscape' : 'portrait',
      },
      elements,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return {
      formatId: zplAdapter.id,
      formatName: zplAdapter.name,
      document: doc,
      diagnostics,
      rawContent: content,
      elementsCount: elements.length,
      warningsCount: diagnostics.filter((d) => d.status !== 'converted').length,
    };
  },
};
