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
import { LegacyPreprocessor, ERP_MACRO_MAP } from './legacyPreprocessor';
import { calculatePPLBTextGeometry } from './pplbFontMetrics';
import { calculatePPLBBarcodeGeometry } from './pplbBarcodeMetrics';
import type { ImportDiagnosticItem, ImportResult } from './types';

/**
 * Converte Dots da impressora para Milímetros (precisão em ponto flutuante)
 * Fórmula física oficial: mm = (dots * 25.4) / dpi
 */
export function dotsToMm(dots: number, dpi: number = 203): number {
  return (dots * 25.4) / dpi;
}

/**
 * Converte Milímetros para Dots inteiros da impressora térmica
 * Fórmula física oficial: dots = Math.round((mm * dpi) / 25.4)
 */
export function mmToDots(mm: number, dpi: number = 203): number {
  return Math.round((mm * dpi) / 25.4);
}

/**
 * ETAPA B: Parser de Comandos PPLB / Eltron / Legado
 */
export class PPLBParser {
  /**
   * Converte nós pré-processados da AST em elementos nativos e preenche a AST
   */
  static parse(content: string): ImportResult {
    const rawNodes = LegacyPreprocessor.preprocessLines(content);
    const diagnostics: ImportDiagnosticItem[] = [];
    const elements: LabelElement[] = [];
    const finalASTNodes: ASTNode[] = [];

    let widthMm = 100;
    let heightMm = 30;
    let widthDots: number | undefined = undefined;
    let heightDots: number | undefined = undefined;
    let gapDots: number | undefined = undefined;
    let gapMm: number | undefined = undefined;
    let rawQCommand: string | undefined = undefined;
    let rawqCommand: string | undefined = undefined;
    let dpi: 203 | 300 | 600 = 203;

    // 1. Detectar Dimensões a partir dos comandos de configuração (Q e q estritos)
    for (const node of rawNodes) {
      if (node.type === 'config') {
        const cmd = (node as ConfigASTNode).command;

        // Comando Q (Maiúsculo estrito): Altura da etiqueta e Gap entre etiquetas
        // Sintaxe: Q[label_length_dots],[gap_dots] (Ex: Q240,024 ou Q240,24)
        if (cmd.startsWith('Q')) {
          const qMatch = cmd.match(/^Q(\d+)(?:,(\d+))?$/);
          if (qMatch) {
            const dotsH = parseInt(qMatch[1], 10);
            if (dotsH > 0) {
              heightDots = dotsH;
              heightMm = dotsToMm(dotsH, dpi);
              rawQCommand = cmd;
            }
            if (qMatch[2] !== undefined) {
              const dotsG = parseInt(qMatch[2], 10);
              gapDots = dotsG;
              gapMm = dotsToMm(dotsG, dpi);
            }
          }
        }

        // Comando q (Minúsculo estrito): Largura total imprimível
        // Sintaxe: q[label_width_dots] (Ex: q831 ou q800)
        if (cmd.startsWith('q')) {
          const qMatch = cmd.match(/^q(\d+)$/);
          if (qMatch) {
            const dotsW = parseInt(qMatch[1], 10);
            if (dotsW > 0) {
              widthDots = dotsW;
              widthMm = dotsToMm(dotsW, dpi);
              rawqCommand = cmd;
            }
          }
        }
      }
    }

    diagnostics.push({
      status: 'converted',
      originalSnippet: `Dimensões: ${widthMm.toFixed(1)}x${heightMm.toFixed(1)} mm (${dpi} DPI)`,
      message: `Dimensões físicas detectadas: ${widthMm.toFixed(2)} mm x ${heightMm.toFixed(2)} mm (${dpi} DPI)${gapDots ? `, Gap: ${gapDots} dots` : ''}`,
    });

    let elementIndex = 0;

    // 2. Processar cada nó da AST
    for (const node of rawNodes) {
      if (node.type === 'comment' || node.type === 'config' || node.type === 'quantity') {
        finalASTNodes.push(node);
        continue;
      }

      if (node.type === 'conditional') {
        const condNode = node as ConditionalASTNode;
        const processedChildren: ASTNode[] = [];

        for (const child of condNode.children) {
          if (child.type === 'raw') {
            const parsed = this.parseSingleCommand(child.originalText, child.line, dpi, condNode.rule);
            if (parsed.element) {
              elements.push(parsed.element);
              processedChildren.push({
                type: 'visual',
                line: child.line,
                originalText: child.originalText,
                elementId: parsed.element.id,
                commandType: parsed.commandType,
              } as VisualASTNode);
            } else {
              processedChildren.push(child);
            }
          } else {
            processedChildren.push(child);
          }
        }

        finalASTNodes.push({
          ...condNode,
          children: processedChildren,
        });
        continue;
      }

      if (node.type === 'raw') {
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
        } else {
          finalASTNodes.push(node);
        }
      }
    }

