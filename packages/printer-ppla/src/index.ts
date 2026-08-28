import type { LabelDocument, LabelElement } from '@witiquetas/label-schema';
import { type PrinterCompiler, type PrinterLanguage, type CompiledLabel, type ValidationResult, compilerRegistry } from '@witiquetas/printer-core';

export class PPLACompiler implements PrinterCompiler {
  language: PrinterLanguage = 'PPLA';

  validate(document: LabelDocument): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!document.dimensions || document.dimensions.widthMm <= 0 || document.dimensions.heightMm <= 0) {
      errors.push('Dimensões da etiqueta inválidas para PPLA.');
    }

    if (!document.elements || document.elements.length === 0) {
      warnings.push('A etiqueta não contém nenhum elemento visual.');
    }

    if (document.elements && document.elements.some((elem) => elem.type === 'image' && elem.visible !== false)) {
      errors.push('Este modelo contém uma imagem, mas a linguagem PPLA selecionada ainda não possui suporte a bitmap.');
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
    const dotsPerMm = dpi / 25.4; // ~8 dots/mm em 203 DPI

    const lines: string[] = [];

    // STX L - Início do Modo de Formatação PPLA
    lines.push('\x02L');
    lines.push('D11'); // Densidade padrão
    lines.push('H10'); // Temperatura da cabeça de impressão

    document.elements.forEach((elem: LabelElement) => {
      if (elem.visible === false) return;

      const xDots = Math.round(elem.x * dotsPerMm);
      const yDots = Math.round(elem.y * dotsPerMm);
      const wDots = Math.round(elem.width * dotsPerMm);
      const hDots = Math.round(elem.height * dotsPerMm);

      // Formatar coordenadas em 4 dígitos (ex: 0100)
      const xStr = xDots.toString().padStart(4, '0');
      const yStr = yDots.toString().padStart(4, '0');

      switch (elem.type) {
        case 'text': {
          const textValue = elem.field && data[elem.field] ? data[elem.field] : elem.text;
          // PPLA Sintaxe de Texto: Orientação(1) + Fonte(1..5) + Multiplicadores(2) + Y(4) + X(4) + Conteúdo
          lines.push(`1211000${yStr}${xStr}${textValue}`);
          break;
        }

        case 'price': {
          const rawPrice = elem.field && data[elem.field] ? data[elem.field] : '9.99';
          const formatted = `${elem.prefix || 'R$'} ${rawPrice}`;
          lines.push(`1311000${yStr}${xStr}${formatted}`);
          break;
        }

        case 'barcode': {
          const barcodeValue = elem.field && data[elem.field] ? data[elem.field] : elem.value;
          // PPLA Sintaxe EAN-13: 1E000 + Altura + Y + X + Valor
          lines.push(`1F22000${yStr}${xStr}${barcodeValue}`);
          break;
        }

        case 'rectangle': {
          // PPLA Linhas/Caixas (X11...)
          lines.push(`X110000${yStr}${xStr}${hDots.toString().padStart(4, '0')}${wDots.toString().padStart(4, '0')}`);
          break;
        }

        case 'line': {
          lines.push(`X110000${yStr}${xStr}0002${wDots.toString().padStart(4, '0')}`);
          break;
        }

        case 'image': {
          throw new Error('Este modelo contém uma imagem, mas a linguagem PPLA selecionada ainda não possui suporte a bitmap.');
        }

        default:
          warnings.push(`Elemento do tipo '${elem.type}' ignorado pelo compilador PPLA.`);
      }
    });

    // E - Fim do documento PPLA e comando de corte/avanço
    lines.push('E');

    return {
      language: 'PPLA',
      encoding: 'windows-1252',
      command: lines.join('\n'),
      warnings,
    };
  }
}

export const pplaCompiler = new PPLACompiler();
compilerRegistry.register(pplaCompiler);
