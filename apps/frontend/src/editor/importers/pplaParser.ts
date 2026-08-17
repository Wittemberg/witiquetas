import type {
  LabelDocument,
  LabelElement,
  TextElement,
  PriceElement,
  BarcodeElement,
  LineElement,
  VisibilityRule,
} from '@witiquetas/label-schema';
import type {
  ASTNode,
  VisualASTNode,
  ConditionalASTNode,
  ConfigASTNode,
  LabelAST,
} from './astTypes';
import {
  LegacyPreprocessor,
  isControlToken,
  invertVisibilityRule,
} from './legacyPreprocessor';
import { dotsToMm } from './pplbParser';
import type { ImportDiagnosticItem, ImportResult } from './types';

/**
 * Mapeamento de fontes PPLA para visualização no Canvas (Fallback Visual)
 * A métrica física real é preservada através de printerFontId e multiplicadores H/V.
 */
export const PPLA_FONT_MAP: Record<
  string,
  { fontFamily: string; baseFontSize: number; widthPerCharMm: number; heightMm: number }
> = {
  '1': { fontFamily: 'Courier New', baseFontSize: 8, widthPerCharMm: 1.25, heightMm: 2.0 },
  '2': { fontFamily: 'Roboto', baseFontSize: 10, widthPerCharMm: 1.75, heightMm: 2.8 },
  '3': { fontFamily: 'Roboto', baseFontSize: 12, widthPerCharMm: 2.2, heightMm: 3.6 },
  '4': { fontFamily: 'Roboto', baseFontSize: 16, widthPerCharMm: 2.8, heightMm: 4.8 },
  '5': { fontFamily: 'Roboto', baseFontSize: 22, widthPerCharMm: 3.8, heightMm: 6.8 },
};

/**
 * Remove caracteres de controle ([[CHAR02]], [[CHAR13]], STX, CR, LF, etc.) de strings de dados
 */
