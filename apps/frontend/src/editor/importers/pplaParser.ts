import type {
  LabelDocument,
  LabelElement,
  TextElement,
  PriceElement,
  BarcodeElement,
  LineElement,
  RectangleElement,
  VisibilityRule,
} from '@witiquetas/label-schema';
import type {
  ASTNode,
  VisualASTNode,
  ConditionalASTNode,
  ConfigASTNode,
  LabelAST,
} from './astTypes';
import { LegacyPreprocessor, ERP_MACRO_MAP, invertVisibilityRule } from './legacyPreprocessor';
import { dotsToMm, mmToDots } from './pplbParser';
import type { ImportDiagnosticItem, ImportResult } from './types';

/**
 * Mapeamento de fontes PPLA para tamanho e família
 */
export const PPLA_FONT_MAP: Record<string, { fontFamily: string; baseFontSize: number; widthPerCharMm: number; heightMm: number }> = {
  '1': { fontFamily: 'Courier New', baseFontSize: 8, widthPerCharMm: 1.5, heightMm: 2.2 },
  '2': { fontFamily: 'Roboto', baseFontSize: 10, widthPerCharMm: 2.0, heightMm: 3.0 },
  '3': { fontFamily: 'Roboto', baseFontSize: 12, widthPerCharMm: 2.5, heightMm: 4.0 },
  '4': { fontFamily: 'Roboto', baseFontSize: 16, widthPerCharMm: 3.2, heightMm: 5.5 },
  '5': { fontFamily: 'Roboto', baseFontSize: 22, widthPerCharMm: 4.5, heightMm: 7.5 },
};

