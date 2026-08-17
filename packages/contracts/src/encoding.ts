// ==========================================
// CENTRALIZED ENCODING UTILITY (WINDOWS-1252 / UTF-8 / ASCII)
// ==========================================

// Mapeamento bidirecional exato para a faixa 0x80 - 0x9F do Windows-1252 (CP1252)
const CP1252_SPECIAL_UNICODE_TO_BYTE: Record<number, number> = {
  0x20ac: 0x80, // Euro sign '€'
  0x201a: 0x82, // Single low-9 quotation mark '‚'
  0x0192: 0x83, // Latin small letter f with hook 'ƒ'
  0x201e: 0x84, // Double low-9 quotation mark '„'
  0x2026: 0x85, // Horizontal ellipsis '…'
  0x2020: 0x86, // Dagger '†'
  0x2021: 0x87, // Double dagger '‡'
  0x02c6: 0x88, // Modifier letter circumflex accent 'ˆ'
  0x2030: 0x89, // Per mille sign '‰'
  0x0160: 0x8a, // Latin capital letter S with caron 'Š'
  0x2039: 0x8b, // Single left-pointing angle quotation mark '‹'
  0x0152: 0x8c, // Latin capital ligature OE 'Œ'
  0x017d: 0x8e, // Latin capital letter Z with caron 'Ž'
  0x2018: 0x91, // Left single quotation mark '‘'
  0x2019: 0x92, // Right single quotation mark '’'
  0x201c: 0x93, // Left double quotation mark '“'
  0x201d: 0x94, // Right double quotation mark '”'
  0x2022: 0x95, // Bullet '•'
  0x2013: 0x96, // En dash '–'
  0x2014: 0x97, // Em dash '—'
  0x02dc: 0x98, // Small tilde '˜'
  0x2122: 0x99, // Trade mark sign '™'
  0x0161: 0x9a, // Latin small letter s with caron 'š'
  0x203a: 0x9b, // Single right-pointing angle quotation mark '›'
  0x0153: 0x9c, // Latin small ligature oe 'œ'
  0x017e: 0x9e, // Latin small letter z with caron 'ž'
  0x0178: 0x9f, // Latin capital letter Y with diaeresis 'Ÿ'
};

const CP1252_SPECIAL_BYTE_TO_UNICODE: Record<number, number> = {};
for (const [codePointStr, byte] of Object.entries(CP1252_SPECIAL_UNICODE_TO_BYTE)) {
  CP1252_SPECIAL_BYTE_TO_UNICODE[byte] = Number(codePointStr);
}

/**
 * Codifica uma string Unicode para bytes reais em Windows-1252 (CP1252).
 * Garante que caracteres como '€' resultem no byte 0x80 (128) e caracteres acentuados
 * do português (á, é, í, ó, ú, ç, ã, õ, etc.) sejam mapeados corretamente para 0xA0..0xFF.
 */
export function encodeWindows1252(text: string): Uint8Array {
  const length = text.length;
  const bytes = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    const codePoint = text.charCodeAt(i);

    if (codePoint <= 0x7f) {
      // Faixa ASCII padrão (0x00 - 0x7F)
      bytes[i] = codePoint;
    } else if (codePoint >= 0xa0 && codePoint <= 0xff) {
      // Faixa Latin-1 Supplement (0xA0 - 0xFF)
      bytes[i] = codePoint;
    } else if (CP1252_SPECIAL_UNICODE_TO_BYTE[codePoint] !== undefined) {
      // Faixa de extensões especiais Windows-1252 (0x80 - 0x9F)
      bytes[i] = CP1252_SPECIAL_UNICODE_TO_BYTE[codePoint];
    } else {
      // Fallback para caractere não mapeável em CP1252 ('?' / 0x3F)
      bytes[i] = 0x3f;
    }
  }

  return bytes;
}

/**
 * Decodifica uma sequência de bytes Windows-1252 (CP1252) para string Unicode.
 */
export function decodeWindows1252(bytes: Uint8Array | ArrayLike<number>): string {
  let result = '';
  const length = bytes.length;

  for (let i = 0; i < length; i++) {
    const b = bytes[i];

    if (b <= 0x7f) {
      result += String.fromCharCode(b);
    } else if (b >= 0xa0 && b <= 0xff) {
      result += String.fromCharCode(b);
    } else if (CP1252_SPECIAL_BYTE_TO_UNICODE[b] !== undefined) {
      result += String.fromCharCode(CP1252_SPECIAL_BYTE_TO_UNICODE[b]);
    } else {
      result += '?';
    }
  }

  return result;
}

/**
 * Função centralizada de codificação de payloads com suporte formal a encodings térmicos.
 */
export function encodePayload(text: string, encoding: string): Uint8Array {
  const norm = (encoding || 'windows-1252').trim().toLowerCase();

  if (norm === 'windows-1252' || norm === 'cp1252' || norm === 'win-1252') {
    return encodeWindows1252(text);
  }

  if (norm === 'utf-8' || norm === 'utf8') {
    return new TextEncoder().encode(text);
  }

  if (norm === 'ascii' || norm === 'us-ascii') {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      bytes[i] = code <= 0x7f ? code : 0x3f;
    }
    return bytes;
  }

  // Fallback seguro: Windows-1252 para comandos térmicos
  return encodeWindows1252(text);
}

/**
 * Função centralizada de decodificação de payloads.
 */
export function decodePayload(bytes: Uint8Array, encoding: string): string {
  const norm = (encoding || 'windows-1252').trim().toLowerCase();

  if (norm === 'windows-1252' || norm === 'cp1252' || norm === 'win-1252') {
    return decodeWindows1252(bytes);
  }

  if (norm === 'utf-8' || norm === 'utf8') {
    return new TextDecoder('utf-8').decode(bytes);
  }

  if (norm === 'ascii' || norm === 'us-ascii') {
    let res = '';
    for (let i = 0; i < bytes.length; i++) {
      res += String.fromCharCode(bytes[i] <= 0x7f ? bytes[i] : 0x3f);
    }
    return res;
  }

  return decodeWindows1252(bytes);
}
