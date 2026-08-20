/**
 * Gerador de QR Code em conformidade com a especificação ISO/IEC 18004.
 * Gera matrizes binárias exatas e DataURLs de alta definição para exibição no Canvas e impressão térmica.
 */

// Tabela de capacidades e parâmetros de correção de erro (Nível M padrão)
interface QRVersionConfig {
  version: number;
  size: number;
  totalDataCodewords: number;
  ecCodewords: number;
  blocks: { numBlocks: number; dataPerBlock: number }[];
  alignmentPositions: number[];
}

const QR_VERSIONS: QRVersionConfig[] = [
  {
    version: 1,
    size: 21,
    totalDataCodewords: 16,
    ecCodewords: 10,
    blocks: [{ numBlocks: 1, dataPerBlock: 16 }],
    alignmentPositions: [],
  },
  {
    version: 2,
    size: 25,
    totalDataCodewords: 28,
    ecCodewords: 16,
    blocks: [{ numBlocks: 1, dataPerBlock: 28 }],
    alignmentPositions: [6, 18],
  },
  {
    version: 3,
    size: 29,
    totalDataCodewords: 44,
    ecCodewords: 26,
    blocks: [{ numBlocks: 1, dataPerBlock: 44 }],
    alignmentPositions: [6, 22],
  },
  {
    version: 4,
    size: 33,
    totalDataCodewords: 64,
    ecCodewords: 36,
    blocks: [{ numBlocks: 2, dataPerBlock: 32 }],
    alignmentPositions: [6, 26],
  },
  {
    version: 5,
    size: 37,
    totalDataCodewords: 86,
    ecCodewords: 48,
    blocks: [{ numBlocks: 2, dataPerBlock: 43 }],
    alignmentPositions: [6, 30],
  },
];

// Tabelas de Galois Field GF(256) com polinômio primitivo 0x11D (x^8 + x^4 + x^3 + x^2 + 1)
const GF_EXP: number[] = new Array(512);
const GF_LOG: number[] = new Array(256);

(() => {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = val;
    GF_EXP[i + 255] = val;
    GF_LOG[val] = i;
    val = (val << 1) ^ (val & 0x80 ? 0x11d : 0);
  }
  GF_LOG[0] = 0;
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const factor = [1, GF_EXP[i]];
    const nextPoly = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      for (let k = 0; k < factor.length; k++) {
        nextPoly[j + k] ^= gfMul(poly[j], factor[k]);
      }
    }
    poly = nextPoly;
  }
  return poly;
}