    // 3. Montar o documento de etiqueta final
    const configCommands = finalASTNodes
      .filter((n) => n.type === 'config')
      .map((n: any) => n.command);

    const comments = finalASTNodes
      .filter((n) => n.type === 'comment')
      .map((n: any) => ({ line: n.line, text: n.originalText }));

    const printQuantityNode: any = finalASTNodes.find((n) => n.type === 'quantity');
    const printQuantity = printQuantityNode ? printQuantityNode.command : undefined;

    const astSummary = {
      totalNodes: finalASTNodes.length,
      commentsCount: finalASTNodes.filter((n) => n.type === 'comment').length,
      configCommandsCount: finalASTNodes.filter((n) => n.type === 'config').length,
      conditionalsCount: finalASTNodes.filter((n) => n.type === 'conditional').length,
      visualElementsCount: elements.length,
      rawCount: finalASTNodes.filter((n) => n.type === 'raw').length,
    };

    const document: LabelDocument = {
      schemaVersion: 1,
      title: 'Etiqueta Importada (Legado)',
      dimensions: {
        widthMm,
        heightMm,
        dpi,
        orientation: widthMm >= heightMm ? 'landscape' : 'portrait',
        gapMm,
        widthDots,
        heightDots,
        gapDots,
        rawQCommand,
        rawqCommand,
      },
      elements,
      sourceFile: {
        rawText: content,
        format: 'pplb',
        importedAt: new Date().toISOString(),
        configCommands: finalASTNodes.filter((n) => n.type === 'config').map((n: any) => n.command),
        comments: finalASTNodes.filter((n) => n.type === 'comment').map((n: any) => ({ line: n.line, text: n.originalText })),
        rawCommands: finalASTNodes.filter((n) => n.type === 'raw').map((n: any) => ({ line: n.line, text: n.originalText })),
      },
    };

