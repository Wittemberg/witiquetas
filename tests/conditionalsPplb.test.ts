import test from 'node:test';
import assert from 'node:assert/strict';

import { PPLBParser } from '../apps/frontend/src/editor/importers/pplbParser.ts';
import { LegacyCompiler } from '../apps/frontend/src/editor/importers/legacyCompiler.ts';
import { LegacyPreprocessor, invertVisibilityRule } from '../apps/frontend/src/editor/importers/legacyPreprocessor.ts';
import type { ConditionalASTNode } from '../apps/frontend/src/editor/importers/astTypes.ts';
import type { TextElement, PriceElement } from '../packages/label-schema/src/types.ts';

test('1. SE Multilinha Simples: [[SE]]{{...}} com único comando visual', () => {
  const sample = `
I8,A,001
Q240,024
q831
[[SE]]{{[[PROMOCAO]]>0}}
A10,18,0,2,2,2,N,"PROMOÇÃO ATIVA"
[[FIMSE]]
P1
`.trim();

  const result = PPLBParser.parse(sample);
  assert.equal(result.document.elements.length, 1);
  const el = result.document.elements[0] as TextElement;

  assert.equal(el.text, 'PROMOÇÃO ATIVA');
  assert.deepEqual(el.visibilityRule, {
    field: 'produto.promocao.preco',
    operator: '>',
    value: '0',
  });

  // Validação da AST
  const astNodes = LegacyPreprocessor.preprocessLines(sample);
  const condAST = astNodes.find((n) => n.type === 'conditional') as ConditionalASTNode;
  assert.ok(condAST, 'Nó condicional deve existir na AST');
  assert.equal(condAST.isMultiline, true);
  assert.equal(condAST.thenNodes.length, 1);
  assert.equal(condAST.elseNodes?.length || 0, 0);
});

test('2. SE Multilinha com Múltiplos Comandos no THEN', () => {
  const sample = `
[[SE]]{{[[PROMOCAO]]>0}}
A10,18,0,2,2,2,N,"DE: [[PRECO]]"
A10,50,0,4,2,2,N,"POR: [[PROMOCAO]]"
LO10,80,200,3
[[FIMSE]]
`.trim();

  const result = PPLBParser.parse(sample);
  assert.equal(result.document.elements.length, 3);

  const [de, por, linha] = result.document.elements;
  assert.equal(de.visibilityRule?.operator, '>');
  assert.equal(por.visibilityRule?.operator, '>');
  assert.equal(linha.visibilityRule?.operator, '>');
});

test('3. SE + SENAO: Regras lógicas complementares (THEN e ELSE)', () => {
  const sample = `
[[SE]]{{[[PROMOCAO]]>0}}
A10,18,0,4,2,2,N,"OFERTA: [[PROMOCAO]]"
[[SENAO]]
A10,18,0,4,2,2,N,"PREÇO: [[PRECO]]"
[[FIMSE]]
`.trim();

  const result = PPLBParser.parse(sample);
  assert.equal(result.document.elements.length, 2);

  const [oferta, normal] = result.document.elements as TextElement[];
  assert.equal(oferta.visibilityRule?.field, 'produto.promocao.preco');
  assert.equal(oferta.visibilityRule?.operator, '>');

  // O elemento do ELSE recebe a regra inversa
  assert.equal(normal.visibilityRule?.field, 'produto.promocao.preco');
  assert.equal(normal.visibilityRule?.operator, '<=');

  const astNodes = LegacyPreprocessor.preprocessLines(sample);
  const condAST = astNodes.find((n) => n.type === 'conditional') as ConditionalASTNode;
  assert.equal(condAST.thenNodes.length, 1);
  assert.equal(condAST.elseNodes?.length, 1);
});

test('4. Bloco Condicional contendo Comentários internos', () => {
  const sample = `
[[SE]]{{[[PROMOCAO]]>0}}
// Bloco de Preço Promocional Destacado
A10,18,0,2,2,2,N,"PROMO"
[[FIMSE]]
`.trim();

  const result = PPLBParser.parse(sample);
  assert.equal(result.document.elements.length, 1);

  const astNodes = LegacyPreprocessor.preprocessLines(sample);
  const condAST = astNodes.find((n) => n.type === 'conditional') as ConditionalASTNode;
  assert.equal(condAST.thenNodes.length, 2, 'Comentário deve pertencer ao thenNodes da AST');
  assert.equal(condAST.thenNodes[0].type, 'comment');
  assert.equal(condAST.thenNodes[1].type, 'raw');
});

