import type {
  LabelDocument,
  LabelElement,
  TextElement,
  PriceElement,
  BarcodeElement,
  LineElement,
  RectangleElement,
} from '@witiquetas/label-schema';
import { mmToDots } from './pplbParser';

export interface DiffSummary {
  modifiedCount: number;
  createdCount: number;
  deletedCount: number;
  preservedCommentsCount: number;
  preservedConfigCommandsCount: number;
  preservedConditionalsCount: number;
  lines: Array<{
    type: 'unchanged' | 'modified' | 'added' | 'deleted';
    originalLine?: string;
    newLine?: string;
  }>;
}

export interface RoundTripResult {
  compiledCode: string;
  diffSummary: DiffSummary;
}

/**
 * Compilador / Serializador de Round-Trip para Modelos Legados / PPLB
 * Garante 100% de preservação de comentários, comandos não interpretados, macros e configurações
 */
export class LegacyCompiler {
  /**
   * Compila o LabelDocument de volta para o formato original PPLB / Legado
   */
  static compile(document: LabelDocument): RoundTripResult {
    const rawOriginal = document.sourceFile?.rawText;
    const dpi = document.dimensions.dpi || 203;

    // Se não houver arquivo de origem, compila do zero a partir dos elementos nativos
    if (!rawOriginal) {
      return this.compileFromScratch(document);
    }

    const originalLines = rawOriginal.split(/\r?\n/);
    const compiledLines: string[] = [];
    const diffLines: DiffSummary['lines'] = [];

    let modifiedCount = 0;
    let createdCount = 0;
    let deletedCount = 0;
    let preservedCommentsCount = 0;
    let preservedConfigCommandsCount = 0;
    let preservedConditionalsCount = 0;

    // Mapeamento de elementos atuais por originalCommand ou originalLine
    const elementsMapByCommand = new Map<string, LabelElement>();
    const elementsMapByLine = new Map<number, LabelElement>();
    const processedElementIds = new Set<string>();

    document.elements.forEach((el) => {
      if (el.sourceReference?.originalCommand) {
        elementsMapByCommand.set(el.sourceReference.originalCommand.trim(), el);
      }
      if (el.sourceReference?.originalLine !== undefined) {
        elementsMapByLine.set(el.sourceReference.originalLine, el);
      }
    });

    for (let i = 0; i < originalLines.length; i++) {
      const origLine = originalLines[i];
      const trimmed = origLine.trim();

      if (!trimmed) {
        compiledLines.push(origLine);
        diffLines.push({ type: 'unchanged', originalLine: origLine, newLine: origLine });
        continue;
      }

      // 1. Comentários preservados intactos
      if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        compiledLines.push(origLine);
        diffLines.push({ type: 'unchanged', originalLine: origLine, newLine: origLine });
        preservedCommentsCount++;
        continue;
      }

      // 2. Configurações de Dimensões Físicas: Q (Altura/Gap) e q (Largura)
      if (trimmed.startsWith('Q')) {
        const qMatch = trimmed.match(/^Q(\d+)(?:,(\d+))?$/);
        if (qMatch) {
          const origHDots = parseInt(qMatch[1], 10);
          const origGapStr = qMatch[2];
          const currentHDots = document.dimensions.heightDots || mmToDots(document.dimensions.heightMm, dpi);
          const currentGapDots = document.dimensions.gapDots !== undefined
            ? document.dimensions.gapDots
            : (document.dimensions.gapMm !== undefined ? mmToDots(document.dimensions.gapMm, dpi) : undefined);

          const isHeightSame = origHDots === currentHDots;
          const isGapSame = origGapStr === undefined
            ? currentGapDots === undefined
            : (currentGapDots !== undefined && parseInt(origGapStr, 10) === currentGapDots);

          if (isHeightSame && isGapSame) {
            compiledLines.push(origLine);
            diffLines.push({ type: 'unchanged', originalLine: origLine, newLine: origLine });
            preservedConfigCommandsCount++;
          } else {
            let gapStr = '';
            if (currentGapDots !== undefined) {
              const padLen = origGapStr ? Math.max(origGapStr.length, String(currentGapDots).length) : 0;
              gapStr = `,${padLen > 0 ? String(currentGapDots).padStart(padLen, '0') : currentGapDots}`;
            }
            const newQLine = `Q${currentHDots}${gapStr}`;
            compiledLines.push(newQLine);
            diffLines.push({ type: 'modified', originalLine: origLine, newLine: newQLine });
            modifiedCount++;
          }
          continue;
        }
      }

      if (trimmed.startsWith('q')) {
        const qMatch = trimmed.match(/^q(\d+)$/);
        if (qMatch) {
          const origWDots = parseInt(qMatch[1], 10);
          const currentWDots = document.dimensions.widthDots || mmToDots(document.dimensions.widthMm, dpi);

          if (origWDots === currentWDots) {
            compiledLines.push(origLine);
            diffLines.push({ type: 'unchanged', originalLine: origLine, newLine: origLine });
            preservedConfigCommandsCount++;
          } else {
            const newqLine = `q${currentWDots}`;
            compiledLines.push(newqLine);
            diffLines.push({ type: 'modified', originalLine: origLine, newLine: newqLine });
            modifiedCount++;
          }
          continue;
        }
      }

      // 3. Demais Configurações de Impressora preservadas intactas
      if (
        /^(I8|r[N|Y]|S\d+|D\d+|ZT|JF|OD|R\d+,\d+|f\d+|N|\^XA|\^XZ|\^PW\d+|\^LL\d+|LC\d+|H|O\d+|M\d+|\[\[CHAR02\]\]|E$)/i.test(trimmed) &&
        !trimmed.startsWith('A') &&
        !trimmed.startsWith('B') &&
        !trimmed.startsWith('L') &&
        !trimmed.startsWith('X') &&
        !/^[1-4][0-9A-Z][0-9]{2}[0-9]{3}[0-9]{4}[0-9]{4}/.test(trimmed)
      ) {
        compiledLines.push(origLine);
        diffLines.push({ type: 'unchanged', originalLine: origLine, newLine: origLine });
        preservedConfigCommandsCount++;
        continue;
      }

      // 3. Quantidade de Impressão (ex: P[[QUANTIDADE]], Q[[QUANTIDADE]], P1)
      if (/^[PQ](\[\[[A-Z0-9_]+\]\]|\d+)$/i.test(trimmed)) {
        compiledLines.push(origLine);
        diffLines.push({ type: 'unchanged', originalLine: origLine, newLine: origLine });
        continue;
      }

      // 4. Blocos Condicionais Inline e Encadeados: [[SE]]{{cond1}}[[SE]]{{cond2}}{{comando}}
      const inlineCondMatch = trimmed.match(/^((?:\[\[SE\]\]\{\{[^}]+\}\})+)(.+)$/i);
      if (inlineCondMatch) {
        const condPart = inlineCondMatch[1];
        let innerCmd = inlineCondMatch[2];
        const isBracketEnclosed = innerCmd.startsWith('{{') && innerCmd.endsWith('}}');
        if (isBracketEnclosed) {
          innerCmd = innerCmd.slice(2, -2);
        }

        // Buscar elemento correspondente
        const element = elementsMapByCommand.get(innerCmd.trim()) || elementsMapByLine.get(i + 1);

        if (!element) {
          // Elemento foi excluído
          deletedCount++;
          diffLines.push({ type: 'deleted', originalLine: origLine });
          continue;
        }

        processedElementIds.add(element.id);
        const state = element.sourceReference?.state || 'unchanged';

        if (state === 'unchanged' || state === 'imported') {
          compiledLines.push(origLine);
          diffLines.push({ type: 'unchanged', originalLine: origLine, newLine: origLine });
          preservedConditionalsCount++;
        } else {
          // Elemento foi alterado: recompilar o comando interno
          const isPpla = document.sourceFile?.format === 'ppla';
          const newInnerCmd = isPpla ? this.serializePPLAElement(element, dpi) : this.serializeSingleElement(element, dpi);
          const newCondLine = isBracketEnclosed ? `${condPart}{{${newInnerCmd}}}` : `${condPart}${newInnerCmd}`;
          compiledLines.push(newCondLine);
          diffLines.push({ type: 'modified', originalLine: origLine, newLine: newCondLine });
          modifiedCount++;
          preservedConditionalsCount++;
        }
        continue;
      }