    return {
      formatId: 'pplb-legacy',
      formatName: 'PPLB / Eltron / Legado ERP',
      document,
      diagnostics,
      rawContent: content,
      elementsCount: elements.length,
      warningsCount: diagnostics.filter((d) => d.status !== 'converted').length,
    };
  }

  /**
   * Converte uma única linha de comando (ex: A80,10,0,3,1,1,N,"..." ou B80,65,0,1,2,5,50,B,"...")
   */
  private static parseSingleCommand(
    commandLine: string,
    lineIdx: number,
    dpi: number,
    inheritedRule?: VisibilityRule
  ): { element?: LabelElement; commandType: 'A' | 'B' | 'L' | 'X' | 'W' | 'generic' } {
    const trimmed = commandLine.trim();

    // =========================================================================
    // COMANDO A: Texto / Preço
    // Sintaxe: A[x],[y],[rotation],[font],[h_mult],[v_mult],[reverse],"text"
    // =========================================================================
    if (trimmed.startsWith('A')) {
      const match = trimmed.match(/^A(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),([NR]),"?(.*?)"?$/);
      if (match) {
        const xDots = parseInt(match[1], 10);
        const yDots = parseInt(match[2], 10);
        const rotationVal = parseInt(match[3], 10);
        const fontNum = parseInt(match[4], 10);
        const hMult = parseInt(match[5], 10) || 1;
        const vMult = parseInt(match[6], 10) || 1;
        const reversePrint = match[7]?.toUpperCase() === 'R';
        const rawText = match[8] || '';

        const xMm = dotsToMm(xDots, dpi);
        const yMm = dotsToMm(yDots, dpi);
        const rotation = rotationVal === 1 ? 90 : rotationVal === 2 ? 180 : rotationVal === 3 ? 270 : 0;

        // Verificar se é elemento de Preço
        const isPromoPrice = /\[\[(PROMOCAO|PRECO_PROMOCAO)\]\]/i.test(rawText);
        const isNormalPrice = /\[\[(PRECO|PRECO_NORMAL)\]\]/i.test(rawText);

        if (isPromoPrice || isNormalPrice) {
          const hasPrefix = /R\$/i.test(rawText) || /R\s*\$/i.test(rawText);
          const charCapacity = hasPrefix ? 10 : 7; // Capacidade padrão de preço (ex: "R$ 999,99")
          const geo = calculatePPLBTextGeometry(fontNum, hMult, vMult, charCapacity, dpi);

          const priceElement: PriceElement = {
            id: `elem-price-${lineIdx}`,
            name: isPromoPrice ? 'Preço Promocional' : 'Preço Normal',
            type: 'price',
            field: isPromoPrice ? 'produto.promocao.preco' : 'produto.preco',
            prefix: hasPrefix ? 'R$' : '',
            sampleValue: isPromoPrice ? '7,99' : '9,99',
            reducedCents: true,
            fontFamily: geo.fontMetric.fallbackFontFamily.split(',')[0].trim(),
            x: xMm,
            y: yMm,
            width: geo.widthMm,
            height: geo.heightMm,
            rotation,
            color: isPromoPrice ? '#ef4444' : '#1e293b',
            visibilityRule: inheritedRule,
            printerFontId: fontNum,
            horizontalMultiplier: hMult,
            verticalMultiplier: vMult,
            scaleX: hMult !== vMult ? hMult / vMult : 1.0,
            reversePrint,
            sourceReference: {
              originalCommand: commandLine,
              originalLine: lineIdx,
              format: 'pplb',
              state: 'unchanged',
            },
          };
          return { element: priceElement, commandType: 'A' };
        }

        // Elemento Texto Normal
        const macroMatch = rawText.match(/\[\[([^\]]+)\]\]/);
        let fieldBinding: string | undefined = undefined;
        let transformations: any[] | undefined = undefined;
        let textContent = rawText;
        let charCapacity = rawText.length;

        if (macroMatch) {
          const preprocessed = LegacyPreprocessor.parseMacro(macroMatch[0]);
          if (preprocessed) {
            fieldBinding = preprocessed.field;
            transformations = preprocessed.transformations;
            textContent = rawText.replace(macroMatch[0], `{${preprocessed.field}}`);

            // Se for substring com tamanho explícito (ex: [[NOME,0,18]] -> capacidade = 18 caracteres)
            if (preprocessed.transformations && preprocessed.transformations[0]?.length) {
              const prefixLen = rawText.indexOf(macroMatch[0]);
              const suffixLen = rawText.length - (prefixLen + macroMatch[0].length);
              charCapacity = prefixLen + preprocessed.transformations[0].length + suffixLen;
            } else {
              // Capacidade padrão para macro completa
              const prefixLen = rawText.indexOf(macroMatch[0]);
              const suffixLen = rawText.length - (macroMatch[0].length + prefixLen);
              charCapacity = prefixLen + 20 + suffixLen;
            }
          }
        }

        const geo = calculatePPLBTextGeometry(fontNum, hMult, vMult, Math.max(1, charCapacity), dpi);

        const textElement: TextElement = {
          id: `elem-text-${lineIdx}`,
          name: fieldBinding ? `Texto (${fieldBinding.split('.').pop()})` : 'Texto',
          type: 'text',
          text: textContent,
          field: fieldBinding,
          fontFamily: geo.fontMetric.fallbackFontFamily.split(',')[0].trim(),
          fontSize: geo.fontSizePt,
          fontWeight: fontNum >= 3 ? 'bold' : 'normal',
          x: xMm,
          y: yMm,
          width: geo.widthMm,
          height: geo.heightMm,
          rotation,
          visibilityRule: inheritedRule,
          transformations,
          autoFit: false,
          singleLine: true,
          printerFontId: fontNum,
          horizontalMultiplier: hMult,
          verticalMultiplier: vMult,
          scaleX: hMult !== vMult ? hMult / vMult : 1.0,
          reversePrint,
          sourceReference: {
            originalCommand: commandLine,
            originalLine: lineIdx,
            format: 'pplb',
            state: 'unchanged',
          },
        };
        return { element: textElement, commandType: 'A' };
      }
    }

    // =========================================================================
    // COMANDO B: Código de Barras
    // Sintaxe: B[x],[y],[rotation],[type],[narrow],[wide],[height],[human_readable],"data"
    // =========================================================================
    if (trimmed.startsWith('B')) {
      const match = trimmed.match(/^B(\d+),(\d+),(\d+),([A-Za-z0-9]+),(\d+),(\d+),(\d+),([BN]),"?(.*?)"?$/);
      if (match) {
        const xDots = parseInt(match[1], 10);
        const yDots = parseInt(match[2], 10);
        const rotationVal = parseInt(match[3], 10);
        const rawType = match[4];
        const narrowDots = parseInt(match[5], 10) || 2;
        const wideDots = parseInt(match[6], 10) || 4;
        const heightDots = parseInt(match[7], 10) || 30;
        const showHuman = match[8].toUpperCase() === 'B';
        const rawData = match[9] || '';

        const xMm = dotsToMm(xDots, dpi);
        const yMm = dotsToMm(yDots, dpi);
        const rotation = rotationVal === 1 ? 90 : rotationVal === 2 ? 180 : rotationVal === 3 ? 270 : 0;

        const isMacro = /\[\[(BARRA|BARRAS|EAN|GTIN)\]\]/i.test(rawData);

        // Geometria precisa derivada da simbologia e parâmetros nativos PPLB
        const geo = calculatePPLBBarcodeGeometry(
          rawType,
          narrowDots,
          wideDots,
          heightDots,
          rawData,
          showHuman,
          dpi
        );

        const barcodeElement: BarcodeElement = {
          id: `elem-barcode-${lineIdx}`,
          name: 'Código de Barras',
          type: 'barcode',
          format: geo.canonicalFormat,
          field: isMacro ? 'produto.ean' : undefined,
          value: isMacro ? '7891234567895' : rawData,
          showText: showHuman,
          x: xMm,
          y: yMm,
          width: geo.widthMm,
          height: geo.heightMm,
          rotation,
          visibilityRule: inheritedRule,
          sourceBarcodeType: rawType,
          narrowBarDots: narrowDots,
          wideBarDots: wideDots,
          barcodeHeightDots: heightDots,
          sourceReference: {
            originalCommand: commandLine,
            originalLine: lineIdx,
            format: 'pplb',
            state: 'unchanged',
          },
        };
        return { element: barcodeElement, commandType: 'B' };
      }
    }

    // =========================================================================
    // COMANDO LO / L: Linha
    // Sintaxe: LO[x],[y],[width],[height] ou L[x],[y],[width],[height]
    // =========================================================================
    if (trimmed.startsWith('LO') || trimmed.startsWith('L')) {
      const match = trimmed.match(/^L(?:O)?(\d+),(\d+),(\d+),(\d+)/);
      if (match) {
        const xDots = parseInt(match[1], 10);
        const yDots = parseInt(match[2], 10);
        const wDots = parseInt(match[3], 10);
        const hDots = parseInt(match[4], 10);

        const lineElement: LineElement = {
          id: `elem-line-${lineIdx}`,
          name: 'Linha',
          type: 'line',
          x: dotsToMm(xDots, dpi),
          y: dotsToMm(yDots, dpi),
          width: dotsToMm(wDots, dpi),
          height: Math.max(1, dotsToMm(hDots, dpi)),
          strokeWidth: Math.max(1, Math.round(dotsToMm(hDots, dpi))),
          color: '#000000',
          visibilityRule: inheritedRule,
          sourceReference: {
            originalCommand: commandLine,
            originalLine: lineIdx,
            format: 'pplb',
            state: 'unchanged',
          },
        };
        return { element: lineElement, commandType: 'L' };
      }
    }

    // =========================================================================
    // COMANDO X: Retângulo / Moldura
    // Sintaxe: X[x],[y],[thickness],[endX],[endY]
    // =========================================================================
    if (trimmed.startsWith('X')) {
      const match = trimmed.match(/^X(\d+),(\d+),(\d+),(\d+),(\d+)/);
      if (match) {
        const x1 = parseInt(match[1], 10);
        const y1 = parseInt(match[2], 10);
        const thickness = parseInt(match[3], 10);
        const x2 = parseInt(match[4], 10);
        const y2 = parseInt(match[5], 10);

        const rectElement: RectangleElement = {
          id: `elem-rect-${lineIdx}`,
          name: 'Moldura',
          type: 'rectangle',
          x: dotsToMm(x1, dpi),
          y: dotsToMm(y1, dpi),
          width: Math.max(5, dotsToMm(x2 - x1, dpi)),
          height: Math.max(5, dotsToMm(y2 - y1, dpi)),
          strokeWidth: Math.max(1, dotsToMm(thickness, dpi)),
          strokeColor: '#000000',
          fillColor: 'transparent',
          visibilityRule: inheritedRule,
          sourceReference: {
            originalCommand: commandLine,
            originalLine: lineIdx,
            format: 'pplb',
            state: 'unchanged',
          },
        };
        return { element: rectElement, commandType: 'X' };
      }
    }

    return { commandType: 'generic' };
  }
}