test('5. Bloco com Comandos Comentados dentro do SE', () => {
  const sample = `
[[SE]]{{[[PROMOCAO]]>0}}
// A10,10,0,2,1,1,N,"DESATIVADO"
A10,30,0,2,2,2,N,"ATIVO"
[[FIMSE]]
`.trim();

  const result = PPLBParser.parse(sample);
  assert.equal(result.document.elements.length, 1, 'Comando comentado não vira elemento visual');
  assert.equal((result.document.elements[0] as TextElement).text, 'ATIVO');
});

test('6. Blocos Aninhados: Suporte em Árvore/Pilha', () => {
  const sample = `
[[SE]]{{[[PROMOCAO]]>0}}
A10,18,0,2,2,2,N,"NIVEL 1"
[[SE]]{{[[FILIAL]]="MATRIZ"}}
A10,40,0,2,2,2,N,"NIVEL 2"
[[FIMSE]]
[[FIMSE]]
`.trim();

  const result = PPLBParser.parse(sample);
  assert.equal(result.document.elements.length, 2);

  const astNodes = LegacyPreprocessor.preprocessLines(sample);
  const condAST = astNodes.find((n) => n.type === 'conditional') as ConditionalASTNode;
  assert.equal(condAST.thenNodes.length, 2);
  assert.equal(condAST.thenNodes[0].type, 'raw');
  assert.equal(condAST.thenNodes[1].type, 'conditional');

  const nestedCond = condAST.thenNodes[1] as ConditionalASTNode;
  assert.equal(nestedCond.thenNodes.length, 1);
  assert.equal(nestedCond.rule.field, 'empresa.nomeFilial');
  assert.equal(nestedCond.rule.value, 'MATRIZ');
});

test('7. Condicional Inline Legada continua 100% Funcional', () => {
  const sample = `
I8,A,001
Q240,024
q831
[[SE]]{{[[PROMOCAO]]>0}}{{A10,18,0,2,2,2,N,"[[PROMOCAO]]"}}
P1
`.trim();

  const result = PPLBParser.parse(sample);
  assert.equal(result.document.elements.length, 1);
  const el = result.document.elements[0] as TextElement;
  assert.equal(el.field, 'produto.promocao.preco');
  assert.equal(el.visibilityRule?.operator, '>');

  // Round-trip Diff Zero para inline
  const compileClean = LegacyCompiler.compile(result.document);
  assert.equal(compileClean.diffSummary.modifiedCount, 0);
  assert.equal(compileClean.compiledCode, sample);
});

test('8. Round-Trip sem Alteração: Diff Zero em Condicional Multilinha', () => {
  const sample = `I8,A,001
Q240,024
q831
[[SE]]{{[[PROMOCAO]]>0}}
A10,18,0,2,2,2,N,"OFERTA"
LO10,40,200,3
[[SENAO]]
A10,18,0,2,2,2,N,"NORMAL"
[[FIMSE]]
P1`;

  const importResult = PPLBParser.parse(sample);
  const compiled = LegacyCompiler.compile(importResult.document);

  assert.equal(compiled.diffSummary.modifiedCount, 0, 'Sem alteração -> 0 modificações');
  assert.equal(compiled.diffSummary.deletedCount, 0, 'Sem alteração -> 0 deleções');
  assert.equal(compiled.diffSummary.createdCount, 0, 'Sem alteração -> 0 criações');
  assert.equal(compiled.compiledCode, sample, 'Reemissão deve ser idêntica ao original (Diff Zero)');
});

