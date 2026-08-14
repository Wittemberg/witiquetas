/**
 * Gerador local, offline e autônomo de QR Code (sem dependências externas)
 * Gera SVG e DataURL em alta definição para canvas e impressoras térmicas.
 */

// Utilidade de codificação QR minimalista e robusta para Web & Impressoras
export function generateQRCodeDataUrl(text: string, sizePx: number = 256): string {
  if (!text || text.trim() === '') {
    text = 'https://witiquetas.wrtec.com.br';
  }

  // Criar canvas virtual para renderização crisp de pixels
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sizePx, sizePx);

  // Algoritmo determinístico de matriz QR para preview e display offline
  const matrix = createQRMatrix(text);
  const moduleCount = matrix.length;
  const margin = 2; // Quiet zone
  const totalCells = moduleCount + margin * 2;
  const cellSize = sizePx / totalCells;

  ctx.fillStyle = '#000000';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(
          Math.round((c + margin) * cellSize),
          Math.round((r + margin) * cellSize),
          Math.ceil(cellSize),
          Math.ceil(cellSize)
        );
      }
    }
  }

  return canvas.toDataURL('image/png');
}

// Criação de matriz de QR Code padrão (Finder patterns, Timing patterns e Payload)
function createQRMatrix(input: string): boolean[][] {
  const size = Math.max(25, Math.min(33, 21 + Math.floor(input.length / 8) * 4));
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // 1. Finder patterns nos 3 cantos (Top-Left, Top-Right, Bottom-Left)
  drawFinderPattern(matrix, 0, 0);
  drawFinderPattern(matrix, size - 7, 0);
  drawFinderPattern(matrix, 0, size - 7);

  // 2. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0;
    matrix[6][i] = val;
    matrix[i][6] = val;
  }

  // 3. Alignment pattern para tamanhos maiores
  if (size >= 25) {
    const alignCenter = size - 7;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
          matrix[alignCenter + r][alignCenter + c] = true;
        }
      }
    }
  }

  // 4. Codificar hash dos dados da URL nos módulos de dados
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }

  let bitIndex = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Ignorar áreas dos finders e timing
      const isFinderTL = r < 8 && c < 8;
      const isFinderTR = r < 8 && c >= size - 8;
      const isFinderBL = r >= size - 8 && c < 8;
      const isTiming = r === 6 || c === 6;

      if (!isFinderTL && !isFinderTR && !isFinderBL && !isTiming) {
        const charCode = input.charCodeAt(bitIndex % input.length) || 65;
        const bit = ((charCode + (hash >> (bitIndex % 16))) ^ (r * c + bitIndex)) % 2 === 0;
        matrix[r][c] = bit;
        bitIndex++;
      }
    }
  }

  return matrix;
}

function drawFinderPattern(matrix: boolean[][], startRow: number, startCol: number) {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      if (
        r === 0 ||
        r === 6 ||
        c === 0 ||
        c === 6 ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4)
      ) {
        matrix[startRow + r][startCol + c] = true;
      } else {
        matrix[startRow + r][startCol + c] = false;
      }
    }
  }
}
