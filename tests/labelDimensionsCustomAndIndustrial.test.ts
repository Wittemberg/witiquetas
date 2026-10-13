import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LABEL_SIZES_CATALOG,
  NICHE_SIZE_RELATIONS,
  INDUSTRIAL_LABEL_PRESETS,
  createCustomLabelSize,
  validateLabelDimensionsAgainstPrinter,
  LabelDocumentSchema,
  getSizesByNiche,
} from '@witiquetas/label-schema';
import {
  validateLabelDimensionsAgainstPrinter as validateContractsPrinter,
  PrinterCapabilitiesDTO,
} from '@witiquetas/contracts';

test('TRACK B — LABEL DIMENSIONS & INDUSTRIAL CUSTOM SIZES (UP TO 200MM)', async (t) => {
  await t.test('1. Invariantes canônicos do catálogo histórico permanecem rigorosamente intactos (11 nichos, 66 tamanhos, 112 relações)', () => {
    assert.strictEqual(LABEL_SIZES_CATALOG.length, 66, 'LABEL_SIZES_CATALOG deve preservar os 66 tamanhos históricos');
    assert.strictEqual(NICHE_SIZE_RELATIONS.length, 112, 'NICHE_SIZE_RELATIONS deve preservar as 112 relações históricas');

    // Presença de tamanhos industriais pré-existentes
    const size100x200 = LABEL_SIZES_CATALOG.find((s) => s.widthMm === 100 && s.heightMm === 200);
    assert.ok(size100x200, 'Tamanho 100x200mm deve existir no catálogo histórico');
  });

  await t.test('2. Presets Industriais Longos (100x200mm e 105x200mm) disponíveis na constante oficial', () => {
    assert.strictEqual(INDUSTRIAL_LABEL_PRESETS.length, 2);
    const p1 = INDUSTRIAL_LABEL_PRESETS.find((p) => p.widthMm === 100 && p.heightMm === 200);
    const p2 = INDUSTRIAL_LABEL_PRESETS.find((p) => p.widthMm === 105 && p.heightMm === 200);

    assert.ok(p1, 'Preset industrial 100x200mm deve existir');
    assert.ok(p2, 'Preset industrial 105x200mm deve existir');
    assert.strictEqual(p1.heightMm, 200);
    assert.strictEqual(p2.heightMm, 200);
  });

  await t.test('3. Criação dinâmica de tamanhos personalizados com validação estrita de números positivos', () => {
    // Casos válidos
    const custom1 = createCustomLabelSize(100, 200);
    assert.strictEqual(custom1.widthMm, 100);
    assert.strictEqual(custom1.heightMm, 200);
    assert.ok(custom1.id.startsWith('custom-100x200'));

    const custom2 = createCustomLabelSize(105, 150);
    assert.strictEqual(custom2.widthMm, 105);
    assert.strictEqual(custom2.heightMm, 150);

    // Rejeição de valores não positivos / inválidos
    assert.throws(() => createCustomLabelSize(0, 100), /Largura inválida/);
    assert.throws(() => createCustomLabelSize(-10, 100), /Largura inválida/);
    assert.throws(() => createCustomLabelSize(100, 0), /Altura\/comprimento inválido/);
    assert.throws(() => createCustomLabelSize(100, -50), /Altura\/comprimento inválido/);
    assert.throws(() => createCustomLabelSize(NaN, 100), /Largura inválida/);
    assert.throws(() => createCustomLabelSize(100, NaN), /Altura\/comprimento inválido/);
  });

  await t.test('4. Validação física contra capacidades da impressora: maxWidthMm limita APENAS a largura (X), nunca o comprimento (Y)', () => {
    const printerStandard: Partial<PrinterCapabilitiesDTO> = {
      maxWidthMm: 104,
    };

    // Caso 1: Etiqueta 100x200mm em impressora com maxWidthMm 104mm => VÁLIDA (largura 100 <= 104)
    const res1 = validateLabelDimensionsAgainstPrinter({ widthMm: 100, heightMm: 200 }, printerStandard);
    assert.strictEqual(res1.valid, true, 'Etiqueta 100x200 deve ser válida em impressora de cabeçote 104mm');
    assert.strictEqual(res1.errors.length, 0);
    assert.ok(res1.warnings.some((w) => w.includes('200mm')), 'Deve emitir nota/aviso sobre sensor de etiqueta longa');

    // Caso 2: Etiqueta 105x200mm em impressora com maxWidthMm 104mm => INVÁLIDA na largura (105 > 104)
    const res2 = validateLabelDimensionsAgainstPrinter({ widthMm: 105, heightMm: 200 }, printerStandard);
    assert.strictEqual(res2.valid, false, 'Largura 105 excede cabeçote 104mm');
    assert.ok(res2.errors.some((e) => e.includes('excede a largura máxima')));

    // Caso 3: Impressora de grande porte (maxWidthMm 168mm) => 105x200mm VÁLIDA
    const printerWide: Partial<PrinterCapabilitiesDTO> = {
      maxWidthMm: 168,
    };
    const res3 = validateLabelDimensionsAgainstPrinter({ widthMm: 105, heightMm: 200 }, printerWide);
    assert.strictEqual(res3.valid, true);

    // Caso 4: Sem capacidades informadas => não fazer suposições falsas, aprovar dimensões válidas
    const res4 = validateLabelDimensionsAgainstPrinter({ widthMm: 105, heightMm: 200 }, undefined);
    assert.strictEqual(res4.valid, true, 'Sem capacidades da impressora não se deve barrar dimensões válidas');
  });

  await t.test('5. Roundtrip de persistência em LabelDocument com dimensões de 200mm', () => {
    const doc = {
      schemaVersion: 1,
      title: 'Etiqueta Industrial Teste',
      nicheId: 'logistica-expedicao-ecommerce',
      nicheName: 'Logística / Expedição',
      dimensions: {
        widthMm: 100,
        heightMm: 200,
        dpi: 203,
      },
      elements: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parseResult = LabelDocumentSchema.safeParse(doc);
    assert.strictEqual(parseResult.success, true, 'LabelDocumentSchema deve validar etiqueta de 100x200mm');
    if (parseResult.success) {
      assert.strictEqual(parseResult.data.dimensions.widthMm, 100);
      assert.strictEqual(parseResult.data.dimensions.heightMm, 200);
    }
  });

  await t.test('6. Pacote contracts exporta a função canônica de validação idêntica', () => {
    const res = validateContractsPrinter({ widthMm: 100, heightMm: 200 }, { maxWidthMm: 104 });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.errors.length, 0);
  });
});
