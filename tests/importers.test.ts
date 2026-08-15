import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Módulos do Witiquetas
import { LegacyPreprocessor, ERP_MACRO_MAP } from '../apps/frontend/src/editor/importers/legacyPreprocessor.ts';
import { PPLBParser, dotsToMm, mmToDots } from '../apps/frontend/src/editor/importers/pplbParser.ts';
import { LegacyCompiler } from '../apps/frontend/src/editor/importers/legacyCompiler.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'legacy_gondola_100x30.prn');
const fixtureContent = fs.readFileSync(FIXTURE_PATH, 'utf-8');

test('1. Pré-processador: Comentários e Comandos Comentados', () => {
  const nodes = LegacyPreprocessor.preprocessLines(fixtureContent);
  const commentNodes = nodes.filter((n) => n.type === 'comment');

  assert.equal(commentNodes.length, 2, 'Deve identificar os 2 comentários no cabeçalho');
  assert.equal(commentNodes[0].originalText, '// Modelo Etiqueta Gondola 100x30');
  assert.equal(commentNodes[1].originalText, '// Versao Elgin / Argox PPLB');
});

test('2. Pré-processador: Comandos de Configuração de Impressora (PPLB)', () => {
  const nodes = LegacyPreprocessor.preprocessLines(fixtureContent);
  const configNodes = nodes.filter((n) => n.type === 'config');
  const rawNodes = nodes.filter((n) => n.type === 'raw');

  // Atualmente identifica 11 comandos de config (o comando 'O' na linha 11 é classificado como raw pelo regex atual)
  assert.equal(configNodes.length, 11, 'Identifica 11 comandos de configuração no estado atual');
  assert.equal(rawNodes.some((n) => n.originalText === 'O'), true, 'Comando O classificado como raw na baseline atual');

  const commands = configNodes.map((n: any) => n.command);
  assert.ok(commands.includes('I8,A,001'));
  assert.ok(commands.includes('Q240,024'));
  assert.ok(commands.includes('q831'));
  assert.ok(commands.includes('rN'));
  assert.ok(commands.includes('S3'));
  assert.ok(commands.includes('D8'));
  assert.ok(commands.includes('ZT'));
  assert.ok(commands.includes('JF'));
  assert.ok(commands.includes('R16,0'));
  assert.ok(commands.includes('f220'));
  assert.ok(commands.includes('N'));
});

test('3. Pré-processador: Quantidade de Impressão (P1 / P[[QUANTIDADE]])', () => {
  const nodes = LegacyPreprocessor.preprocessLines(fixtureContent);
  const qtyNodes = nodes.filter((n) => n.type === 'quantity');

  assert.equal(qtyNodes.length, 1, 'Deve identificar o comando de quantidade P1');
  assert.equal((qtyNodes[0] as any).quantityExpression, '1');
});

test('4. Pré-processador & Parser: Macros ERP e Substring', () => {
  const macro1 = LegacyPreprocessor.parseMacro('[[NOME,0,18]]');
  assert.ok(macro1, 'Deve interpretar [[NOME,0,18]]');
  assert.equal(macro1.field, 'produto.descricao');
  assert.deepEqual(macro1.transformations, [{ type: 'substring', start: 0, length: 18 }]);

  const macro2 = LegacyPreprocessor.parseMacro('[[NOME,18,36]]');
  assert.ok(macro2, 'Deve interpretar [[NOME,18,36]]');
  assert.equal(macro2.field, 'produto.descricao');
  assert.deepEqual(macro2.transformations, [{ type: 'substring', start: 18, length: 36 }]);

  const macroEan = LegacyPreprocessor.parseMacro('[[BARRA]]');
  assert.ok(macroEan);
  assert.equal(macroEan.field, 'produto.ean');
});

test('5. Parser PPLB: Detecção de Dimensões Físicas (Q e q)', () => {
  const result = PPLBParser.parse(fixtureContent);

  assert.ok(result.document);
  assert.equal(result.document.dimensions.dpi, 203);
  // Registra o comportamento atual do parser
  assert.ok(result.document.dimensions.widthMm > 0);
  assert.ok(result.document.dimensions.heightMm > 0);
});

