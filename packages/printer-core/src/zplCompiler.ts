import type { LabelDocument, LabelElement } from '@witiquetas/label-schema';
import type { PrinterCompiler, PrinterLanguage, CompiledLabel, ValidationResult } from './types.js';
import { compilerRegistry } from './registry.js';

export class ZPLCompiler implements PrinterCompiler {
  language: PrinterLanguage = 'ZPL';

  validate(document: LabelDocument): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!document.dimensions || document.dimensions.widthMm <= 0 || document.dimensions.heightMm <= 0) {
      errors.push('Dimensões da etiqueta inválidas para ZPL.');
    }

    if (!document.elements || document.elements.length === 0) {
      warnings.push('A etiqueta não contém nenhum elemento visual.');
    }

    if (document.elements && document.elements.some((elem) => elem.type === 'image' && elem.visible !== false)) {
      errors.push('Este modelo contém uma imagem, mas a linguagem ZPL selecionada ainda não possui suporte a bitmap.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  compile(document: LabelDocument, data: Record<string, string> = {}): CompiledLabel {
    const validation = this.validate(document);
    if (!validation.valid) {
      throw new Error(validation.errors.join(' '));
    }

    const warnings: string[] = [];
    const dpi = document.dimensions.dpi || 203;
    const dotsPerMm = dpi / 25.4;

    const lines: string[] = [];
    lines.push('^XA');

    document.elements.forEach((elem: LabelElement) => {
      if (elem.visible === false) return;

      const xDots = Math.round(elem.x * dotsPerMm);
      const yDots = Math.round(elem.y * dotsPerMm);
      const wDots = Math.round(elem.width * dotsPerMm);
      const hDots = Math.round(elem.height * dotsPerMm);

      switch (elem.type) {
        case 'text': {
          const textValue = elem.field && data[elem.field] ? data[elem.field] : elem.text;
          lines.push(`^FO${xDots},${yDots}^A0N,28,28^FD${textValue}^FS`);
          break;
        }

        case 'price': {
          const rawPrice = elem.field && data[elem.field] ? data[elem.field] : '9.99';
          const formatted = `${elem.prefix || 'R$'} ${rawPrice}`;
          lines.push(`^FO${xDots},${yDots}^A0N,36,36^FD${formatted}^FS`);
          break;
        }

        case 'barcode': {
          const barcodeValue = elem.field && data[elem.field] ? data[elem.field] : elem.value;
          lines.push(`^FO${xDots},${yDots}^BEN,${hDots},Y,N^FD${barcodeValue}^FS`);
          break;
        }

        case 'rectangle': {
          lines.push(`^FO${xDots},${yDots}^GB${wDots},${hDots},${Math.round(elem.strokeWidth || 1)}^FS`);
          break;
        }

        case 'line': {
          lines.push(`^FO${xDots},${yDots}^GB${wDots},${Math.round(elem.strokeWidth || 1)},${Math.round(elem.strokeWidth || 1)}^FS`);
          break;
        }

        case 'image': {
          throw new Error('Este modelo contém uma imagem, mas a linguagem ZPL selecionada ainda não possui suporte a bitmap.');
        }

        default:
          warnings.push(`Elemento do tipo '${elem.type}' ignorado pelo compilador ZPL.`);
      }
    });

    lines.push('^XZ');

    return {
      language: 'ZPL',
      encoding: 'utf-8',
      command: lines.join('\n'),
      warnings,
    };
  }
}

export const zplCompiler = new ZPLCompiler();
compilerRegistry.register(zplCompiler);
