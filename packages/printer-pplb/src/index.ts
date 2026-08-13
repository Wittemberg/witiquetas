import { LabelDocument, LabelElement } from '@witiquetas/label-schema';
import { PrinterCompiler, PrinterLanguage, CompiledLabel, ValidationResult, compilerRegistry } from '@witiquetas/printer-core';

export class PPLBCompiler implements PrinterCompiler {
  language: PrinterLanguage = 'PPLB';

  validate(document: LabelDocument): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!document.dimensions || document.dimensions.widthMm <= 0 || document.dimensions.heightMm <= 0) {
      errors.push('Dimensões da etiqueta inválidas para PPLB.');
    }

    if (!document.elements || document.elements.length === 0) {
      warnings.push('A etiqueta não contém nenhum elemento visual.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  compile(document: LabelDocument, data: Record<string, string> = {}): CompiledLabel {
    const warnings: string[] = [];
    const dpi = document.dimensions.dpi || 203;
    const dotsPerMm = dpi / 25.4;

    const lines: string[] = [];

    // N - Limpar buffer da impressora PPLB
    lines.push('N');

    // Configurar tamanho da etiqueta em dots (q... para largura, Q... para altura)
    const wDots = Math.round(document.dimensions.widthMm * dotsPerMm);
    const hDots = Math.round(document.dimensions.heightMm * dotsPerMm);
    lines.push(`q${wDots}`);
    lines.push(`Q${hDots},24`);

    document.elements.forEach((elem: LabelElement) => {
      const xDots = Math.round(elem.x * dotsPerMm);
      const yDots = Math.round(elem.y * dotsPerMm);
      const elWDots = Math.round(elem.width * dotsPerMm);
      const elHDots = Math.round(elem.height * dotsPerMm);

      switch (elem.type) {
        case 'text': {
          const textValue = elem.field && data[elem.field] ? data[elem.field] : elem.text;
          // PPLB Sintaxe de Texto: A,x,y,rotação,fonte,multH,multV,N,"conteúdo"
          lines.push(`A${xDots},${yDots},0,3,1,1,N,"${textValue}"`);
          break;
        }

        case 'price': {
          const rawPrice = elem.field && data[elem.field] ? data[elem.field] : '9.99';
          const formatted = `${elem.prefix || 'R$'} ${rawPrice}`;
          lines.push(`A${xDots},${yDots},0,4,1,1,N,"${formatted}"`);
          break;
        }

        case 'barcode': {
          const barcodeValue = elem.field && data[elem.field] ? data[elem.field] : elem.value;
          // PPLB Sintaxe EAN-13: B,x,y,rotação,tipo(E30),largura_barra(2),largura_espaco(4),altura,B,"valor"
          lines.push(`B${xDots},${yDots},0,E30,2,4,${elHDots},B,"${barcodeValue}"`);
          break;
        }

        case 'rectangle': {
          // PPLB Caixa/Retângulo: LO,x,y,largura,altura
          lines.push(`LO${xDots},${yDots},${elWDots},${elHDots}`);
          break;
        }

        case 'line': {
          lines.push(`LO${xDots},${yDots},${elWDots},2`);
          break;
        }

        default:
          warnings.push(`Elemento do tipo '${elem.type}' ignorado pelo compilador PPLB.`);
      }
    });

    // P1 - Imprimir 1 cópia
    lines.push('P1');

    return {
      language: 'PPLB',
      encoding: 'windows-1252',
      command: lines.join('\n'),
      warnings,
    };
  }
}

export const pplbCompiler = new PPLBCompiler();
compilerRegistry.register(pplbCompiler);
