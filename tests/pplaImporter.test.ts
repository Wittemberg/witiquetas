import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLabelFormat,
  PPLAParser,
  LegacyCompiler,
  parseImportContent,
} from '../apps/frontend/src/editor/importers/index.ts';
import type { TextElement, PriceElement, BarcodeElement, LineElement } from '../packages/label-schema/src/types.ts';

const REAL_PPLA_FIXTURE = `[[CHAR02]]O0220[[CHAR13]]
[[CHAR02]]M3500[[CHAR13]]
LC0000
H[[TEMPERATURA]]
D11
121100000100018[[NOME,0,18]]
121100000100042[[NOME,18,18]]
121100000100066[[NOME,36,18]]
121100000100090[[NOME,54,18]]
1X1100000500010L000100002
1F1104000300050[[BARRA]]
[[SE]]{{frente}}[[SE]]{{prateleira}}121100000020130F: [[frente]] P: [[prateleira]]
[[SE]]{{precoAtacadista}}121100000800020ATACADO: R$ [[precoAtacadista]]
[[SE]]{{cd_regraPrecos}}121100000800045LEVE [[regraPrecosquantidade]] POR R$ [[regraPrecospreco]]
[[SE]]{{regraPrecosquantidade2}}121100000800070LEVE [[regraPrecosquantidade2]] POR R$ [[regraPrecospreco2]]
[[SE]]{{regraPrecosquantidade3}}121100000800095LEVE [[regraPrecosquantidade3]] POR R$ [[regraPrecospreco3]]
121100001000120R$ [[PRECO]]
Q[[QUANTIDADE]]
E`;

test('1. Detecção por Score: Identifica PPLA com alta confiança sem confusão com PPLB', () => {
  const detection = detectLabelFormat(REAL_PPLA_FIXTURE);
  assert.equal(detection.language, 'ppla', 'Linguagem deve ser detectada como PPLA');
  assert.ok(detection.confidence >= 70, `Confiança (${detection.confidence}%) deve ser alta`);
  assert.ok(detection.scores.ppla > detection.scores.pplb, 'Score PPLA deve superar score PPLB');
  assert.ok(detection.reasons.length > 0, 'Deve listar razões diagnósticas da detecção');
});

test('2. Parser PPLA: Extrai corretamente cabeçalhos, comandos de controle e elementos visuais', async () => {
  const result = await parseImportContent(REAL_PPLA_FIXTURE);
  assert.ok(result.document, 'Documento deve ser gerado');
  assert.equal(result.document.sourceFile?.format, 'ppla');

  // Não deve criar elementos visuais para comandos de controle (CHAR02, O0220, M3500, LC0000, H, D11, Q, E)
  const nonVisuals = result.document.elements.filter((el) =>
    ['O0220', 'M3500', 'LC0000', 'D11', 'CHAR02'].some((kw) => el.name?.includes(kw) || (el as any).text?.includes(kw))
  );
  assert.equal(nonVisuals.length, 0, 'Comandos de controle de impressora não devem virar elementos visuais no canvas');

  // Deve encontrar elementos de texto do nome com substring
  const nomeElements = result.document.elements.filter((el) => el.type === 'text' && (el as TextElement).field === 'produto.descricao');
  assert.equal(nomeElements.length, 4, 'Devem existir 4 linhas de recorte de nome do produto');
  assert.deepEqual((nomeElements[0] as TextElement).transformations, [{ type: 'substring', start: 0, length: 18 }]);
  assert.deepEqual((nomeElements[1] as TextElement).transformations, [{ type: 'substring', start: 18, length: 18 }]);

  // Deve encontrar a linha divisória gráfica 1X...
  const lineElement = result.document.elements.find((el) => el.type === 'line') as LineElement;
  assert.ok(lineElement, 'Linha gráfica 1X deve ser reconhecida como LineElement');

  // Deve encontrar o código de barras 1F...
  const barcodeElement = result.document.elements.find((el) => el.type === 'barcode') as BarcodeElement;
  assert.ok(barcodeElement, 'Código de barras 1F deve ser reconhecido como BarcodeElement');
  assert.equal(barcodeElement.field, 'produto.ean');

  // Deve encontrar o preço normal 12110...R$ [[PRECO]]
  const priceElement = result.document.elements.find(
    (el) => el.type === 'price' && (el as PriceElement).field === 'produto.preco'
  ) as PriceElement;
  assert.ok(priceElement, 'Preço R$ [[PRECO]] deve ser reconhecido como PriceElement com produto.preco');
  assert.equal(priceElement.field, 'produto.preco');

  // Elementos com condicionais encadeadas [[SE]]{{frente}}[[SE]]{{prateleira}}...
  const condElements = result.document.elements.filter((el) => el.visibilityRule !== undefined);
  assert.ok(condElements.length >= 5, 'Elementos condicionais devem manter suas regras');
});

test('3. Golden Zero-Change PPLA: Importação e exportação direta geram Diff Zero exato', async () => {
  const result = await parseImportContent(REAL_PPLA_FIXTURE);
  const roundTrip = LegacyCompiler.compile(result.document);

  assert.equal(
    roundTrip.compiledCode.trim(),
    REAL_PPLA_FIXTURE.trim(),
    'O código recompilado sem alterações deve ser 100% idêntico ao original'
  );

  assert.equal(roundTrip.diffSummary.modifiedCount, 0, 'Nenhuma linha modificada');
  assert.equal(roundTrip.diffSummary.createdCount, 0, 'Nenhuma linha criada');
  assert.equal(roundTrip.diffSummary.deletedCount, 0, 'Nenhuma linha deletada');
  assert.ok(
    roundTrip.diffSummary.lines.every((l) => l.type === 'unchanged'),
    'Todas as linhas do diff devem ser unchanged'
  );
});

test('4. Alteração Localizada PPLA: Modificar um único elemento altera apenas a linha correspondente', async () => {
  const result = await parseImportContent(REAL_PPLA_FIXTURE);
  const doc = result.document;

  // Modificar apenas o preço
  const priceElem = doc.elements.find((el) => el.type === 'price')!;
  assert.ok(priceElem);

  const updatedDoc = {
    ...doc,
    elements: doc.elements.map((el) => {
      if (el.id === priceElem.id) {
        return {
          ...el,
          x: 20, // mudou coordenada X
          sourceReference: {
            ...el.sourceReference,
            state: 'modified' as const,
          },
        };
      }
      return el;
    }),
  };

  const roundTrip = LegacyCompiler.compile(updatedDoc);
  assert.equal(roundTrip.diffSummary.modifiedCount, 1, 'Exatamente 1 linha deve constar como modificada');
  assert.equal(roundTrip.diffSummary.createdCount, 0);
  assert.equal(roundTrip.diffSummary.deletedCount, 0);

  // Cabeçalhos continuam intactos
  assert.ok(roundTrip.compiledCode.includes('[[CHAR02]]O0220[[CHAR13]]'));
  assert.ok(roundTrip.compiledCode.includes('[[CHAR02]]M3500[[CHAR13]]'));
  assert.ok(roundTrip.compiledCode.includes('LC0000'));
  assert.ok(roundTrip.compiledCode.includes('H[[TEMPERATURA]]'));
  assert.ok(roundTrip.compiledCode.includes('D11'));
  assert.ok(roundTrip.compiledCode.includes('Q[[QUANTIDADE]]'));
  assert.ok(roundTrip.compiledCode.includes('E'));
});
