/**
 * Motor Matemático de Codificação de Códigos de Barras do Witiquetas
 * Gera matrizes binárias exatas de módulos (1 = barra preta, 0 = espaço)
 * Suporta EAN-13, EAN-8, UPC-A, Code 128 e ITF-14 com validação de Check Digit.
 */

export type BarcodeFormat = 'AUTO' | 'EAN13' | 'EAN8' | 'UPCA' | 'UPCE' | 'CODE128' | 'ITF14';

export interface BarcodeValidationResult {
  isValid: boolean;
  effectiveFormat: BarcodeFormat;
  error?: string;
  checkDigitValid?: boolean;
}

export interface BarcodeEncodingResult {
  modules: boolean[];
  effectiveFormat: BarcodeFormat;
  totalModules: number;
  isValid: boolean;
  error?: string;
}

// 1. Auto-detecção inteligente de simbologia
export function detectBarcodeFormat(value?: string | null): BarcodeFormat {
  if (!value) return 'CODE128';
  const clean = String(value).trim();
  const isOnlyDigits = /^\d+$/.test(clean);

  if (isOnlyDigits) {
    if (clean.length === 8) return 'EAN8';
    if (clean.length === 12) return 'UPCA';
    if (clean.length === 13) return 'EAN13';
    if (clean.length === 14) return 'ITF14';
  }

  return 'CODE128';
}

// 2. Validação de Dígito Verificador (Módulo 10 para GS1 / EAN / UPC / ITF)
export function validateCheckDigit(format?: BarcodeFormat | null, value?: string | null): { isValid: boolean; expectedCheckDigit?: string; error?: string } {
  if (!value) return { isValid: true };
  const clean = String(value).trim();
  const effFormat = format || 'AUTO';

  if (!/^\d+$/.test(clean)) {
    if (effFormat === 'CODE128' || effFormat === 'AUTO') return { isValid: true };
    return { isValid: false, error: 'Apenas números são aceitos nesta simbologia.' };
  }

  let expectedLength = 0;
  if (effFormat === 'EAN13') expectedLength = 13;
  else if (effFormat === 'EAN8') expectedLength = 8;
  else if (effFormat === 'UPCA') expectedLength = 12;
  else if (effFormat === 'ITF14') expectedLength = 14;
  else return { isValid: true };

  if (clean.length !== expectedLength) {
    return { isValid: false, error: `Esperado ${expectedLength} dígitos para ${format} (recebido ${clean.length}).` };
  }

  // Algoritmo GS1 Modulo 10
  const digits = clean.split('').map(Number);
  const providedCheck = digits[digits.length - 1];
  const payload = digits.slice(0, -1);

  let sum = 0;
  const isPayloadLengthEven = payload.length % 2 === 0;

  for (let i = 0; i < payload.length; i++) {
    // Alterna pesos 3 e 1 a partir da direita
    const weight = (payload.length - 1 - i) % 2 === 0 ? 3 : 1;
    sum += payload[i] * weight;
  }

  const calculatedCheck = (10 - (sum % 10)) % 10;
  const isValid = providedCheck === calculatedCheck;

  return {
    isValid,
    expectedCheckDigit: calculatedCheck.toString(),
    error: isValid ? undefined : `Dígito verificador recebido (${providedCheck}) difere do esperado (${calculatedCheck}).`,
  };
}

// =========================================================================
// TABELAS DE CODIFICAÇÃO EAN / UPC
// =========================================================================
const EAN_L_TABLE: Record<string, string> = {
  '0': '0001101', '1': '0011001', '2': '0010011', '3': '0111101', '4': '0100011',
  '5': '0110001', '6': '0101111', '7': '0111011', '8': '0110111', '9': '0001011',
};

const EAN_G_TABLE: Record<string, string> = {
  '0': '0100111', '1': '0110011', '2': '0011011', '3': '0100001', '4': '0011101',
  '5': '0111001', '6': '0000101', '7': '0010001', '8': '0001001', '9': '0010111',
};

const EAN_R_TABLE: Record<string, string> = {
  '0': '1110010', '1': '1100110', '2': '1101100', '3': '1000010', '4': '1011100',
  '5': '1001110', '6': '1010000', '7': '1000100', '8': '1001000', '9': '1110100',
};

const EAN13_PARITY: Record<string, string> = {
  '0': 'LLLLLL', '1': 'LLGLGG', '2': 'LLGGLG', '3': 'LLGGGL', '4': 'LGLLGG',
  '5': 'LGGLLG', '6': 'LGGGLL', '7': 'LGLGLG', '8': 'LGLGGL', '9': 'LGGLGL',
};

// =========================================================================
// TABELAS CODE 128
// =========================================================================
const CODE128_PATTERNS: string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', // 0-4
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000', // 5-9
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110', // 10-14
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100', // 15-19
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100', // 20-24
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010', // 25-29
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', // 30-34
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000', // 35-39
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110', // 40-44
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110', // 45-49
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000', // 50-54
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010', // 55-59
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', // 60-64
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000', // 65-69
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010', // 70-74
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010', // 75-79
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100', // 80-84
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110', // 85-89
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', // 90-94
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110', // 95-99
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000', // 100-104 (Start A, B, C)
  '11010011100', '1100011101011', // 105 (Start B), 106 (Stop)
];

