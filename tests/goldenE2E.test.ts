import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Módulos do Witiquetas
import { LegacyPreprocessor, ERP_MACRO_MAP, invertVisibilityRule } from '../apps/frontend/src/editor/importers/legacyPreprocessor.ts';
import { PPLBParser, dotsToMm, mmToDots } from '../apps/frontend/src/editor/importers/pplbParser.ts';
import { LegacyCompiler } from '../apps/frontend/src/editor/importers/legacyCompiler.ts';
import type { TextElement, PriceElement, BarcodeElement } from '../packages/label-schema/src/types.ts';
import type { ConditionalASTNode } from '../apps/frontend/src/editor/importers/astTypes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_REAL_PATH = path.join(__dirname, 'fixtures', 'legacy_gondola_100x30.prn');
const fixtureRealContent = fs.readFileSync(FIXTURE_REAL_PATH, 'utf-8');

// ============================================================================
// BLOCO 1: AUDITORIA E GATE DO MODELO REAL HOMOLOGADO 100x30
// ============================================================================

test('1. Golden Real 100x30: Round-Trip Zero-Change com Diff Zero Absoluto', () => {
  const importResult = PPLBParser.parse(fixtureRealContent);
  const compileResult = LegacyCompiler.compile(importResult.document);

  assert.equal(compileResult.diffSummary.modifiedCount, 0, 'Zero-change não deve ter nós modificados');
  assert.equal(compileResult.diffSummary.deletedCount, 0, 'Zero-change não deve ter nós deletados');
  assert.equal(compileResult.diffSummary.createdCount, 0, 'Zero-change não deve ter nós criados');
  assert.equal(compileResult.compiledCode.trim(), fixtureRealContent.trim(), 'Código compilado deve ser rigorosamente idêntico ao fixture real');
});

test('2. Golden Real 100x30: Auditoria Completa de Comandos de Configuração e Cabeçalho', () => {
  const astNodes = LegacyPreprocessor.preprocessLines(fixtureRealContent);
  const comments = astNodes.filter((n) => n.type === 'comment');
  const configs = astNodes.filter((n) => n.type === 'config').map((n: any) => n.command);
  const rawNodes = astNodes.filter((n) => n.type === 'raw');
  const qtyNodes = astNodes.filter((n) => n.type === 'quantity');

  // Comentários
  assert.equal(comments.length, 2);
  assert.equal(comments[0].originalText, '// Modelo Etiqueta Gondola 100x30');
  assert.equal(comments[1].originalText, '// Versao Elgin / Argox PPLB');

  // Configurações PPLB
  assert.ok(configs.includes('I8,A,001'), 'I8 preservado');
  assert.ok(configs.includes('Q240,024'), 'Q240,024 preservado');
  assert.ok(configs.includes('q831'), 'q831 preservado');
  assert.ok(configs.includes('rN'), 'rN preservado');
  assert.ok(configs.includes('S3'), 'S3 preservado');
  assert.ok(configs.includes('D8'), 'D8 preservado');
  assert.ok(configs.includes('ZT'), 'ZT preservado');
  assert.ok(configs.includes('JF'), 'JF preservado');
  assert.ok(configs.includes('R16,0'), 'R16,0 preservado');
  assert.ok(configs.includes('f220'), 'f220 preservado');
  assert.ok(configs.includes('N'), 'N preservado');

  // Comando 'O' preservado como RawNode
  assert.ok(rawNodes.some((n) => n.originalText === 'O'), 'Comando O preservado como RawNode');

  // Quantidade de Impressão
  assert.equal(qtyNodes.length, 1);
  assert.equal((qtyNodes[0] as any).quantityExpression, '1');
});