/**
 * Parser de Comandos PPLA (Argox / Datamax DPL / Legado ERP)
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
    const processedElse = condNode.elseNodes && condNode.elseNodes.length > 0
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
   * Converte nós pré-processados da AST em elementos nativos PPLA
   */
  static parse(content: string): ImportResult {
    const rawNodes = LegacyPreprocessor.preprocessLines(content);
    const diagnostics: ImportDiagnosticItem[] = [];
    const elements: LabelElement[] = [];
    const finalASTNodes: ASTNode[] = [];

    let widthMm = 100;
    let heightMm = 30;
    let dpi: 203 | 300 | 600 = 203;

    // Detectar configurações de tamanho se presentes (ex: M3500 -> 35mm, O0220, etc.)
    for (const node of rawNodes) {
      if (node.type === 'config') {
        const cmd = (node as ConfigASTNode).command.replace(/^\[\[CHAR02\]\]/, '').replace(/\[\[CHAR13\]\]$/, '').trim();
        if (/^M(\d+)/i.test(cmd)) {
          const match = cmd.match(/^M(\d+)/i);
          if (match) {
            const lengthParam = parseInt(match[1], 10);
            if (lengthParam > 500) {
              heightMm = Math.round(dotsToMm(lengthParam, dpi));
            } else if (lengthParam > 10) {
              heightMm = lengthParam;
            }
          }
        }
      }
    }

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

    const ast: LabelAST = {
      format: 'ppla',
      nodes: finalASTNodes,
      rawContent: content,
      dpi,
    };

    const document: LabelDocument = {
      schemaVersion: '1.0.0',
      id: `doc-ppla-${Date.now()}`,
      title: 'Etiqueta PPLA Importada',
      dimensions: {
        widthMm,
        heightMm,
        dpi,
      },
      elements,
      sourceFile: {
        rawText: content,
        format: 'ppla',
        ast,
      },
    };

    return {
      document,
      ast,
      diagnostics,
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
    const clean = rawLine.trim();
    if (!clean) return {};

    // -----------------------------------------------------------------------
    // 1. COMANDO DE LINHA / GRÁFICO PPLA: 1X...
    // Sintaxe: [1-4]X[HMult][VMult][SubType/3][Y/4][X/4][Params]
    // Exemplo: 1X1100000500010L000100002
    // -----------------------------------------------------------------------
    const lineMatch = clean.match(/^([1-4])X([0-9])([0-9])([0-9]{3})([0-9]{4})([0-9]{4})(.*)$/i);
    if (lineMatch) {
      const orientation = parseInt(lineMatch[1], 10);
      const yDots = parseInt(lineMatch[5], 10);
      const xDots = parseInt(lineMatch[6], 10);
      const extra = lineMatch[7];

      let widthMm = 50;
      let heightMm = 1;
      let strokeWidth = 1;

      // Parâmetros de comprimento L...
      const lMatch = extra.match(/L([0-9]{4})([0-9]{4})/i);
      if (lMatch) {
        const lengthDots = parseInt(lMatch[1], 10);
        const thickDots = parseInt(lMatch[2], 10);
        widthMm = parseFloat(dotsToMm(lengthDots, dpi).toFixed(2));
        strokeWidth = Math.max(1, Math.round(dotsToMm(thickDots, dpi)));
      }

      const x = parseFloat(dotsToMm(xDots, dpi).toFixed(2));
      const y = parseFloat(dotsToMm(yDots, dpi).toFixed(2));

      const lineElem: LineElement = {
        id: `elem-line-${Date.now()}-${lineIndex}`,
        name: 'Linha Divisória PPLA',
        type: 'line',
        x,
        y,
        width: Math.max(2, widthMm),
        height: Math.max(1, heightMm),
        strokeWidth,
        color: '#000000',
        locked: false,
        visible: true,
        visibilityRule,
        sourceReference: {
          state: 'imported',
          format: 'ppla',
          rawCommand: rawLine,
          originalLine: lineIndex,
        },
      };

      return { element: lineElem, commandType: 'line' };
    }

    // -----------------------------------------------------------------------
    // 2. COMANDO DE CÓDIGO DE BARRAS PPLA: 1F... / 1E...
    // Sintaxe: [1-4]([A-Z])([0-9])([0-9])([0-9]{3})([0-9]{4})([0-9]{4})(.*)$
    // Exemplo: 1F1104000300050[[BARRA]]
    // -----------------------------------------------------------------------
    const barcodeMatch = clean.match(/^([1-4])([A-Z])([0-9])([0-9])([0-9]{3})([0-9]{4})([0-9]{4})(.*)$/i);
    if (barcodeMatch && !clean.startsWith('1X')) {
      const orientation = parseInt(barcodeMatch[1], 10);
      const barcodeType = barcodeMatch[2].toUpperCase();
      const heightDots = parseInt(barcodeMatch[5], 10);
      const yDots = parseInt(barcodeMatch[6], 10);
      const xDots = parseInt(barcodeMatch[7], 10);
      const data = barcodeMatch[8];

      const x = parseFloat(dotsToMm(xDots, dpi).toFixed(2));
      const y = parseFloat(dotsToMm(yDots, dpi).toFixed(2));
      const heightMm = parseFloat(dotsToMm(heightDots || 40, dpi).toFixed(2));

      // Extrair macro ERP
      const macroMatch = data.match(/\[\[([A-Z0-9_]+)[^\]]*\]\]/i);
      let field = 'produto.ean';
      let value = '7894900011517';

      if (macroMatch) {
        const parsedMacro = LegacyPreprocessor.parseMacro(macroMatch[0]);
        if (parsedMacro) {
          field = parsedMacro.field;
        }
      } else if (data) {
        value = data.trim();
      }

      const barcodeElem: BarcodeElement = {
        id: `elem-bc-${Date.now()}-${lineIndex}`,
        name: 'Código de Barras PPLA',
        type: 'barcode',
        format: 'EAN13',
        field,
        value,
        x,
        y,
        width: 35,
        height: Math.max(5, heightMm),
        showText: true,
        locked: false,
        visible: true,
        visibilityRule,
        sourceReference: {
          state: 'imported',
          format: 'ppla',
          rawCommand: rawLine,
          originalLine: lineIndex,
        },
      };

      return { element: barcodeElem, commandType: 'barcode' };
    }

    // -----------------------------------------------------------------------
    // 3. COMANDO DE TEXTO / PREÇO PPLA: 12110...
    // Sintaxe: [1-4][0-9A-Z][0-9][0-9][0-9]{3}[0-9]{4}[0-9]{4}[Data]
    // Exemplo: 121100000100018[[NOME,0,18]]
    // -----------------------------------------------------------------------
    const textMatch = clean.match(/^([1-4])([0-9A-Z])([0-9])([0-9])([0-9]{3})([0-9]{4})([0-9]{4})(.*)$/i);
    if (textMatch) {
      const orientationDigit = parseInt(textMatch[1], 10);
      const fontId = textMatch[2];
      const horizMult = parseInt(textMatch[3], 10) || 1;
      const vertMult = parseInt(textMatch[4], 10) || 1;
      const subType = textMatch[5];
      const yDots = parseInt(textMatch[6], 10);
      const xDots = parseInt(textMatch[7], 10);
      const data = textMatch[8];

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

      // Detectar Macros ERP dentro da string de dados
      const macroMatch = data.match(/\[\[([A-Z0-9_]+)(?:,([0-9]+),([0-9]+))?\]\]/i);

      // Verificar se é Preço
      const isPrice =
        /\[\[(PRECO|PRECO_NORMAL|PROMOCAO|PRECO_PROMOCAO)\]\]/i.test(data) ||
        /R\$\s*\[\[/i.test(data);

      if (isPrice && macroMatch) {
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
          integerFontSize: Math.round(fontSize * 1.3),
          fractionFontSize: Math.round(fontSize * 0.8),
          currencyFontSize: Math.round(fontSize * 0.5),
          reducedCents: true,
          x,
          y,
          width: Math.max(15, parseFloat((8 * charWidthMm).toFixed(2))),
          height: Math.max(6, parseFloat(textHeightMm.toFixed(2))),
          color: isPromo ? '#ef4444' : '#0f172a',
          locked: false,
          visible: true,
          visibilityRule,
          sourceReference: {
            state: 'imported',
            format: 'ppla',
            rawCommand: rawLine,
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

      if (macroMatch) {
        const macroInfo = LegacyPreprocessor.parseMacro(macroMatch[0]);
        if (macroInfo) {
          field = macroInfo.field;
          transformations = macroInfo.transformations;
          if (macroInfo.field === 'produto.descricao') {
            name = 'Nome do Produto';
          } else if (macroInfo.field.startsWith('custom.')) {
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
        width: Math.max(5, widthMm),
        height: Math.max(3, heightMm),
        color: '#0f172a',
        locked: false,
        visible: true,
        visibilityRule,
        sourceReference: {
          state: 'imported',
          format: 'ppla',
          rawCommand: rawLine,
          originalLine: lineIndex,
        },
      };

      return { element: textElem, commandType: 'text' };
    }

    return { diagnosticMessage: `Comando PPLA não mapeado para elemento visual: "${clean}"` };
  }
}