function rsCalculateEC(data: number[], ecCount: number): number[] {
  const gen = rsGeneratorPoly(ecCount);
  const info = [...data, ...new Array(ecCount).fill(0)];

  for (let i = 0; i < data.length; i++) {
    const coef = info[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        info[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }

  return info.slice(data.length);
}

/**
 * Codifica o texto no formato padrão Byte Mode (ISO 18004)
 */
export function encodeQRData(text: string): { matrix: boolean[][]; size: number; version: number } {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff) {
      // Codificação UTF-8
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(code);
    }
  }

  // Escolher menor versão capaz de suportar a quantidade de bytes
  let config = QR_VERSIONS[0];
  for (const v of QR_VERSIONS) {
    if (bytes.length + 2 <= v.totalDataCodewords) {
      config = v;
      break;
    }
  }

  // Construir fluxo de bits: Modo Byte (0100) + Contador de Caracteres (8 bits) + Dados
  const bitStream: number[] = [];
  const pushBits = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) {
      bitStream.push((value >> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte Mode
  pushBits(bytes.length, 8); // Count
  for (const b of bytes) {
    pushBits(b, 8);
  }

  // Terminador (até 4 zeros)
  const capacityBits = config.totalDataCodewords * 8;
  const terminatorLength = Math.min(4, capacityBits - bitStream.length);
  pushBits(0, terminatorLength);

  // Alinhar a múltiplo de 8
  while (bitStream.length % 8 !== 0) {
    bitStream.push(0);
  }

  // Converter bits para bytes
  const dataCodewords: number[] = [];
  for (let i = 0; i < bitStream.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bitStream[i + j];
    }
    dataCodewords.push(byte);
  }

  // Bytes de preenchimento (0xEC, 0x11)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataCodewords.length < config.totalDataCodewords) {
    dataCodewords.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  // Gerar blocos de correção de erro Reed-Solomon
  const ecPerBlock = config.ecCodewords / config.blocks.reduce((acc, b) => acc + b.numBlocks, 0);
  let dataOffset = 0;
  const allDataBlocks: number[][] = [];
  const allEcBlocks: number[][] = [];

  for (const block of config.blocks) {
    for (let b = 0; b < block.numBlocks; b++) {
      const blockData = dataCodewords.slice(dataOffset, dataOffset + block.dataPerBlock);
      dataOffset += block.dataPerBlock;
      allDataBlocks.push(blockData);
      allEcBlocks.push(rsCalculateEC(blockData, ecPerBlock));
    }
  }

  // Intercalar dados e blocos EC
  const finalCodewords: number[] = [];
  const maxDataLen = Math.max(...allDataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const b of allDataBlocks) {
      if (i < b.length) finalCodewords.push(b[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const b of allEcBlocks) {
      finalCodewords.push(b[i]);
    }
  }

  // Construir a matriz física do QR Code
  const size = config.size;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // 1. Finder Patterns e Separators
  const addFinder = (startRow: number, startCol: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = startRow + r;
        const col = startCol + c;
        if (row >= 0 && row < size && col >= 0 && col < size) {
          isFunction[row][col] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            matrix[row][col] = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          } else {
            matrix[row][col] = false; // Separator
          }
        }
      }
    }
  };

  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // 2. Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    isFunction[6][i] = true;
    matrix[6][i] = i % 2 === 0;
    isFunction[i][6] = true;
    matrix[i][6] = i % 2 === 0;
  }

  // 3. Alignment Patterns (Version >= 2)
  if (config.alignmentPositions.length > 0) {
    const pos = config.alignmentPositions;
    for (const r of pos) {
      for (const c of pos) {
        // Não sobrepor com finder patterns
        if (isFunction[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const row = r + dr;
            const col = c + dc;
            isFunction[row][col] = true;
            matrix[row][col] = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          }
        }
      }
    }
  }

  // 4. Dark Module & Format Info Reservation
  isFunction[4 * config.version + 9][8] = true;
  matrix[4 * config.version + 9][8] = true;

  for (let i = 0; i < 9; i++) {
    isFunction[8][i] = true;
    isFunction[i][8] = true;
    if (i < 8) isFunction[8][size - 1 - i] = true;
    if (i < 7) isFunction[size - 1 - i][8] = true;
  }

  // 5. Mapear dados nos módulos disponíveis (ziguezague vertical)
  const allBits: number[] = [];
  for (const byte of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      allBits.push((byte >> i) & 1);
    }
  }

  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Pular coluna de timing vertical

    for (let vert = 0; vert < size; vert++) {
      const row = upward ? size - 1 - vert : vert;
      for (let col = right; col >= right - 1; col--) {
        if (!isFunction[row][col]) {
          matrix[row][col] = bitIdx < allBits.length ? allBits[bitIdx] === 1 : false;
          bitIdx++;
        }
      }
    }
    upward = !upward;
  }

  // 6. Aplicar Máscara e Format Information (Padrão Mask 0: (row + col) % 2 == 0)
  // Format info para Nível M + Máscara 0 = 0b101010000010010 (BCH codificado)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunction[r][c] && matrix[r][c] !== null) {
        if ((r + c) % 2 === 0) {
          matrix[r][c] = !matrix[r][c];
        }
      }
    }
  }

  // Escrever Format Information na matriz
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i] === 1;
  matrix[8][7] = formatBits[6] === 1;
  matrix[8][8] = formatBits[7] === 1;
  matrix[7][8] = formatBits[8] === 1;
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i] === 1;

  for (let i = 0; i < 8; i++) matrix[size - 1 - i][8] = formatBits[i] === 1;
  for (let i = 8; i < 15; i++) matrix[8][size - 15 + i] = formatBits[i] === 1;

  const resultMatrix: boolean[][] = matrix.map((row) => row.map((cell) => cell === true));

  return {
    matrix: resultMatrix,
    size,
    version: config.version,
  };
}

/**
 * Gera DataURL (PNG ou SVG Base64) do QR Code respeitando proporção 1:1,
 * zona silenciosa (Quiet Zone) e alto contraste óptico.
 */
export function generateQRCodeDataUrl(text: string, sizePx: number = 256): string {
  const content = text && text.trim() !== '' ? text.trim() : 'https://witiquetas.wrtec.com.br';
  const { matrix, size } = encodeQRData(content);

  const quietZoneModules = 4; // Padrão ISO/IEC 18004 Quiet Zone
  const totalModules = size + quietZoneModules * 2;

  // Renderização em canvas offscreen de alta definição se document estiver disponível
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Fundo Branco
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sizePx, sizePx);

      // Módulos Pretos
      ctx.fillStyle = '#000000';
      const modulePixelSize = sizePx / totalModules;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c]) {
            ctx.fillRect(
              Math.round((c + quietZoneModules) * modulePixelSize),
              Math.round((r + quietZoneModules) * modulePixelSize),
              Math.ceil(modulePixelSize),
              Math.ceil(modulePixelSize)
            );
          }
        }
      }

      return canvas.toDataURL('image/png');
    }
  }

  // Fallback SVG em Base64 se document/canvas não estiver disponível (ex: SSR / Node / testes)
  const moduleSize = 10;
  const svgSize = totalModules * moduleSize;
  let rects = '';

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${(c + quietZoneModules) * moduleSize}" y="${(r + quietZoneModules) * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="#000000"/>`;
      }
    }
  }

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${sizePx}" height="${sizePx}"><rect width="${svgSize}" height="${svgSize}" fill="#ffffff"/>${rects}</svg>`;
  if (typeof Buffer !== 'undefined') {
    return `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`;
  }
  return `data:image/svg+xml;base64,${btoa(svgString)}`;
}