test('6. Parser PPLB: Comando A (Texto e Preço Promocional Condicional)', () => {
  const result = PPLBParser.parse(fixtureContent);
  const elements = result.document.elements;

  // Elemento 1: A80,10,0,3,1,1,N,"[[NOME,0,18]]"
  const elNome1 = elements.find((e) => e.field === 'produto.descricao' && e.transformations?.[0]?.start === 0);
  assert.ok(elNome1, 'Deve encontrar o elemento de texto NOME (0..18)');
  assert.equal(elNome1.type, 'text');
  assert.equal(elNome1.x, dotsToMm(80, 203)); // 80 dots = 10.01 mm
  assert.equal(elNome1.y, dotsToMm(10, 203)); // 10 dots = 1.25 mm

  // Elemento Condicional: POR R$ [[PROMOCAO]]
  const elPromo = elements.find((e) => e.field === 'produto.promocao.preco');
  assert.ok(elPromo, 'Deve encontrar o elemento de preço promocional');
  assert.equal(elPromo.type, 'price');
  assert.ok(elPromo.visibilityRule, 'Deve possuir regra de visibilidade herdada do [[SE]]');
  assert.equal(elPromo.visibilityRule.field, 'produto.promocao.preco');
  assert.equal(elPromo.visibilityRule.operator, '>');
  assert.equal(elPromo.visibilityRule.value, '0');
});

test('7. Parser PPLB: Comando B (Código de Barras)', () => {
  const result = PPLBParser.parse(fixtureContent);
  const barcodeEl = result.document.elements.find((e) => e.type === 'barcode');

  assert.ok(barcodeEl, 'Deve encontrar o elemento de código de barras');
  assert.equal(barcodeEl.field, 'produto.ean');
  assert.equal(barcodeEl.x, dotsToMm(80, 203));
  assert.equal(barcodeEl.y, dotsToMm(110, 203));
  assert.equal(barcodeEl.showText, true, 'Human readable B deve configurar showText=true');
});

test('8. Parser PPLB: Comandos LO (Linhas) e X (Molduras)', () => {
  const testSample = [
    'LO50,60,200,4',
    'X10,20,2,300,150',
  ].join('\n');

  const result = PPLBParser.parse(testSample);
  const lineEl = result.document.elements.find((e) => e.type === 'line');
  const rectEl = result.document.elements.find((e) => e.type === 'rectangle');

  assert.ok(lineEl, 'Deve parsear comando LO como LineElement');
  assert.equal(lineEl.x, dotsToMm(50, 203));
  assert.equal(lineEl.y, dotsToMm(60, 203));
  assert.equal(lineEl.width, dotsToMm(200, 203));

  assert.ok(rectEl, 'Deve parsear comando X como RectangleElement');
  assert.equal(rectEl.x, dotsToMm(10, 203));
  assert.equal(rectEl.y, dotsToMm(20, 203));
  assert.equal(rectEl.width, dotsToMm(300 - 10, 203));
  assert.equal(rectEl.height, dotsToMm(150 - 20, 203));
});

test('9. Round-Trip Golden Test: Registro do Comportamento Atual de Reemissão', () => {
  // 1. Importar o arquivo legado fixture
  const importResult = PPLBParser.parse(fixtureContent);
  assert.ok(importResult.document);

  // 2. Exportar sem nenhuma alteração no canvas
  const roundTrip = LegacyCompiler.compile(importResult.document);

  // 3. Validar resumo do diff
  assert.equal(roundTrip.diffSummary.modifiedCount, 0, 'Nenhuma linha modificada');
  assert.equal(roundTrip.diffSummary.createdCount, 0, 'Nenhuma linha criada');
  assert.equal(roundTrip.diffSummary.preservedCommentsCount, 2, 'Preserva os 2 comentários');
  assert.equal(roundTrip.diffSummary.preservedConfigCommandsCount, 11, 'Preserva os 11 comandos config');
});

test('10. Substrings: Casos com Acentuação e Tamanhos Curtos', () => {
  const macroAccented = LegacyPreprocessor.parseMacro('[[DESCRICAO,0,10]]');
  assert.ok(macroAccented);
  assert.equal(macroAccented.field, 'produto.descricao');
  assert.deepEqual(macroAccented.transformations, [{ type: 'substring', start: 0, length: 10 }]);

  const macroExact = LegacyPreprocessor.parseMacro('[[NOME,18,18]]');
  assert.ok(macroExact);
  assert.equal(macroExact.field, 'produto.descricao');
  assert.deepEqual(macroExact.transformations, [{ type: 'substring', start: 18, length: 18 }]);
});

test('11. Código de Barras: Variações de ShowText e Simbologias Suportadas', () => {
  const sampleEan8 = 'B10,20,0,8,2,4,40,N,"12345670"';
  const sampleCode128 = 'B10,20,0,1,2,4,40,B,"ABC-123"';

  const resEan8 = PPLBParser.parse(sampleEan8);
  const elEan8 = resEan8.document.elements[0];
  assert.equal(elEan8.type, 'barcode');
  assert.equal((elEan8 as any).format, 'EAN8');
  assert.equal((elEan8 as any).showText, false, 'showText deve ser false para parâmetro N');

  const res128 = PPLBParser.parse(sampleCode128);
  const el128 = res128.document.elements[0];
  assert.equal(el128.type, 'barcode');
  assert.equal((el128 as any).format, 'CODE128');
  assert.equal((el128 as any).showText, true, 'showText deve ser true para parâmetro B');
});


