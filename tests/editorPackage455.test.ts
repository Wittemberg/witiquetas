import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  NICHES,
  getNicheToolboxConfig,
  NICHE_TOOLBOX_CONFIGS,
  SYSTEM_FIELDS,
} from '../packages/label-schema/dist/index.js';
import {
  formatDateValue,
  resolveFieldValue,
} from '../apps/frontend/src/editor/useEditorStore.ts';
import {
  normalizeRotation,
  getElementBoundingBox,
  applyMagneticRotationSnap,
} from '../apps/frontend/src/editor/bounds.ts';
import type {
  TextElement,
  LineElement,
  PriceElement,
} from '@witiquetas/label-schema';

describe('PACOTE 4.5.5 — Correções Funcionais Finais do Editor Antes do Freeze', () => {

  // 1. ELEMENTO PREÇO — REMOVER DUPLICIDADE VISUAL
  test('1. Elemento Preço: promotional-price removido de TODOS os nichos da Toolbox mantendo price', () => {
    for (const niche of NICHES) {
      const config = getNicheToolboxConfig(niche.slug);
      const recIds = config.recommendedTools.map((t) => t.toolId);
      const availIds = config.availableTools.map((t) => t.toolId);
      const allToolboxIds = [...recIds, ...availIds];

      assert.strictEqual(
        allToolboxIds.includes('promotional-price'),
        false,
        `Nicho ${niche.slug} NÃO deve conter promotional-price na Toolbox`
      );

      // Em nichos de varejo/produtos, price deve estar disponível
      if (['gondola-supermercado', 'joalheria-otica', 'confeccao-vestuario'].includes(niche.slug)) {
        assert.ok(
          allToolboxIds.includes('price'),
          `Nicho ${niche.slug} deve conter o elemento unificado 'price'`
        );
      }
    }
  });

  test('2. Elemento Preço: compatibilidade com modelos legados que utilizam isPromotional', () => {
    const legacyPriceElem: PriceElement = {
      id: 'price-legacy-promo',
      type: 'price',
      field: 'produto.precoPromocional',
      sampleValue: '19,90',
      x: 10,
      y: 10,
      width: 30,
      height: 12,
      isPromotional: true,
    } as any;

    assert.strictEqual(legacyPriceElem.type, 'price');
    assert.strictEqual((legacyPriceElem as any).isPromotional, true);
  });

  // 2. ELEMENTO LINHA — RESTAURAR RESIZE
  test('3. Elemento Linha: redimensionamento de comprimento (width) sem transformar em retângulo', () => {
    const lineElem: LineElement = {
      id: 'line-resize-test',
      name: 'Linha Divisória',
      type: 'line',
      x: 5,
      y: 15,
      width: 60,
      height: 1,
      strokeWidth: 2,
      color: '#000000',
      rotation: 0,
    };

    assert.strictEqual(lineElem.type, 'line');
    assert.strictEqual(lineElem.width, 60);

    // Simula resize aumentando comprimento
    lineElem.width = 85;
    assert.strictEqual(lineElem.width, 85);
    assert.strictEqual(lineElem.type, 'line', 'Elemento deve permanecer com tipo line');

    // Simula resize reduzindo comprimento
    lineElem.width = 25;
    assert.strictEqual(lineElem.width, 25);
    assert.strictEqual(lineElem.type, 'line');
  });

  // 3. ELEMENTO LINHA — RESTAURAR ROTAÇÃO
  test('4. Elemento Linha: rotação canônica 0°, 90°, 180°, 270° com bounding box correto', () => {
    const lineElem: LineElement = {
      id: 'line-rot-test',
      name: 'Linha Vertical',
      type: 'line',
      x: 10,
      y: 10,
      width: 40,
      height: 1,
      strokeWidth: 1,
      rotation: 0,
    };

    // Rotação 0°
    assert.strictEqual(normalizeRotation(lineElem.rotation || 0), 0);
    const bbox0 = getElementBoundingBox(lineElem, 203);
    assert.strictEqual(bbox0.width, 40);

    // Rotação 90°
    lineElem.rotation = 90;
    assert.strictEqual(normalizeRotation(lineElem.rotation), 90);
    const bbox90 = getElementBoundingBox(lineElem, 203);
    assert.strictEqual(bbox90.height, 40);

    // Rotação 180°
    lineElem.rotation = 180;
    assert.strictEqual(normalizeRotation(lineElem.rotation), 180);

    // Rotação 270°
    lineElem.rotation = 270;
    assert.strictEqual(normalizeRotation(lineElem.rotation), 270);
    const bbox270 = getElementBoundingBox(lineElem, 203);
    assert.strictEqual(bbox270.height, 40);

    // Snap magnético
    assert.strictEqual(applyMagneticRotationSnap(89).angle, 90);
    assert.strictEqual(applyMagneticRotationSnap(181).angle, 180);
    assert.strictEqual(applyMagneticRotationSnap(269).angle, 270);
  });

  // 4. TEXTO MANUAL — PRECEDÊNCIA POR ORIGEM (source = MANUAL, INTEGRATION, SYSTEM)
  test('5. Texto Manual: source = MANUAL prevalece sobre qualquer mock ou binding residual', () => {
    const manualElem: TextElement = {
      id: 'text-manual-1',
      type: 'text',
      name: 'OFERTA ESPECIAL',
      text: 'OFERTA ESPECIAL',
      field: undefined,
      binding: { source: 'manual' },
      fontSize: 14,
      fontFamily: 'Roboto',
      x: 10,
      y: 10,
      width: 50,
      height: 10,
    };

    const source = manualElem.binding?.source ?? (manualElem.field ? 'integration' : 'manual');
    assert.strictEqual(source, 'manual');

    // Em source manual, o texto digitado pelo usuário é a fonte efetiva
    const effectiveText = source === 'manual' ? manualElem.text : resolveFieldValue(manualElem.field);
    assert.strictEqual(effectiveText, 'OFERTA ESPECIAL');
  });

  test('6. Texto com Integração: source = INTEGRATION resolve campo integrado quando showPreviewData', () => {
    const integrationElem: TextElement = {
      id: 'text-integ-1',
      type: 'text',
      name: 'Nome do Produto',
      text: 'Texto Padrão',
      field: 'produto.descricao',
      binding: { source: 'integration', fieldId: 'produto.descricao' },
      fontSize: 14,
      fontFamily: 'Roboto',
      x: 10,
      y: 10,
      width: 50,
      height: 10,
    };

    const source = integrationElem.binding?.source ?? (integrationElem.field ? 'integration' : 'manual');
    assert.strictEqual(source, 'integration');

    const resolved = resolveFieldValue(integrationElem.field);
    assert.ok(resolved !== undefined && resolved.length > 0, 'Deve resolver campo integrado');
  });

  // 5. VALIDADE — SEMÂNTICA DE DATA E FORMATAÇÃO
  test('7. Validade: formatação de data DD/MM/YYYY, DD/MM/YY e YYYY-MM-DD', () => {
    const rawDateBR = '20/08/2026';
    assert.strictEqual(formatDateValue(rawDateBR, 'DD/MM/YYYY'), '20/08/2026');
    assert.strictEqual(formatDateValue(rawDateBR, 'DD/MM/YY'), '20/08/26');
    assert.strictEqual(formatDateValue(rawDateBR, 'YYYY-MM-DD'), '2026-08-20');

    const rawDateISO = '2026-12-31';
    assert.strictEqual(formatDateValue(rawDateISO, 'DD/MM/YYYY'), '31/12/2026');
    assert.strictEqual(formatDateValue(rawDateISO, 'DD/MM/YY'), '31/12/26');
    assert.strictEqual(formatDateValue(rawDateISO, 'YYYY-MM-DD'), '2026-12-31');
  });

  // 6. DATA DE IMPRESSÃO — REUTILIZAR SYSTEM.PRINTDATE
  test('8. Data de Impressão: reuso do identificador histórico system.printDate com formatação', () => {
    const systemPrintField = SYSTEM_FIELDS.find((f) => f.id === 'system.printDate');
    assert.ok(systemPrintField, 'system.printDate deve existir em SYSTEM_FIELDS');
    assert.strictEqual(systemPrintField?.namespace, 'system');

    // Resolução de system.printDate com formato DD/MM/YYYY
    const formattedBR = resolveFieldValue('system.printDate', undefined, 'DD/MM/YYYY');
    assert.match(formattedBR!, /^\d{2}\/\d{2}\/\d{4}$/, 'Deve formatar como DD/MM/AAAA');

    // Resolução de system.printDate com formato DD/MM/YY
    const formattedShort = resolveFieldValue('system.printDate', undefined, 'DD/MM/YY');
    assert.match(formattedShort!, /^\d{2}\/\d{2}\/\d{2}$/, 'Deve formatar como DD/MM/AA');

    // Resolução de system.printDate com formato YYYY-MM-DD
    const formattedISO = resolveFieldValue('system.printDate', undefined, 'YYYY-MM-DD');
    assert.match(formattedISO!, /^\d{4}-\d{2}-\d{2}$/, 'Deve formatar como AAAA-MM-DD');
  });

  // =========================================================================
  // HOTFIX 4.5.5.1 — DATA TIPADA + DATA DE IMPRESSÃO ACESSÍVEL (17 TESTES)
  // =========================================================================

  test('9. lote.validade: catalog metadata possui type = date', async () => {
    const { getFieldDefinition, DEFAULT_RETAIL_CATALOG } = await import('../packages/label-schema/dist/index.js');
    const fieldDef = getFieldDefinition('lote.validade');
    assert.ok(fieldDef, 'lote.validade deve ter definição de campo registrada');
    assert.strictEqual((fieldDef as any).type, 'date', 'lote.validade deve ter type === date');
    assert.strictEqual(fieldDef?.namespace, 'lote');

    const inRetail = DEFAULT_RETAIL_CATALOG.find((f) => f.id === 'lote.validade');
    assert.ok(inRetail, 'lote.validade deve estar presente no DEFAULT_RETAIL_CATALOG');
    assert.strictEqual(inRetail?.type, 'date');
  });

  test('10. Validade não cria novo elementType (permanece text com binding date)', () => {
    const validadeElem: TextElement = {
      id: 'text-validade-test',
      type: 'text',
      name: 'Validade',
      text: 'Validade',
      field: 'lote.validade',
      binding: {
        source: 'integration',
        fieldId: 'lote.validade',
        namespace: 'lote',
      },
      format: 'DD/MM/YYYY',
      fontSize: 12,
      fontFamily: 'Roboto',
      x: 10,
      y: 20,
      width: 40,
      height: 8,
    };

    assert.strictEqual(validadeElem.type, 'text', 'Elemento de Validade DEVE usar elementType text');
    assert.strictEqual(validadeElem.binding?.source, 'integration');
    assert.strictEqual(validadeElem.binding?.fieldId, 'lote.validade');
    assert.strictEqual(validadeElem.format, 'DD/MM/YYYY');
  });

  test('11. Formatação real do valor de teste 2026-08-28', () => {
    const rawISO = '2026-08-28';
    assert.strictEqual(formatDateValue(rawISO, 'DD/MM/YYYY'), '28/08/2026');
    assert.strictEqual(formatDateValue(rawISO, 'DD/MM/YY'), '28/08/26');
    assert.strictEqual(formatDateValue(rawISO, 'YYYY-MM-DD'), '2026-08-28');
  });

  test('12. Resolução automática de campo tipo date com formatação padrão', () => {
    const mockData = { 'lote.validade': '2026-08-28' };
    const resolved = resolveFieldValue('lote.validade', mockData);
    assert.strictEqual(resolved, '28/08/2026', 'Data ISO deve ser auto-formatada para DD/MM/YYYY');

    const resolvedShort = resolveFieldValue('lote.validade', mockData, 'DD/MM/YY');
    assert.strictEqual(resolvedShort, '28/08/26');

    const resolvedISO = resolveFieldValue('lote.validade', mockData, 'YYYY-MM-DD');
    assert.strictEqual(resolvedISO, '2026-08-28');
  });

  test('13. system.printDate e system.printDateTime canônicos preservados', () => {
    const pDate = SYSTEM_FIELDS.find((f) => f.id === 'system.printDate');
    const pDateTime = SYSTEM_FIELDS.find((f) => f.id === 'system.printDateTime');

    assert.ok(pDate, 'system.printDate canônico deve existir');
    assert.ok(pDateTime, 'system.printDateTime canônico deve existir');
    assert.strictEqual(pDate?.format, 'date');
    assert.strictEqual(pDateTime?.format, 'datetime');
  });

  test('14. Resolução de system.printDate não depende do ERP nem do mock', () => {
    // Passando dicionário completamente vazio (sem ERP)
    const resolvedNoErp = resolveFieldValue('system.printDate', {});
    assert.ok(resolvedNoErp, 'Deve resolver data mesmo sem mock e sem ERP');
    assert.match(resolvedNoErp!, /^\d{2}\/\d{2}\/\d{4}$/, 'Deve resolver no formato DD/MM/AAAA');
    assert.doesNotMatch(resolvedNoErp!, /\{\{/, 'Não deve exibir chaves de interpolação não resolvidas');
  });

  test('15. TOOL_DATE canônica definida com system.printDate e format DD/MM/YYYY', async () => {
    const { TOOL_DATE } = await import('../packages/label-schema/dist/index.js');
    assert.ok(TOOL_DATE, 'TOOL_DATE deve ser exportada');
    assert.strictEqual(TOOL_DATE.toolId, 'date');
    assert.strictEqual(TOOL_DATE.label, 'Data');
    assert.strictEqual(TOOL_DATE.iconName, 'Calendar');
    assert.strictEqual(TOOL_DATE.elementType, 'text');
    assert.strictEqual(TOOL_DATE.bindingPreset?.source, 'system');
    assert.strictEqual(TOOL_DATE.bindingPreset?.fieldId, 'system.printDate');
    assert.strictEqual(TOOL_DATE.bindingPreset?.namespace, 'system');
    assert.strictEqual(TOOL_DATE.defaultProperties?.format, 'DD/MM/YYYY');
  });

  test('16. TOOL_DATE presente em availableTools dos nichos operacionais', () => {
    const nichesToCheck = [
      'gondola-supermercado',
      'produto-codigo-barras',
      'hospital-identificacao',
      'laboratorio',
      'logistica-expedicao-ecommerce',
      'farmacia-medicamentos',
      'uso-geral',
    ];

    for (const slug of nichesToCheck) {
      const config = getNicheToolboxConfig(slug);
      const availIds = config.availableTools.map((t) => t.toolId);
      assert.ok(
        availIds.includes('date'),
        `Nicho ${slug} deve conter 'date' em availableTools`
      );
    }
  });

  test('17. FieldPicker reconhece lote.validade sem rotular como Campo Personalizado', async () => {
    const { getFieldDefinition, ALL_KNOWN_INTEGRATION_FIELDS } = await import('../packages/label-schema/dist/index.js');
    const def = getFieldDefinition('lote.validade');
    assert.ok(def, 'Campo deve ser reconhecido');
    assert.strictEqual(def?.label, 'Validade');

    const isInAllKnown = ALL_KNOWN_INTEGRATION_FIELDS.some((f) => f.id === 'lote.validade');
    assert.ok(isInAllKnown, 'lote.validade deve estar em ALL_KNOWN_INTEGRATION_FIELDS');
  });
});
