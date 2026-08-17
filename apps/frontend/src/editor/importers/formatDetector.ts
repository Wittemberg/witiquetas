export type LabelLanguage = 'ppla' | 'pplb' | 'zpl' | 'unknown';

export interface DetectionResult {
  language: LabelLanguage;
  confidence: number; // 0 a 100
  scores: Record<LabelLanguage, number>;
  reasons: string[];
}

/**
 * Detector de Formato Baseado em Pontuação (Score / Confiança)
 * Analisa impressões digitais da sintaxe física real da linguagem
 * sem confundir macros de ERP genéricas como [[SE]] ou [[NOME]].
 */
export function detectLabelFormat(content: string): DetectionResult {
  const scores: Record<LabelLanguage, number> = {
    ppla: 0,
    pplb: 0,
    zpl: 0,
    unknown: 0,
  };

  const reasons: string[] = [];

  const lines = content.split(/\r?\n/);
  const normalized = content.toUpperCase();

  // ----------------------------------------------------
  // 1. ANÁLISE DE ASSINATURA PPLA (Argox / Datamax DPL)
  // ----------------------------------------------------
  // Comandos de cabeçalho PPLA com controle STX/CR: [[CHAR02]]O... ou [[CHAR02]]M...
  if (/\[\[CHAR02\]\][OM]/i.test(content) || /\x02[OM]/.test(content)) {
    scores.ppla += 40;
    reasons.push('Cabeçalho de controle PPLA detectado ([[CHAR02]]O... / [[CHAR02]]M...)');
  }

  // Comandos de configuração clássicos PPLA: O0220, M3500, LC0000, D11, H[temp]
  if (/^(?:\[\[CHAR02\]\])?O\d{3,4}/m.test(content)) {
    scores.ppla += 20;
    reasons.push('Comando de origem/comprimento PPLA (O...)');
  }
  if (/^LC\d{4}/m.test(content)) {
    scores.ppla += 20;
    reasons.push('Comando de modo contínuo PPLA (LC0000)');
  }
  if (/^D1[12]/m.test(content)) {
    scores.ppla += 15;
    reasons.push('Configuração de densidade de pontos PPLA (D11/D12)');
  }
  if (/^H(\d+|\[\[TEMPERATURA\]\])/m.test(content)) {
    scores.ppla += 15;
    reasons.push('Comando de temperatura de aquecimento PPLA (H...)');
  }

  // Comandos numéricos de texto e barcode PPLA: 12110..., 1F11..., 1X11...
  // Sintaxe: [1-4][0-9A-Z][0-9]{2}[0-9]{3}[0-9]{4}[0-9]{4}
  const pplaVisualLines = lines.filter((l) => {
    const clean = l.replace(/^(\[\[SE\]\]\{\{[^}]+\}\})+/g, '').trim();
    return /^[1-4][0-9A-Z][0-9]{2}[0-9]{3}[0-9]{4}[0-9]{4}/.test(clean);
  });
  if (pplaVisualLines.length > 0) {
    scores.ppla += Math.min(50, pplaVisualLines.length * 15);
    reasons.push(`${pplaVisualLines.length} linha(s) de comandos posicionais PPLA (12110..., 1F11...)`);
  }

  // Comando de finalização PPLA: E isolado no final
  if (/^E\s*$/m.test(content)) {
    scores.ppla += 10;
  }

  // ----------------------------------------------------
  // 2. ANÁLISE DE ASSINATURA PPLB (Eltron EPL2)
  // ----------------------------------------------------
  if (/^N\s*$/m.test(content)) {
    scores.pplb += 35;
    reasons.push('Comando de limpeza de buffer PPLB (N)');
  }
  if (/^q\d+/m.test(content)) {
    scores.pplb += 25;
    reasons.push('Configuração de largura de etiqueta PPLB (q...)');
  }
  if (/^Q\d+,\d+/m.test(content)) {
    scores.pplb += 30;
    reasons.push('Configuração de altura/gap PPLB (Q...,...)');
  }
  if (/^I8,\d/m.test(content) || /^I8,[A-Z]/m.test(content)) {
    scores.pplb += 20;
    reasons.push('Configuração de tabela de caracteres PPLB (I8...)');
  }
  const pplbVisualLines = lines.filter((l) => {
    const clean = l.replace(/^(\[\[SE\]\]\{\{[^}]+\}\})+/g, '').trim();
    return /^[AB]\d+,\d+,\d+,\d+/.test(clean);
  });
  if (pplbVisualLines.length > 0) {
    scores.pplb += Math.min(50, pplbVisualLines.length * 15);
    reasons.push(`${pplbVisualLines.length} linha(s) de comandos de texto/barcode PPLB (A..., B...)`);
  }
  if (/^P\d+/m.test(content) || /^P1\s*$/m.test(content)) {
    scores.pplb += 15;
    reasons.push('Comando de impressão PPLB (P1 / P...)');
  }

  // ----------------------------------------------------
  // 3. ANÁLISE DE ASSINATURA ZPL (Zebra)
  // ----------------------------------------------------
  if (normalized.includes('^XA') || normalized.includes('^XZ')) {
    scores.zpl += 50;
    reasons.push('Delimitadores de formato Zebra ZPL (^XA / ^XZ)');
  }
  if (/\^[A-Z]{2}/.test(content)) {
    const zplMatches = (content.match(/\^[A-Z]{2}/g) || []).length;
    scores.zpl += Math.min(40, zplMatches * 5);
    reasons.push(`${zplMatches} comandos ZPL (^FO, ^FD, ^FS, etc.)`);
  }

  // ----------------------------------------------------
  // DECISÃO E CÁLCULO DE CONFIANÇA
  // ----------------------------------------------------
  const maxScore = Math.max(scores.ppla, scores.pplb, scores.zpl);

  if (maxScore < 20) {
    return {
      language: 'unknown',
      confidence: 0,
      scores,
      reasons: ['Nenhuma assinatura de linguagem física (PPLA, PPLB, ZPL) foi identificada com confiança suficiente.'],
    };
  }

  let language: LabelLanguage = 'unknown';
  if (maxScore === scores.ppla) language = 'ppla';
  else if (maxScore === scores.pplb) language = 'pplb';
  else if (maxScore === scores.zpl) language = 'zpl';

  const totalScore = scores.ppla + scores.pplb + scores.zpl;
  const confidence = Math.min(100, Math.round((maxScore / (totalScore || 1)) * 100));

  return {
    language,
    confidence,
    scores,
    reasons,
  };
}