test('3. Golden Real 100x30: Auditoria de Dimensões Físicas e Separação Q vs q', () => {
  const importResult = PPLBParser.parse(fixtureRealContent);
  const dims = importResult.document.dimensions;

  assert.equal(dims.dpi, 203, 'DPI deve ser 203');
  assert.equal(dims.heightDots, 240, 'Altura deve ser 240 dots');
  assert.equal(dims.gapDots, 24, 'Gap deve ser 24 dots');
  assert.equal(dims.widthDots, 831, 'Largura imprimível deve ser 831 dots');
  assert.equal(dims.rawQCommand, 'Q240,024', 'Comando raw Q preservado');
  assert.equal(dims.rawqCommand, 'q831', 'Comando raw q preservado');

  // Precisão física derivada
  assert.equal(dims.heightMm, dotsToMm(240, 203)); // ~30.03 mm
  assert.equal(dims.gapMm, dotsToMm(24, 203)); // ~3.00 mm
  assert.equal(dims.widthMm, dotsToMm(831, 203)); // ~103.98 mm
});

test('4. Golden Real 100x30: Auditoria Semântica e Física dos Elementos Visuais', () => {
  const importResult = PPLBParser.parse(fixtureRealContent);
  const elements = importResult.document.elements;

  assert.equal(elements.length, 5, 'Deve conter 5 elementos visuais mapeados');

  // Elemento 1: A80,10,0,3,1,1,N,"[[NOME,0,18]]"
  const el1 = elements[0] as TextElement;
  assert.equal(el1.type, 'text');
  assert.equal(el1.x, dotsToMm(80, 203));
  assert.equal(el1.y, dotsToMm(10, 203));
  assert.equal(el1.rotation, 0);
  assert.equal(el1.printerFontId, 3);
  assert.equal(el1.horizontalMultiplier, 1);
  assert.equal(el1.verticalMultiplier, 1);
  assert.equal(el1.reversePrint, false);
  assert.equal(el1.field, 'produto.descricao');
  assert.deepEqual(el1.transformations, [{ type: 'substring', start: 0, length: 18 }]);

  // Elemento 2: A80,35,0,2,1,1,N,"[[NOME,18,36]]"
  const el2 = elements[1] as TextElement;
  assert.equal(el2.type, 'text');
  assert.equal(el2.x, dotsToMm(80, 203));
  assert.equal(el2.y, dotsToMm(35, 203));
  assert.equal(el2.printerFontId, 2);
  assert.equal(el2.horizontalMultiplier, 1);
  assert.equal(el2.verticalMultiplier, 1);
  assert.deepEqual(el2.transformations, [{ type: 'substring', start: 18, length: 36 }]);

  // Elemento 3: A80,60,0,2,1,1,N,"COD: [[CODIGO]]"
  const el3 = elements[2] as TextElement;
  assert.equal(el3.type, 'text');
  assert.equal(el3.x, dotsToMm(80, 203));
  assert.equal(el3.y, dotsToMm(60, 203));
  assert.equal(el3.printerFontId, 2);
  assert.equal(el3.field, 'produto.codigoInterno');

  // Elemento 4: [[SE]]{{[[PROMOCAO]]>0}}{{A550,45,0,4,2,2,N,"POR R$ [[PROMOCAO]]"}}
  const el4 = elements[3] as PriceElement;
  assert.equal(el4.type, 'price');
  assert.equal(el4.x, dotsToMm(550, 203));
  assert.equal(el4.y, dotsToMm(45, 203));
  assert.equal(el4.printerFontId, 4);
  assert.equal(el4.horizontalMultiplier, 2);
  assert.equal(el4.verticalMultiplier, 2);
  assert.equal(el4.prefix, 'R$');
  assert.deepEqual(el4.visibilityRule, {
    field: 'produto.promocao.preco',
    operator: '>',
    value: '0',
  });

  // Elemento 5: B80,110,0,1,2,5,60,B,"[[BARRA]]"
  const el5 = elements[4] as BarcodeElement;
  assert.equal(el5.type, 'barcode');
  assert.equal(el5.x, dotsToMm(80, 203));
  assert.equal(el5.y, dotsToMm(110, 203));
  assert.equal(el5.sourceBarcodeType, '1'); // Code 128
  assert.equal(el5.format, 'CODE128');
  assert.equal(el5.narrowBarDots, 2);
  assert.equal(el5.wideBarDots, 5);
  assert.equal(el5.barcodeHeightDots, 60);
  assert.equal(el5.showText, true);
  assert.equal(el5.field, 'produto.ean');
});