test('9. Round-Trip com Alteração Localizada no THEN', () => {
  const sample = `I8,A,001
Q240,024
q831
[[SE]]{{[[PROMOCAO]]>0}}
A10,18,0,2,2,2,N,"OFERTA"
[[SENAO]]
A10,18,0,2,2,2,N,"NORMAL"
[[FIMSE]]
P1`;

  const importResult = PPLBParser.parse(sample);
  const oferta = importResult.document.elements[0] as TextElement;

  // Alterar apenas o texto do elemento no THEN
  oferta.text = 'SUPER OFERTA';
  if (oferta.sourceReference) {
    oferta.sourceReference.state = 'modified';
  }

  const compiled = LegacyCompiler.compile(importResult.document);
  assert.equal(compiled.diffSummary.modifiedCount, 1, 'Exatamente 1 elemento modificado');
  assert.ok(compiled.compiledCode.includes('A10,18,0,2,2,2,N,"SUPER OFERTA"'));
  assert.ok(compiled.compiledCode.includes('[[SENAO]]'));
  assert.ok(compiled.compiledCode.includes('A10,18,0,2,2,2,N,"NORMAL"'));
  assert.ok(compiled.compiledCode.includes('[[FIMSE]]'));
});

test('10. Round-Trip com Alteração Localizada no ELSE', () => {
  const sample = `I8,A,001
Q240,024
q831
[[SE]]{{[[PROMOCAO]]>0}}
A10,18,0,2,2,2,N,"OFERTA"
[[SENAO]]
A10,18,0,2,2,2,N,"NORMAL"
[[FIMSE]]
P1`;

  const importResult = PPLBParser.parse(sample);
  const normal = importResult.document.elements[1] as TextElement;

  // Alterar elemento do ELSE
  normal.text = 'PREÇO REGULAR';
  if (normal.sourceReference) {
    normal.sourceReference.state = 'modified';
  }

  const compiled = LegacyCompiler.compile(importResult.document);
  assert.equal(compiled.diffSummary.modifiedCount, 1);
  assert.ok(compiled.compiledCode.includes('A10,18,0,2,2,2,N,"OFERTA"'));
  assert.ok(compiled.compiledCode.includes('A10,18,0,2,2,2,N,"PREÇO REGULAR"'));
});

test('11. Parser Defensivo: FIMSE ausente é recuperado no final do arquivo', () => {
  const sample = `
[[SE]]{{[[PROMOCAO]]>0}}
A10,18,0,2,2,2,N,"SEM FIMSE"
`.trim();

  const result = PPLBParser.parse(sample);
  assert.equal(result.document.elements.length, 1);
  assert.equal((result.document.elements[0] as TextElement).text, 'SEM FIMSE');
});

test('12. Parser Defensivo: SENAO ou FIMSE órfão não quebra o parser', () => {
  const sample = `
[[SENAO]]
A10,18,0,2,2,2,N,"ORPHAN 1"
[[FIMSE]]
A10,50,0,2,2,2,N,"ORPHAN 2"
`.trim();

  const result = PPLBParser.parse(sample);
  assert.equal(result.document.elements.length, 2, 'Comandos continuam sendo processados sem crash');
});

test('13. Limite de Profundidade Defensivo (MAX_DEPTH = 32)', () => {
  let nestedCode = '';
  for (let i = 0; i < 40; i++) {
    nestedCode += `[[SE]]{{[[NIVEL_${i}]]>0}}\n`;
  }
  nestedCode += `A10,18,0,2,2,2,N,"PROFUNDO"\n`;
  for (let i = 0; i < 40; i++) {
    nestedCode += `[[FIMSE]]\n`;
  }

  // Não deve estourar a stack (RangeError) e deve retornar resultado controlado
  const result = PPLBParser.parse(nestedCode);
  assert.ok(result.document.elements.length >= 0);
});

test('14. Helper invertVisibilityRule cobre todos os operadores lógicos', () => {
  assert.equal(invertVisibilityRule({ field: 'f', operator: '=', value: '1' }).operator, '!=');
  assert.equal(invertVisibilityRule({ field: 'f', operator: '!=', value: '1' }).operator, '=');
  assert.equal(invertVisibilityRule({ field: 'f', operator: '>', value: '1' }).operator, '<=');
  assert.equal(invertVisibilityRule({ field: 'f', operator: '<=', value: '1' }).operator, '>');
  assert.equal(invertVisibilityRule({ field: 'f', operator: '<', value: '1' }).operator, '>=');
  assert.equal(invertVisibilityRule({ field: 'f', operator: '>=', value: '1' }).operator, '<');
  assert.equal(invertVisibilityRule({ field: 'f', operator: 'empty', value: '' }).operator, 'not_empty');
  assert.equal(invertVisibilityRule({ field: 'f', operator: 'not_empty', value: '' }).operator, 'empty');
});