      // 4.1 Cabeçalho de Condicional Multilinha: [[SE]]{{condição}}
      const multilineCondMatch = trimmed.match(/^\[\[SE\]\]\s*\{\{([^}]+)\}\}$/i);
      if (multilineCondMatch) {
        compiledLines.push(origLine);
        diffLines.push({ type: 'unchanged', originalLine: origLine, newLine: origLine });
        preservedConditionalsCount++;
        continue;
      }

      // 4.2 Divisor [[SENAO]] e Fechamento [[FIMSE]]
      if (/^\[\[(SENAO|ELSE|FIMSE|FIM_SE|ENDIF)\]\]$/i.test(trimmed)) {
        compiledLines.push(origLine);
        diffLines.push({ type: 'unchanged', originalLine: origLine, newLine: origLine });
        continue;
      }

      // 5. Comandos Visuais Diretos (A, B, L, X, ou Comandos Posicionais PPLA 12110...)
      const element = elementsMapByCommand.get(trimmed) || elementsMapByLine.get(i + 1);

      if (element) {
        processedElementIds.add(element.id);
        const state = element.sourceReference?.state || 'unchanged';

        if (state === 'unchanged' || state === 'imported') {
          compiledLines.push(origLine);
          diffLines.push({ type: 'unchanged', originalLine: origLine, newLine: origLine });
        } else {
          const isPpla = document.sourceFile?.format === 'ppla';
          const newLine = isPpla ? this.serializePPLAElement(element, dpi) : this.serializeSingleElement(element, dpi);
          compiledLines.push(newLine);
          diffLines.push({ type: 'modified', originalLine: origLine, newLine });
          modifiedCount++;
        }
        continue;
      }

      // 6. Comandos RAW não associados a nenhum elemento existente
      if (/^(A\d+|B\d+|LO\d+|X\d+|W\d+|[1-4][0-9A-Z][0-9]{2}[0-9]{3}[0-9]{4}[0-9]{4})/.test(trimmed)) {
        deletedCount++;
        diffLines.push({ type: 'deleted', originalLine: origLine });
      } else {
        // Se era outro comando genérico ou de configuração, preserva
        compiledLines.push(origLine);
        diffLines.push({ type: 'unchanged', originalLine: origLine, newLine: origLine });
      }
    }

    // 7. Adicionar novos elementos criados pelo usuário que não estavam no arquivo original
    const newElements = document.elements.filter((el) => !processedElementIds.has(el.id));
    if (newElements.length > 0) {
      const isPpla = document.sourceFile?.format === 'ppla';
      const lastPIndex = compiledLines.findLastIndex((l) => /^[PQ](\[\[|\d+)/i.test(l.trim()) || /^E\s*$/i.test(l.trim()));
      const insertAt = lastPIndex !== -1 ? lastPIndex : compiledLines.length;

      newElements.forEach((newEl) => {
        createdCount++;
        const newCmd = isPpla ? this.serializePPLAElement(newEl, dpi) : this.serializeSingleElement(newEl, dpi);
        const lineContent = newEl.visibilityRule
          ? `[[SE]]{{[[${newEl.visibilityRule.field.split('.').pop()?.toUpperCase()}]]${newEl.visibilityRule.operator}${newEl.visibilityRule.value}}}{{${newCmd}}}`
          : newCmd;

        compiledLines.splice(insertAt, 0, lineContent);
        diffLines.push({ type: 'added', newLine: lineContent });
      });
    }

    return {
      compiledCode: compiledLines.join('\n'),
      diffSummary: {
        modifiedCount,
        createdCount,
        deletedCount,
        preservedCommentsCount,
        preservedConfigCommandsCount,
        preservedConditionalsCount,
        lines: diffLines,
      },
    };
  }

  /**
   * Serializa um elemento individual do Witiquetas para comando PPLB
   */
  private static serializeSingleElement(elem: LabelElement, dpi: number): string {
    const xDots = mmToDots(elem.x, dpi);
    const yDots = mmToDots(elem.y, dpi);
    const rotationVal = elem.rotation === 90 ? 1 : elem.rotation === 180 ? 2 : elem.rotation === 270 ? 3 : 0;

    switch (elem.type) {
      case 'price': {
        const p = elem as PriceElement;
        const prefix = p.prefix ? `${p.prefix} ` : '';
        const macroName = p.field.includes('promocao') ? 'PROMOCAO' : 'PRECO';
        const fontNum = p.printerFontId || 4;
        const hMult = p.horizontalMultiplier || 2;
        const vMult = p.verticalMultiplier || 2;
        const reverse = p.reversePrint ? 'R' : 'N';
        return `A${xDots},${yDots},${rotationVal},${fontNum},${hMult},${vMult},${reverse},"${prefix}[[${macroName}]]"`;
      }

      case 'barcode': {
        const b = elem as BarcodeElement;
        const hDots = b.barcodeHeightDots || mmToDots(b.height, dpi);
        const narrow = b.narrowBarDots || 2;
        const wide = b.wideBarDots || 4;
        const showHuman = b.showText !== false ? 'B' : 'N';
        const typeCode = b.sourceBarcodeType || (b.format === 'EAN13' ? 'E30' : b.format === 'EAN8' ? '8' : '1');

        let macroVal = b.value;
        if (b.sourceReference?.originalCommand) {
          const matchMacro = b.sourceReference.originalCommand.match(/"(\[\[.*?\]\])"/);
          if (matchMacro) {
            macroVal = matchMacro[1];
          }
        }
        if (!macroVal && b.field) {
          macroVal = b.field === 'produto.ean' ? '[[BARRA]]' : `[[${b.field.split('.').pop()?.toUpperCase()}]]`;
        }

        return `B${xDots},${yDots},${rotationVal},${typeCode},${narrow},${wide},${hDots},${showHuman},"${macroVal}"`;
      }

      case 'text': {
        const t = elem as TextElement;
        const fontNum = t.printerFontId || (t.fontWeight === 'bold' ? 4 : 2);
        const hMult = t.horizontalMultiplier || 1;
        const vMult = t.verticalMultiplier || 1;
        const reverse = t.reversePrint ? 'R' : 'N';
        let textVal = t.text;

        // Recuperar nome exato da macro original caso existente
        let origMacroName: string | undefined = undefined;
        if (t.sourceReference?.originalCommand) {
          const m = t.sourceReference.originalCommand.match(/\[\[([A-Z0-9_]+)/i);
          if (m) origMacroName = m[1].toUpperCase();
        }

        const fallbackMacroName =
          t.field === 'produto.descricao'
            ? 'NOME'
            : t.field === 'produto.ean'
            ? 'BARRA'
            : t.field === 'produto.codigoInterno'
            ? 'CODIGO'
            : t.field?.split('.').pop()?.toUpperCase() || 'NOME';

        const macroName = origMacroName || fallbackMacroName;

        // Se tiver recorte de substring registrado
        if (t.transformations && t.transformations.length > 0) {
          const sub = t.transformations[0];
          if (sub.type === 'substring') {
            textVal = `[[${macroName},${sub.start},${sub.length}]]`;
          }
        } else if (t.field) {
          textVal = `[[${macroName}]]`;
        }

        return `A${xDots},${yDots},${rotationVal},${fontNum},${hMult},${vMult},${reverse},"${textVal}"`;
      }

      case 'line': {
        const l = elem as LineElement;
        const wDots = mmToDots(l.width, dpi);
        const hDots = Math.max(1, mmToDots(l.strokeWidth, dpi));
        return `LO${xDots},${yDots},${wDots},${hDots}`;
      }

      case 'rectangle': {
        const r = elem as RectangleElement;
        const endX = xDots + mmToDots(r.width, dpi);
        const endY = yDots + mmToDots(r.height, dpi);
        const thick = Math.max(1, mmToDots(r.strokeWidth, dpi));
        return `X${xDots},${yDots},${thick},${endX},${endY}`;
      }

      default:
        return `// Elemento não suportado nativamente em PPLB: ${elem.type}`;
    }
  }

  /**
   * Serializa um elemento individual do Witiquetas para comando PPLA
   */
  private static serializePPLAElement(elem: LabelElement, dpi: number): string {
    const xDots = mmToDots(elem.x, dpi);
    const yDots = mmToDots(elem.y, dpi);
    const xStr = String(xDots).padStart(4, '0');
    const yStr = String(yDots).padStart(4, '0');
    const orientation = elem.rotation === 90 ? '2' : elem.rotation === 180 ? '3' : elem.rotation === 270 ? '4' : '1';

    switch (elem.type) {
      case 'price': {
        const p = elem as PriceElement;
        const fontNum = '2';
        const hMult = '1';
        const vMult = '1';
        const subType = '000';
        const macroName = p.field.includes('promocao') ? 'PROMOCAO' : 'PRECO';
        const prefix = p.prefix ? `${p.prefix} ` : '';
        return `${orientation}${fontNum}${hMult}${vMult}${subType}${yStr}${xStr}${prefix}[[${macroName}]]`;
      }

      case 'barcode': {
        const b = elem as BarcodeElement;
        const hDots = String(b.barcodeHeightDots || mmToDots(b.height, dpi)).padStart(3, '0');
        let macroVal = b.value;
        if (b.field === 'produto.ean') {
          macroVal = '[[BARRA]]';
        } else if (b.field) {
          macroVal = `[[${b.field.split('.').pop()?.toUpperCase()}]]`;
        }
        return `${orientation}F11${hDots}${yStr}${xStr}${macroVal || '[[BARRA]]'}`;
      }

      case 'line': {
        const l = elem as LineElement;
        const lenDots = String(mmToDots(l.width, dpi)).padStart(4, '0');
        const thickDots = String(l.strokeWidth || 1).padStart(4, '0');
        return `${orientation}X11000${yStr}${xStr}L${lenDots}${thickDots}`;
      }

      case 'text':
      default: {
        const t = elem as TextElement;
        const fontNum = t.fontWeight === 'bold' ? '3' : '2';
        const hMult = '1';
        const vMult = '1';
        const subType = '000';
        let data = t.text;
        if (t.field) {
          const fallbackMacro = t.field === 'produto.descricao' ? 'NOME' : t.field.split('.').pop()?.toUpperCase() || 'NOME';
          if (t.transformations && t.transformations.length > 0 && t.transformations[0].type === 'substring') {
            const trans = t.transformations[0];
            data = `[[${fallbackMacro},${trans.start},${trans.length}]]`;
          } else {
            data = `[[${fallbackMacro}]]`;
          }
        }
        return `${orientation}${fontNum}${hMult}${vMult}${subType}${yStr}${xStr}${data}`;
      }
    }
  }

  /**
   * Compilação limpa a partir do zero quando não há arquivo de origem
   */
  private static compileFromScratch(document: LabelDocument): RoundTripResult {
    const dpi = document.dimensions.dpi || 203;
    const wDots = mmToDots(document.dimensions.widthMm, dpi);
    const hDots = mmToDots(document.dimensions.heightMm, dpi);

    const lines: string[] = [
      `// Witiquetas PPLB Model - ${document.title}`,
      `I8,A,001`,
      `Q${hDots},024`,
      `q${wDots}`,
      `rN`,
      `S4`,
      `D7`,
      `ZT`,
      `JF`,
      `OD`,
      `R0,0`,
      `f100`,
      `N`,
    ];

    document.elements.forEach((el) => {
      const cmd = this.serializeSingleElement(el, dpi);
      if (el.visibilityRule) {
        const fieldName = el.visibilityRule.field.split('.').pop()?.toUpperCase();
        lines.push(`[[SE]]{{[[${fieldName}]]${el.visibilityRule.operator}${el.visibilityRule.value}}}{{${cmd}}}`);
      } else {
        lines.push(cmd);
      }
    });

    lines.push('P1');

    return {
      compiledCode: lines.join('\n'),
      diffSummary: {
        modifiedCount: 0,
        createdCount: document.elements.length,
        deletedCount: 0,
        preservedCommentsCount: 1,
        preservedConfigCommandsCount: 12,
        preservedConditionalsCount: document.elements.filter((e) => e.visibilityRule).length,
        lines: lines.map((l) => ({ type: 'added', newLine: l })),
      },
    };
  }
}