// ============================================================================
// BLOCO 2: AUDITORIA DE MODIFICAÇÕES LOCALIZADAS NO MODELO REAL
// ============================================================================

test('5. Modificação Localizada no Modelo Real: Alteração exclusiva de Coordenada X', () => {
  const importResult = PPLBParser.parse(fixtureRealContent);
  const elNome1 = importResult.document.elements[0] as TextElement;

  // Alterar X de 80 dots para 120 dots (15.01 mm)
  elNome1.x = dotsToMm(120, 203);
  if (elNome1.sourceReference) elNome1.sourceReference.state = 'modified';

  const compiled = LegacyCompiler.compile(importResult.document);
  assert.equal(compiled.diffSummary.modifiedCount, 1, 'Apenas 1 comando alterado');
  assert.ok(compiled.compiledCode.includes('A120,10,0,3,1,1,N,"[[NOME,0,18]]"'));
  assert.ok(compiled.compiledCode.includes('A80,35,0,2,1,1,N,"[[NOME,18,36]]"'), 'Demais linhas intactas');
  assert.ok(compiled.compiledCode.includes('Q240,024'), 'Configurações intactas');
});

test('6. Modificação Localizada no Modelo Real: Alteração de Altura do Código de Barras', () => {
  const importResult = PPLBParser.parse(fixtureRealContent);
  const barcode = importResult.document.elements[4] as BarcodeElement;

  // Alterar altura de 60 para 80 dots
  barcode.barcodeHeightDots = 80;
  barcode.height = dotsToMm(80, 203);
  if (barcode.sourceReference) barcode.sourceReference.state = 'modified';

  const compiled = LegacyCompiler.compile(importResult.document);
  assert.equal(compiled.diffSummary.modifiedCount, 1);
  assert.ok(compiled.compiledCode.includes('B80,110,0,1,2,5,80,B,"[[BARRA]]"'));
});

test('7. Modificação Localizada no Modelo Real: Alteração da Altura da Etiqueta em Q', () => {
  const importResult = PPLBParser.parse(fixtureRealContent);
  importResult.document.dimensions.heightDots = 300;
  importResult.document.dimensions.heightMm = dotsToMm(300, 203);

  const compiled = LegacyCompiler.compile(importResult.document);
  assert.equal(compiled.diffSummary.modifiedCount, 1);
  assert.ok(compiled.compiledCode.includes('Q300,024'), 'Gap 024 preservado com nova altura 300');
  assert.ok(compiled.compiledCode.includes('q831'), 'Largura q831 intacta');
});

// ============================================================================
// BLOCO 3: PRESERVAÇÃO DE MACROS ERP E IMUTABILIDADE DO TEMPLATE
// ============================================================================

test('8. Isolamento de Template vs Dados: Substring e Macros não viram literais fixos', () => {
  const importResult = PPLBParser.parse(fixtureRealContent);
  const elNome1 = importResult.document.elements[0] as TextElement;

  // Mesmo que o editor esteja exibindo o texto resolvido no preview, a compilação reemite a macro
  assert.equal(elNome1.field, 'produto.descricao');
  assert.deepEqual(elNome1.transformations, [{ type: 'substring', start: 0, length: 18 }]);

  const compiled = LegacyCompiler.compile(importResult.document);
  assert.ok(compiled.compiledCode.includes('[[NOME,0,18]]'));
  assert.ok(!compiled.compiledCode.includes('REFRIGERANTE COCA-COLA'));
});

