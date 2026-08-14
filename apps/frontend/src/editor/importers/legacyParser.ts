import { LabelDocument, LabelElement } from '@witiquetas/label-schema';
import { ImportAdapter, ImportResult, ImportDiagnosticItem } from './types';

/**
 * Adaptador de Importação para Modelos Legados Witiquetas / ERP
 * Processa variáveis [[PRECO]], [[PROMOCAO]], [[DESCRICAO]], [[EAN]], [[CALC]], [[CHAR13]], etc.
 * Estritamente seguro (sem eval / execução de código)
 */
export const legacyAdapter: ImportAdapter = {
  id: 'legacy-witiquetas',
  name: 'Modelo Legado Witiquetas / ERP',

  detect: (content: string): boolean => {
    return /\[\[(PRECO|PROMOCAO|DESCRICAO|PRODUTO|EAN|BARRAS|CALC|CHAR13|TEXT|MOLDURA|LINHA|TAMANHO)[^\]]*\]\]/i.test(content);
  },

  parse: async (content: string): Promise<ImportResult> => {
    const diagnostics: ImportDiagnosticItem[] = [];
    const elements: LabelElement[] = [];

    let widthMm = 100;
    let heightMm = 30;
    let dpi: 203 | 300 | 600 = 203;

    // 1. Detectar dimensões se especificadas no cabeçalho legado
    const sizeMatch = content.match(/\[\[TAMANHO:\s*(\d+)x(\d+)(?:x(\d+))?\]\]/i);
    if (sizeMatch) {
      widthMm = parseInt(sizeMatch[1]) || 100;
      heightMm = parseInt(sizeMatch[2]) || 30;
      if (sizeMatch[3]) dpi = (parseInt(sizeMatch[3]) as any) || 203;
      diagnostics.push({
        status: 'converted',
        originalSnippet: sizeMatch[0],
        message: `Dimensões configuradas para ${widthMm}x${heightMm} mm (${dpi} DPI)`,
      });
    }

    // 2. Linhas e blocos do arquivo
    const lines = content.split(/\r?\n/);
    let currentY = 2;

    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return;

      // Tag de Preço Normal
      if (/\[\[(PRECO|PRECO_NORMAL)\]\]/i.test(trimmed)) {
        const id = `elem-price-${Date.now()}-${lineIdx}`;
        elements.push({
          id,
          name: 'Preço Normal',
          type: 'price',
          field: 'produto.preco',
          prefix: 'R$',
          sampleValue: '9,99',
          reducedCents: true,
          fontFamily: 'Roboto',
          x: Math.round(widthMm * 0.55),
          y: currentY,
          width: Math.round(widthMm * 0.4),
          height: 12,
          color: '#dc2626',
          locked: false,
          visible: true,
        });
        diagnostics.push({
          status: 'converted',
          originalSnippet: trimmed,
          message: 'Preço Normal vinculado ao campo produto.preco com centavos reduzidos',
          targetElementId: id,
        });
        currentY += 13;
        return;
      }

      // Tag de Preço Promocional
      if (/\[\[(PROMOCAO|PRECO_PROMOCAO)\]\]/i.test(trimmed)) {
        const id = `elem-promo-${Date.now()}-${lineIdx}`;
        elements.push({
          id,
          name: 'Preço Promocional',
          type: 'price',
          field: 'produto.promocao.preco',
          prefix: 'R$',
          sampleValue: '7,99',
          reducedCents: true,
          fontFamily: 'Roboto',
          x: Math.round(widthMm * 0.55),
          y: currentY,
          width: Math.round(widthMm * 0.4),
          height: 14,
          color: '#ef4444',
          locked: false,
          visible: true,
        });
        diagnostics.push({
          status: 'converted',
          originalSnippet: trimmed,
          message: 'Preço Promocional vinculado ao campo produto.promocao.preco',
          targetElementId: id,
        });
        currentY += 15;
        return;
      }

      // Tag de Descrição do Produto
      if (/\[\[(DESCRICAO|PRODUTO)\]\]/i.test(trimmed)) {
        const id = `elem-desc-${Date.now()}-${lineIdx}`;
        elements.push({
          id,
          name: 'Descrição do Produto',
          type: 'text',
          field: 'produto.descricao',
          text: 'DESCRIÇÃO DO PRODUTO EXEMPLO',
          fontFamily: 'Roboto',
          fontSize: 11,
          fontWeight: 'bold',
          alignment: 'left',
          x: 2,
          y: currentY,
          width: Math.round(widthMm - 4),
          height: 6,
          color: '#0f172a',
          locked: false,
          visible: true,
        });
        diagnostics.push({
          status: 'converted',
          originalSnippet: trimmed,
          message: 'Descrição vinculada ao campo produto.descricao',
          targetElementId: id,
        });
        currentY += 7;
        return;
      }

      // Tag de Código de Barras EAN
      if (/\[\[(EAN|BARRAS|CODIGO)\]\]/i.test(trimmed)) {
        const id = `elem-bar-${Date.now()}-${lineIdx}`;
        elements.push({
          id,
          name: 'Código de Barras EAN',
          type: 'barcode',
          format: 'AUTO',
          field: 'produto.ean',
          value: '7894900011517',
          showText: true,
          x: 2,
          y: currentY,
          width: Math.min(48, widthMm - 4),
          height: 10,
          locked: false,
          visible: true,
        });
        diagnostics.push({
          status: 'converted',
          originalSnippet: trimmed,
          message: 'Código de Barras vinculado ao campo produto.ean em modo Automático',
          targetElementId: id,
        });
        currentY += 11;
        return;
      }

      // Tag de QR Code
      const qrMatch = trimmed.match(/\[\[QR(?:CODE)?(?::\s*([^\]]+))?\]\]/i);
      if (qrMatch) {
        const url = qrMatch[1]?.trim() || 'https://suaempresa.com.br';
        const id = `elem-qr-${Date.now()}-${lineIdx}`;
        elements.push({
          id,
          name: 'QR Code Link',
          type: 'qrcode',
          value: url,
          x: Math.round(widthMm - 16),
          y: currentY,
          width: 14,
          height: 14,
          locked: false,
          visible: true,
        });
        diagnostics.push({
          status: 'converted',
          originalSnippet: trimmed,
          message: `QR Code convertido com destino "${url}"`,
          targetElementId: id,
        });
        return;
      }

      // Tag de Texto Estático
      const textMatch = trimmed.match(/\[\[TEXT:\s*([^\]]+)\]\]/i);
      if (textMatch) {
        const txt = textMatch[1].trim();
        const id = `elem-txt-${Date.now()}-${lineIdx}`;
        elements.push({
          id,
          name: 'Texto Legado',
          type: 'text',
          text: txt,
          fontFamily: 'Roboto',
          fontSize: 9,
          alignment: 'left',
          x: 2,
          y: currentY,
          width: Math.round(widthMm - 4),
          height: 5,
          color: '#000000',
          locked: false,
          visible: true,
        });
        diagnostics.push({
          status: 'converted',
          originalSnippet: trimmed,
          message: `Texto estático "${txt}" convertido`,
          targetElementId: id,
        });
        currentY += 6;
        return;
      }

      // Tag de Linha Divisória
      if (/\[\[(LINHA|DIVISOR)\]\]/i.test(trimmed)) {
        const id = `elem-line-${Date.now()}-${lineIdx}`;
        elements.push({
          id,
          name: 'Linha Divisória',
          type: 'line',
          strokeWidth: 1,
          color: '#000000',
          x: 2,
          y: currentY,
          width: Math.round(widthMm - 4),
          height: 1,
          locked: false,
          visible: true,
        });
        diagnostics.push({
          status: 'converted',
          originalSnippet: trimmed,
          message: 'Linha divisória convertida',
          targetElementId: id,
        });
        currentY += 2;
        return;
      }

      // Tag de Cálculo Legado (Conversão Parcial)
      if (/\[\[CALC:[^\]]+\]\]/i.test(trimmed)) {
        diagnostics.push({
          status: 'partial',
          originalSnippet: trimmed,
          message: 'Fórmula de cálculo legada mapeada. Cálculos dinâmicos serão executados via integração ERP.',
        });
        return;
      }

      // Tag de Caractere de Controle
      if (/\[\[CHAR\d+\]\]/i.test(trimmed)) {
        diagnostics.push({
          status: 'converted',
          originalSnippet: trimmed,
          message: 'Caractere de controle legado interpretado como espaçamento/quebra.',
        });
        currentY += 1;
        return;
      }

      // Linha de texto simples ou comando não reconhecido
      if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
        diagnostics.push({
          status: 'unrecognized',
          originalSnippet: trimmed,
          message: `Comando legado "${trimmed}" não homologado. Metadado preservado.`,
        });
      } else {
        // Converte linha solta em texto estático
        const id = `elem-txt-${Date.now()}-${lineIdx}`;
        elements.push({
          id,
          name: 'Texto',
          type: 'text',
          text: trimmed,
          fontFamily: 'Roboto',
          fontSize: 9,
          alignment: 'left',
          x: 2,
          y: currentY,
          width: Math.round(widthMm - 4),
          height: 5,
          color: '#000000',
          locked: false,
          visible: true,
        });
        diagnostics.push({
          status: 'converted',
          originalSnippet: trimmed,
          message: `Linha de texto convertida: "${trimmed}"`,
          targetElementId: id,
        });
        currentY += 6;
      }
    });

    const doc: LabelDocument = {
      schemaVersion: 1,
      title: `Modelo Importado (${widthMm}x${heightMm}mm)`,
      dimensions: {
        widthMm,
        heightMm,
        dpi,
        orientation: widthMm >= heightMm ? 'landscape' : 'portrait',
      },
      elements,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return {
      formatId: legacyAdapter.id,
      formatName: legacyAdapter.name,
      document: doc,
      diagnostics,
      rawContent: content,
      elementsCount: elements.length,
      warningsCount: diagnostics.filter((d) => d.status !== 'converted').length,
    };
  },
};