export function cleanPPLAControlTokens(str: string): string {
  return str
    .replace(/\[\[CHAR\d+\]\]/gi, '')
    .replace(/\[\[(STX|ETX|CR|LF|ESC|NUL)\]\]/gi, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();
}

/**
 * Parser de Comandos PPLA (Argox / Datamax DPL / Legado ERP)
 * Estado: EM HOMOLOGAÇÃO GEOMÉTRICA
 */
export class PPLAParser {
  /**
   * Processa nós condicionais recursivamente para PPLA
   */
  private static processConditionalNode(
    condNode: ConditionalASTNode,
    dpi: number,
    elements: LabelElement[],
    inheritedRule?: VisibilityRule
  ): ConditionalASTNode {
    const effectiveThenRule = inheritedRule || condNode.rule;
    const effectiveElseRule = invertVisibilityRule(effectiveThenRule);

    const processBranch = (branchNodes: ASTNode[], ruleToApply: VisibilityRule): ASTNode[] => {
      const processed: ASTNode[] = [];
      for (const child of branchNodes) {
        if (child.type === 'conditional') {
          const nested = this.processConditionalNode(child as ConditionalASTNode, dpi, elements, ruleToApply);
          processed.push(nested);
        } else if (child.type === 'raw') {
          const parsed = this.parseSingleCommand(child.originalText, child.line, dpi, ruleToApply);
          if (parsed.element) {
            elements.push(parsed.element);
            processed.push({
              type: 'visual',
              line: child.line,
              originalText: child.originalText,
              elementId: parsed.element.id,
              commandType: parsed.commandType,
            } as VisualASTNode);
          } else {
            processed.push(child);
          }
        } else {
          processed.push(child);
        }
      }
      return processed;
    };

    const processedThen = processBranch(condNode.thenNodes || condNode.children || [], effectiveThenRule);
    const processedElse =
      condNode.elseNodes && condNode.elseNodes.length > 0
        ? processBranch(condNode.elseNodes, effectiveElseRule)
        : undefined;

    return {
      ...condNode,
      thenNodes: processedThen,
      elseNodes: processedElse,
      children: [...processedThen, ...(processedElse || [])],
    };
  }

  /**
   * Converte conteúdo bruto PPLA em AST e LabelDocument
   */
  static parse(
    content: string,
    fileMetadata?: { originalFileName?: string; originalExtension?: string }
  ): ImportResult {
    const rawNodes = LegacyPreprocessor.preprocessLines(content);
    const diagnostics: ImportDiagnosticItem[] = [];
    const elements: LabelElement[] = [];
    const finalASTNodes: ASTNode[] = [];

    const dpi: 203 | 300 | 600 = 203;

    // Processamento de cada nó da AST
    for (const node of rawNodes) {
      if (node.type === 'comment' || node.type === 'quantity' || node.type === 'config') {
        finalASTNodes.push(node);
      } else if (node.type === 'conditional') {
        const processed = this.processConditionalNode(node as ConditionalASTNode, dpi, elements);
        finalASTNodes.push(processed);
      } else if (node.type === 'raw') {
        const parsed = this.parseSingleCommand(node.originalText, node.line, dpi);
        if (parsed.element) {
          elements.push(parsed.element);
          finalASTNodes.push({
            type: 'visual',
            line: node.line,
            originalText: node.originalText,
            elementId: parsed.element.id,
            commandType: parsed.commandType,
          } as VisualASTNode);

          diagnostics.push({
            status: 'converted',
            originalSnippet: node.originalText,
            message: `Comando PPLA "${parsed.commandType}" convertido em elemento "${parsed.element.name || parsed.element.type}"`,
            targetElementId: parsed.element.id,
          });
        } else {
          finalASTNodes.push(node);
          if (parsed.diagnosticMessage) {
            diagnostics.push({
              status: 'unsupported',
              originalSnippet: node.originalText,
              message: parsed.diagnosticMessage,
            });
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // DESCOBERTA DE DIMENSÕES FÍSICAS REAIS
    // -------------------------------------------------------------------------
    let maxExtentX = 0;
    let maxExtentY = 0;

    for (const el of elements) {
      const right = el.x + (el.width || 0);
      const bottom = el.y + (el.height || 0);
      if (right > maxExtentX) maxExtentX = right;
      if (bottom > maxExtentY) maxExtentY = bottom;
    }

    // Se a dimensão não for expressamente definida por comandos de mídia, calculamos bounds com margem segura
    // e marcamos dimensionsConfidence como 'partial'
    const inferredWidth = Math.max(35, Math.ceil(maxExtentX + 3));
    const inferredHeight = Math.max(22, Math.ceil(maxExtentY + 3));

    const dimensionsConfidence: 'exact' | 'partial' | 'unknown' = 'partial';
    const dimensionsConfidenceMessage =
      'Detectamos o layout, mas não foi possível determinar com segurança o tamanho da mídia. Selecione o tamanho físico da etiqueta.';

    const ast: LabelAST = {
      format: 'ppla',
      nodes: finalASTNodes,
      rawContent: content,
      dpi,
    };

    const document: LabelDocument = {
      schemaVersion: 1,
      title: fileMetadata?.originalFileName
        ? fileMetadata.originalFileName.replace(/\.[^/.]+$/, '')
        : 'Etiqueta PPLA Importada',
      dimensions: {
        widthMm: inferredWidth,
        heightMm: inferredHeight,
        dpi,
        dimensionsConfidence,
        dimensionsConfidenceMessage,
      },
      elements,
      sourceFile: {
        rawText: content,
        format: 'ppla',
        originalFileName: fileMetadata?.originalFileName || 'modelo_etiqueta.txt',
        originalExtension: fileMetadata?.originalExtension || '.txt',
        importedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return {
      formatId: 'ppla-legacy',
      formatName: 'PPLA / Argox / Datamax DPL',
      document,
      diagnostics,
      rawContent: content,
      elementsCount: elements.length,
      warningsCount: diagnostics.filter((d) => d.status !== 'converted').length,
    };
  }

  /**
   * Interpreta um comando posicional único PPLA
   */
  static parseSingleCommand(
    rawLine: string,
    lineIndex: number,
    dpi: number = 203,
    visibilityRule?: VisibilityRule
  ): { element?: LabelElement; commandType?: string; diagnosticMessage?: string } {
    // 1. Limpeza estrita de caracteres de controle
    const clean = cleanPPLAControlTokens(rawLine);
    if (!clean) return {};

    // 2. Comandos não-visuais de controle de impressora
    if (
      /^(O[0-9]{4}|M[0-9]{4}|LC[0-9]+|H[0-9A-Z_\[\]]+|D[0-9]{2}|Q[0-9A-Z_\[\]]+|E|e|L|l|m|ZT|JF|rN|S[0-9]|D[0-9])$/i.test(
        clean
      )
    ) {
      return {};
    }

    // -----------------------------------------------------------------------
    // 3. COMANDO DE LINHA / GRÁFICO PPLA: 1X...
    // Sintaxe: [1-4]X[HMult][VMult][SubType/3][Y/4][X/4]L[Length/4][Thickness/4]
    // Exemplo: 1X1100000500010L000100002
    // -----------------------------------------------------------------------
    const lineMatch = clean.match(/^([1-4])X([0-9])([0-9])([0-9]{3})([0-9]{4})([0-9]{4})(.*)$/i);
    if (lineMatch) {
      const orientation = parseInt(lineMatch[1], 10);
      const yDots = parseInt(lineMatch[5], 10);
      const xDots = parseInt(lineMatch[6], 10);
      const extra = lineMatch[7];

      let lengthMm = 10;
      let strokeWidth = 1;

      // Parâmetros de comprimento L...
      const lMatch = extra.match(/L([0-9]{4})([0-9]{4})/i);
      if (lMatch) {
        const lengthDots = parseInt(lMatch[1], 10);
        const thickDots = parseInt(lMatch[2], 10);
        lengthMm = Math.max(2, parseFloat(dotsToMm(lengthDots, dpi).toFixed(2)));
        strokeWidth = Math.max(1, Math.round(dotsToMm(thickDots, dpi)));
      }

      const x = parseFloat(dotsToMm(xDots, dpi).toFixed(2));
      const y = parseFloat(dotsToMm(yDots, dpi).toFixed(2));

      const isVertical = orientation === 2 || orientation === 4;

      const lineElem: LineElement = {
        id: `elem-line-${Date.now()}-${lineIndex}`,
        name: 'Linha Divisória PPLA',
        type: 'line',
        x,
        y,
        width: isVertical ? strokeWidth : lengthMm,
        height: isVertical ? lengthMm : Math.max(1, strokeWidth),
        strokeWidth,
        color: '#000000',
        locked: false,
        visible: true,
        visibilityRule,
        sourceReference: {
          state: 'unchanged',
          format: 'ppla',
          originalCommand: rawLine,
          originalLine: lineIndex,
        },
      };

      return { element: lineElem, commandType: 'line' };
    }

    // -----------------------------------------------------------------------
    // 4. COMANDO DE CÓDIGO DE BARRAS PPLA: 1F... / 1E... / 1A...
    // Sintaxe: [1-4]([A-Z])([0-9])([0-9])([0-9]{3})([0-9]{4})([0-9]{4})(.*)$
    // Exemplo: 1F1104000300050[[BARRA]]
    // -----------------------------------------------------------------------
    const barcodeMatch = clean.match(/^([1-4])([A-Z])([0-9])([0-9])([0-9]{3})([0-9]{4})([0-9]{4})(.*)$/i);
    if (barcodeMatch && !clean.startsWith('1X')) {
      const orientation = parseInt(barcodeMatch[1], 10);
      const barcodeType = barcodeMatch[2].toUpperCase();
      const narrowDots = parseInt(barcodeMatch[3], 10) || 1;
      const wideRatio = parseInt(barcodeMatch[4], 10) || 2;
      const heightDots = parseInt(barcodeMatch[5], 10) || 40;
      const yDots = parseInt(barcodeMatch[6], 10);
      const xDots = parseInt(barcodeMatch[7], 10);
      const rawData = barcodeMatch[8];

      const data = cleanPPLAControlTokens(rawData);
      const x = parseFloat(dotsToMm(xDots, dpi).toFixed(2));
      const y = parseFloat(dotsToMm(yDots, dpi).toFixed(2));
      const heightMm = parseFloat(dotsToMm(heightDots, dpi).toFixed(2));

      // Extrair macro ERP (se houver)
      const macroMatch = data.match(/\[\[([A-Z0-9_]+)[^\]]*\]\]/i);
      let field: string | undefined = undefined;
      let value = '7894900011517';

      if (macroMatch && !isControlToken(macroMatch[1])) {
        const parsedMacro = LegacyPreprocessor.parseMacro(macroMatch[0]);
        if (parsedMacro) {
          field = parsedMacro.field;
        }
      } else if (data) {
        value = data;
      }

      // Cálculo geométrico real da largura do barcode baseado no tipo e narrow dots (Nunca 35mm hardcoded)
      const narrowMm = dotsToMm(narrowDots, dpi);
      let calculatedWidthMm = 25;

      if (barcodeType === 'F') {
        // EAN-13: 95 módulos de dados + 10 módulos de quiet zone
        calculatedWidthMm = parseFloat((105 * narrowMm).toFixed(2));
      } else if (barcodeType === 'E') {
        // Code 128: 11 módulos por caractere + 35 módulos de overhead
        const charCount = Math.max(6, (field ? 12 : value.length));
        calculatedWidthMm = parseFloat(((11 * charCount + 35) * narrowMm).toFixed(2));
      } else {
        // Code 39 e outros
        const charCount = Math.max(6, (field ? 10 : value.length));
        calculatedWidthMm = parseFloat(((15 * charCount + 30) * narrowMm).toFixed(2));
      }

      const barcodeElem: BarcodeElement = {
        id: `elem-bc-${Date.now()}-${lineIndex}`,
        name: 'Código de Barras PPLA',
        type: 'barcode',
        format: barcodeType === 'F' ? 'EAN13' : 'CODE128',
        field: field || 'produto.ean',
        value,
        x,
        y,
        width: Math.max(12, calculatedWidthMm),
        height: Math.max(4, heightMm),
        showText: true,
        locked: false,
        visible: true,
        visibilityRule,
        sourceReference: {
          state: 'unchanged',
          format: 'ppla',
          originalCommand: rawLine,
          originalLine: lineIndex,
        },
      };

      return { element: barcodeElem, commandType: 'barcode' };
    }

    // -----------------------------------------------------------------------
    // 5. COMANDO DE TEXTO / PREÇO PPLA: 12110...
    // Sintaxe: [1-4][0-9A-Z][0-9][0-9][0-9]{3}[0-9]{4}[0-9]{4}[Data]
    // Exemplo: 121100000100018[[NOME,0,18]]
    // -----------------------------------------------------------------------
    const textMatch = clean.match(/^([1-4])([0-9A-Z])([0-9])([0-9])([0-9]{3})([0-9]{4})([0-9]{4})(.*)$/i);
    if (textMatch) {
      const orientationDigit = parseInt(textMatch[1], 10);
      const fontId = textMatch[2];
      const horizMult = parseInt(textMatch[3], 10) || 1;
      const vertMult = parseInt(textMatch[4], 10) || 1;
      const yDots = parseInt(textMatch[6], 10);
      const xDots = parseInt(textMatch[7], 10);
      const rawData = textMatch[8];

      // Limpar tokens de controle da string de dados
      const data = cleanPPLAControlTokens(rawData);
      if (!data) return {};

      const x = parseFloat(dotsToMm(xDots, dpi).toFixed(2));
      const y = parseFloat(dotsToMm(yDots, dpi).toFixed(2));

      // Mapeamento de Rotação
      let rotation: 0 | 90 | 180 | 270 = 0;
      if (orientationDigit === 2) rotation = 90;
      else if (orientationDigit === 3) rotation = 180;
      else if (orientationDigit === 4) rotation = 270;

      const fontDef = PPLA_FONT_MAP[fontId] || PPLA_FONT_MAP['2'];
      const fontSize = fontDef.baseFontSize * vertMult;
      const charWidthMm = fontDef.widthPerCharMm * horizMult;
      const textHeightMm = fontDef.heightMm * vertMult;

      // Detectar Macros ERP válidas dentro da string de dados (ignorando tokens de controle)
      const macroMatch = data.match(/\[\[([A-Z0-9_]+)(?:,([0-9]+),([0-9]+))?\]\]/i);
      const isControl = macroMatch ? isControlToken(macroMatch[1]) : false;

      // Verificar se é Preço
      const isPrice =
        !isControl &&
        (/\[\[(PRECO|PRECO_NORMAL|PROMOCAO|PRECO_PROMOCAO)\]\]/i.test(data) ||
          /R\$\s*\[\[/i.test(data));

      if (isPrice && macroMatch && !isControl) {
        const macroInfo = LegacyPreprocessor.parseMacro(macroMatch[0]);
        const isPromo = /PROMOCAO/i.test(macroMatch[1]);

        const priceElem: PriceElement = {
          id: `elem-price-${Date.now()}-${lineIndex}`,
          name: isPromo ? 'Preço Promocional PPLA' : 'Preço Normal PPLA',
          type: 'price',
          field: macroInfo ? macroInfo.field : 'produto.preco',
          prefix: 'R$',
          sampleValue: isPromo ? '7,99' : '9,99',
          fontFamily: fontDef.fontFamily,
          integerFontSize: Math.round(fontSize * 1.2),
          fractionFontSize: Math.round(fontSize * 0.9),
          currencyFontSize: Math.round(fontSize * 0.7),
          reducedCents: false, // Preserva layout fiel original sem forçar centavos reduzidos
          x,
          y,
          width: Math.max(10, parseFloat((6 * charWidthMm).toFixed(2))),
          height: Math.max(4, parseFloat(textHeightMm.toFixed(2))),
          color: isPromo ? '#ef4444' : '#0f172a',
          locked: false,
          visible: true,
          visibilityRule,
          sourceReference: {
            state: 'unchanged',
            format: 'ppla',
            originalCommand: rawLine,
            originalLine: lineIndex,
          },
        };

        return { element: priceElem, commandType: 'price' };
      }

      // Elemento de Texto Padrão
      let field: string | undefined = undefined;
      let transformations = undefined;
      let text = data;
      let name = 'Texto PPLA';

      if (macroMatch && !isControl) {
        const macroInfo = LegacyPreprocessor.parseMacro(macroMatch[0]);
        if (macroInfo) {
          field = macroInfo.field;
          transformations = macroInfo.transformations;
          if (macroInfo.field === 'produto.descricao') {
            name = 'Nome do Produto';
          } else if (!macroInfo.field.startsWith('custom.char')) {
            name = `Campo ${macroMatch[1]}`;
          }
        }
      }

      const textLength = Math.max(1, data.length);
      const widthMm = parseFloat((textLength * charWidthMm).toFixed(2));
      const heightMm = parseFloat(textHeightMm.toFixed(2));

      const textElem: TextElement = {
        id: `elem-text-${Date.now()}-${lineIndex}`,
        name,
        type: 'text',
        text,
        field,
        transformations,
        fontFamily: fontDef.fontFamily,
        fontSize,
        fontWeight: fontId === '3' || fontId === '4' || fontId === '5' ? 'bold' : 'normal',
        alignment: 'left',
        rotation,
        x,
        y,
        width: Math.max(4, widthMm),
        height: Math.max(2.5, heightMm),
        color: '#0f172a',
        locked: false,
        visible: true,
        visibilityRule,
        printerFontId: fontId,
        sourceReference: {
          state: 'unchanged',
          format: 'ppla',
          originalCommand: rawLine,
          originalLine: lineIndex,
        },
      };

      return { element: textElem, commandType: 'text' };
    }

    return { diagnosticMessage: `Comando preservado, mas ainda não possui representação visual homologada: "${clean}"` };
  }
}