// ============================================================================
// BLOCO 4: AUDITORIA DE LINE ENDINGS, ENCODING E RECUPERAÇÃO DEFENSIVA
// ============================================================================

test('9. Auditoria de Line Endings: Compatibilidade CRLF e LF', () => {
  const crlfContent = fixtureRealContent.replace(/\r?\n/g, '\r\n');
  const lfContent = fixtureRealContent.replace(/\r?\n/g, '\n');

  const resCRLF = PPLBParser.parse(crlfContent);
  const resLF = PPLBParser.parse(lfContent);

  assert.equal(resCRLF.document.elements.length, resLF.document.elements.length);
  assert.equal(resCRLF.document.dimensions.widthMm, resLF.document.dimensions.widthMm);
});

test('10. Auditoria de Fechamento Defensivo: Arquivo malformado sem FIMSE não injeta FIMSE no round-trip zero-change', () => {
  const unclosedSample = `I8,A,001\n[[SE]]{{[[PROMOCAO]]>0}}\nA10,18,0,2,2,2,N,"OFERTA"\nP1`;
  const parsed = PPLBParser.parse(unclosedSample);
  const compiled = LegacyCompiler.compile(parsed.document);

  // O round-trip zero-change sobre arquivo não modificado reproduz fielmente as linhas originais
  assert.equal(compiled.compiledCode, unclosedSample, 'Não deve inserir [[FIMSE]] sintético no arquivo se ele não existia no original');
});

// ============================================================================
// BLOCO 5: CONTRATO PREPARATÓRIO DA FASE 3 (CompiledPrintPayload)
// ============================================================================

export interface CompiledPrintPayload {
  language: 'PPLB' | 'PPLA' | 'ZPL' | 'EPL';
  encoding: 'windows-1252' | 'utf-8' | 'ascii' | 'binary';
  payloadBase64: string;
  payloadBytesLength: number;
  checksumSha256: string;
  copies: number;
  dpi: 203 | 300 | 600;
  metadata: {
    templateTitle: string;
    hasBinaryGraphics?: boolean;
    dimensionsMm: {
      width: number;
      height: number;
      gap?: number;
    };
  };
}

test('11. Contrato Preparatório Fase 3: Geração de CompiledPrintPayload em Bytes/Base64 com Checksum SHA-256', () => {
  const importResult = PPLBParser.parse(fixtureRealContent);
  const compileResult = LegacyCompiler.compile(importResult.document);

  const payloadString = compileResult.compiledCode;
  const payloadBuffer = Buffer.from(payloadString, 'latin1'); // Simula CP1252 / Windows-1252
  const hash = crypto.createHash('sha256').update(payloadBuffer).digest('hex');

  const printPayload: CompiledPrintPayload = {
    language: 'PPLB',
    encoding: 'windows-1252',
    payloadBase64: payloadBuffer.toString('base64'),
    payloadBytesLength: payloadBuffer.length,
    checksumSha256: hash,
    copies: 1,
    dpi: importResult.document.dimensions.dpi,
    metadata: {
      templateTitle: importResult.document.title,
      hasBinaryGraphics: false,
      dimensionsMm: {
        width: importResult.document.dimensions.widthMm,
        height: importResult.document.dimensions.heightMm,
        gap: importResult.document.dimensions.gapMm,
      },
    },
  };

  assert.equal(printPayload.language, 'PPLB');
  assert.equal(printPayload.dpi, 203);
  assert.equal(printPayload.checksumSha256.length, 64);
  assert.equal(printPayload.payloadBytesLength, payloadBuffer.length);
  assert.ok(printPayload.payloadBase64.length > 0);

  // Decodificação pelo Agent Local em bytes opacos
  const decodedBytes = Buffer.from(printPayload.payloadBase64, 'base64');
  assert.equal(decodedBytes.length, printPayload.payloadBytesLength);
  assert.equal(crypto.createHash('sha256').update(decodedBytes).digest('hex'), printPayload.checksumSha256);
});
