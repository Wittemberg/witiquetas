import test from 'node:test';
import assert from 'node:assert/strict';

import { PPLBParser, dotsToMm, mmToDots } from '../apps/frontend/src/editor/importers/pplbParser.ts';
import { LegacyCompiler } from '../apps/frontend/src/editor/importers/legacyCompiler.ts';

test('1. Teste de Inversão e Precisão — 203 DPI: dots -> mm -> dots', () => {
  const testDots = [1, 2, 4, 8, 10, 18, 24, 30, 80, 110, 240, 800, 831];
  for (const dots of testDots) {
    const mm = dotsToMm(dots, 203);
    const convertedBack = mmToDots(mm, 203);
    assert.equal(convertedBack, dots, `Conversão reversa para ${dots} dots deve ser exata em 203 DPI`);
  }
});

test('2. Teste de Inversão e Precisão — 300 DPI: dots -> mm -> dots', () => {
  const testDots = [1, 2, 5, 12, 24, 35, 50, 120, 354, 1181, 1228];
  for (const dots of testDots) {
    const mm = dotsToMm(dots, 300);
    const convertedBack = mmToDots(mm, 300);
    assert.equal(convertedBack, dots, `Conversão reversa para ${dots} dots deve ser exata em 300 DPI`);
  }
});

test('3. Teste Específico Q240,024: Altura da Etiqueta e Gap entre Etiquetas', () => {
  const sample = [
    'Q240,024',
    'q831',
    'N',
    'A10,10,0,2,1,1,N,"TESTE"',
    'P1',
  ].join('\n');

  const result = PPLBParser.parse(sample);
  const dims = result.document.dimensions;

  assert.equal(dims.heightDots, 240, 'heightDots deve ser 240');
  assert.equal(dims.gapDots, 24, 'gapDots deve ser 24');
  assert.equal(dims.rawQCommand, 'Q240,024');
  assert.equal(dims.heightMm, dotsToMm(240, 203));
  assert.equal(dims.gapMm, dotsToMm(24, 203));

  // Round-trip inalterado -> Diff Zero e preserva Q240,024
  const compiled = LegacyCompiler.compile(result.document);
  assert.equal(compiled.diffSummary.modifiedCount, 0);
  assert.ok(compiled.compiledCode.includes('Q240,024'));
});

test('4. Teste Específico q831: Largura Imprimível e Case Sensitivity', () => {
  const sample = [
    'Q240,024',
    'q831',
    'N',
    'A10,10,0,2,1,1,N,"TESTE"',
    'P1',
  ].join('\n');

  const result = PPLBParser.parse(sample);
  const dims = result.document.dimensions;

  assert.equal(dims.widthDots, 831, 'widthDots deve ser 831');
  assert.equal(dims.rawqCommand, 'q831');
  assert.equal(dims.widthMm, dotsToMm(831, 203));

  // Round-trip deve emitir 'q831' minúsculo e nunca 'Q831'
  const compiled = LegacyCompiler.compile(result.document);
  assert.ok(compiled.compiledCode.includes('q831'));
  assert.ok(!compiled.compiledCode.includes('Q831'));
});

test('5. Distinção Estrita Q vs q: Q não sobrescreve q e vice-versa', () => {
  const sample = [
    'Q240,024',
    'q831',
  ].join('\n');

  const result = PPLBParser.parse(sample);
  const dims = result.document.dimensions;

  assert.equal(dims.heightDots, 240);
  assert.equal(dims.gapDots, 24);
  assert.equal(dims.widthDots, 831);

  // 240 dots != 831 dots
  assert.notEqual(dims.heightDots, dims.widthDots);
});

test('6. Round-Trip Editável: Alteração localizada de Altura em Q preserva gap com zero à esquerda', () => {
  const sample = [
    'Q240,024',
    'q831',
    'N',
    'P1',
  ].join('\n');

  const importResult = PPLBParser.parse(sample);

  // Alterar altura para 320 dots
  importResult.document.dimensions.heightDots = 320;
  importResult.document.dimensions.heightMm = dotsToMm(320, 203);

  const compiled = LegacyCompiler.compile(importResult.document);
  assert.equal(compiled.diffSummary.modifiedCount, 1);
  assert.ok(
    compiled.compiledCode.includes('Q320,024'),
    `Esperado Q320,024 preservando 3 dígitos do gap, obtido: ${compiled.compiledCode}`
  );
  assert.ok(compiled.compiledCode.includes('q831'), 'q831 deve permanecer inalterado');
});

test('7. Round-Trip Editável: Alteração localizada de Largura em q', () => {
  const sample = [
    'Q240,024',
    'q831',
    'N',
    'P1',
  ].join('\n');

  const importResult = PPLBParser.parse(sample);

  // Alterar largura para 800 dots
  importResult.document.dimensions.widthDots = 800;
  importResult.document.dimensions.widthMm = dotsToMm(800, 203);

  const compiled = LegacyCompiler.compile(importResult.document);
  assert.equal(compiled.diffSummary.modifiedCount, 1);
  assert.ok(
    compiled.compiledCode.includes('q800'),
    `Esperado q800, obtido: ${compiled.compiledCode}`
  );
  assert.ok(compiled.compiledCode.includes('Q240,024'), 'Q240,024 deve permanecer inalterado');
});