// =========================================================================
// GERADOR DE MÓDULOS BINÁRIOS
// =========================================================================
export function generateBarcodeModules(format: BarcodeFormat, value: string): BarcodeEncodingResult {
  const rawValue = (value || '7894900011517').trim();
  const effectiveFormat = format === 'AUTO' ? detectBarcodeFormat(rawValue) : format;

  const bits: boolean[] = [];

  try {
    if (effectiveFormat === 'EAN13') {
      const clean = rawValue.padStart(13, '0').slice(-13);
      const firstDigit = clean[0];
      const parityPattern = EAN13_PARITY[firstDigit] || 'LLLLLL';
      const leftDigits = clean.slice(1, 7);
      const rightDigits = clean.slice(7, 13);

      // Left Guard (101)
      appendBits(bits, '101');

      // Left 6 digits
      for (let i = 0; i < 6; i++) {
        const d = leftDigits[i];
        const parity = parityPattern[i];
        appendBits(bits, parity === 'L' ? EAN_L_TABLE[d] : EAN_G_TABLE[d]);
      }

      // Center Guard (01010)
      appendBits(bits, '01010');

      // Right 6 digits
      for (let i = 0; i < 6; i++) {
        const d = rightDigits[i];
        appendBits(bits, EAN_R_TABLE[d]);
      }

      // Right Guard (101)
      appendBits(bits, '101');

      return {
        modules: bits,
        effectiveFormat: 'EAN13',
        totalModules: bits.length,
        isValid: true,
      };
    }

    if (effectiveFormat === 'EAN8') {
      const clean = rawValue.padStart(8, '0').slice(-8);
      const leftDigits = clean.slice(0, 4);
      const rightDigits = clean.slice(4, 8);

      // Left Guard (101)
      appendBits(bits, '101');

      // Left 4 digits
      for (let i = 0; i < 4; i++) {
        appendBits(bits, EAN_L_TABLE[leftDigits[i]]);
      }

      // Center Guard (01010)
      appendBits(bits, '01010');

      // Right 4 digits
      for (let i = 0; i < 4; i++) {
        appendBits(bits, EAN_R_TABLE[rightDigits[i]]);
      }

      // Right Guard (101)
      appendBits(bits, '101');

      return {
        modules: bits,
        effectiveFormat: 'EAN8',
        totalModules: bits.length,
        isValid: true,
      };
    }

    if (effectiveFormat === 'UPCA') {
      const clean = rawValue.padStart(12, '0').slice(-12);
      // UPC-A é equivalente a um EAN-13 com primeiro dígito '0'
      return generateBarcodeModules('EAN13', '0' + clean);
    }

    if (effectiveFormat === 'ITF14') {
      const clean = rawValue.padStart(14, '0').slice(-14);
      // Start (1010)
      appendBits(bits, '1010');

      // 2 of 5 Interleaved patterns (1 = wide, 0 = narrow)
      const ITF_PATTERNS: Record<string, string> = {
        '0': '00110', '1': '10001', '2': '01001', '3': '11000', '4': '00101',
        '5': '10100', '6': '01100', '7': '00011', '8': '10010', '9': '01010',
      };

      for (let i = 0; i < 14; i += 2) {
        const barPattern = ITF_PATTERNS[clean[i]] || '00110';
        const spacePattern = ITF_PATTERNS[clean[i + 1]] || '00110';

        for (let j = 0; j < 5; j++) {
          const isBarWide = barPattern[j] === '1';
          const isSpaceWide = spacePattern[j] === '1';
          // Barra (2 modules se wide, 1 se narrow)
          bits.push(true);
          if (isBarWide) bits.push(true);
          // Espaço (2 modules se wide, 1 se narrow)
          bits.push(false);
          if (isSpaceWide) bits.push(false);
        }
      }

      // Stop (1101)
      appendBits(bits, '11101');

      return {
        modules: bits,
        effectiveFormat: 'ITF14',
        totalModules: bits.length,
        isValid: true,
      };
    }

    // Code 128 (Geral / Alfanumérico)
    const codeValues: number[] = [104]; // Start Code B
    for (let i = 0; i < rawValue.length; i++) {
      const code = rawValue.charCodeAt(i) - 32;
      codeValues.push(Math.max(0, Math.min(106, code)));
    }

    // Checksum Code 128 (Modulo 103)
    let checksum = codeValues[0];
    for (let i = 1; i < codeValues.length; i++) {
      checksum += codeValues[i] * i;
    }
    codeValues.push(checksum % 103);
    codeValues.push(106); // Stop pattern

    codeValues.forEach((idx) => {
      const pattern = CODE128_PATTERNS[idx] || CODE128_PATTERNS[0];
      appendBits(bits, pattern);
    });

    return {
      modules: bits,
      effectiveFormat: 'CODE128',
      totalModules: bits.length,
      isValid: true,
    };
  } catch (err: any) {
    // Fallback EAN-13 genérico
    return generateBarcodeModules('EAN13', '7894900011517');
  }
}

function appendBits(target: boolean[], bitString?: string | null) {
  if (!bitString) return;
  for (let i = 0; i < bitString.length; i++) {
    target.push(bitString[i] === '1');
  }
}
