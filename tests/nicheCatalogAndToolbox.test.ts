import assert from 'node:assert';
import { test, describe } from 'node:test';
import {
  NICHES,
  LABEL_SIZES_CATALOG,
  NICHE_SIZE_RELATIONS,
  CANONICAL_NICHE_PROFILES,
  getSizesByNiche,
  normalizeNicheId,
  normalizeOperationalProfileId,
  getNicheProfile,
  getNicheToolboxConfig,
  NICHE_TOOLBOX_CONFIGS,
} from '../packages/label-schema/dist/index.js';

describe('HOTFIX 4.5.3 — Validação de Invariantes do Catálogo Histórico e Toolbox por Nicho', () => {

  test('1. Existem exatamente 11 nichos históricos', () => {
    assert.strictEqual(NICHES.length, 11, 'Deve conter 11 nichos concretos');
  });

  test('2. Existem exatamente 66 tamanhos físicos únicos', () => {
    assert.strictEqual(LABEL_SIZES_CATALOG.length, 66, 'Deve conter 66 tamanhos físicos no banco global');
  });

  test('3. Existem exatamente 112 relações niche-size', () => {
    assert.strictEqual(NICHE_SIZE_RELATIONS.length, 112, 'Deve conter 112 associações no banco histórico');
  });

  test('4 a 14. Quantidades exatas de tamanhos por nicho', () => {
    assert.strictEqual(getSizesByNiche('gondola-supermercado').length, 11, 'Gôndola deve ter 11 tamanhos');
    assert.strictEqual(getSizesByNiche('produto-codigo-barras').length, 24, 'Produto/EAN deve ter 24 tamanhos');
    assert.strictEqual(getSizesByNiche('logistica-expedicao-ecommerce').length, 15, 'Logística deve ter 15 tamanhos');
    assert.strictEqual(getSizesByNiche('farmacia-medicamentos').length, 11, 'Farmácia deve ter 11 tamanhos');
    assert.strictEqual(getSizesByNiche('hospital-identificacao').length, 6, 'Hospital deve ter 6 tamanhos');
    assert.strictEqual(getSizesByNiche('laboratorio').length, 7, 'Laboratório deve ter 7 tamanhos');
    assert.strictEqual(getSizesByNiche('banco-sangue-hemoterapia').length, 4, 'Banco de Sangue deve ter 4 tamanhos');
    assert.strictEqual(getSizesByNiche('joalheria-otica').length, 10, 'Joalheria deve ter 10 tamanhos');
    assert.strictEqual(getSizesByNiche('confeccao-vestuario').length, 9, 'Confecção deve ter 9 tamanhos');
    assert.strictEqual(getSizesByNiche('patrimonio-inventario').length, 9, 'Patrimônio deve ter 9 tamanhos');
    assert.strictEqual(getSizesByNiche('uso-geral').length, 6, 'Uso Geral deve ter 6 tamanhos');
  });

  test('15. Featured histórico e ordenação', () => {
    const gondolaSizes = getSizesByNiche('gondola-supermercado');
    assert.strictEqual(gondolaSizes[0].widthMm, 100);
    assert.strictEqual(gondolaSizes[0].heightMm, 30);
    assert.strictEqual(gondolaSizes[0].featured, true, '100x30 deve ser o destaque (Mais usado) de gôndola');

    const logisticsSizes = getSizesByNiche('logistica-expedicao-ecommerce');
    assert.strictEqual(logisticsSizes[0].widthMm, 100);
    assert.strictEqual(logisticsSizes[0].heightMm, 150);
    assert.strictEqual(logisticsSizes[0].featured, true, '100x150 deve ser o destaque de logística');
  });

  test('17 a 24. Mapeamento de Nicho para Profile sem destruir nicheId', () => {
    NICHES.forEach((n) => {
      assert.ok(n.profileId, `Nicho ${n.id} deve possuir profileId`);
      assert.ok(['retail', 'hospital', 'laboratory', 'logistics', 'industry', 'food', 'pharmacy'].includes(n.profileId));
    });

    assert.strictEqual(normalizeOperationalProfileId('hospital-identificacao'), 'hospital');
    assert.strictEqual(normalizeOperationalProfileId('banco-sangue-hemoterapia'), 'hospital');
    assert.strictEqual(normalizeOperationalProfileId('gondola-supermercado'), 'retail');
    assert.strictEqual(normalizeOperationalProfileId('joalheria-otica'), 'retail');
    assert.strictEqual(normalizeOperationalProfileId('patrimonio-inventario'), 'industry');

    // Preservação do nicheId específico
    assert.strictEqual(normalizeNicheId('banco-sangue-hemoterapia'), 'banco-sangue-hemoterapia');
    assert.strictEqual(normalizeNicheId('hospital-identificacao'), 'hospital-identificacao');
    assert.strictEqual(normalizeNicheId('gondola-supermercado'), 'gondola-supermercado');
  });

  test('25 a 54. Toolbox por Nicho e visibilidade de ferramentas (recommended / available / hidden)', () => {
    // Todos os 11 nichos possuem toolbox config
    NICHES.forEach((n) => {
      const cfg = getNicheToolboxConfig(n.slug);
      assert.ok(cfg, `Nicho ${n.slug} deve possuir NICHE_TOOLBOX_CONFIG`);
      assert.ok(cfg.recommendedTools.length > 0, `Nicho ${n.slug} deve ter recommendedTools`);
    });

    // PACOTE 4.5.5: Gôndola tem Preço unificado (promotional-price removido)
    const gondolaBox = getNicheToolboxConfig('gondola-supermercado');
    const gondolaRecIds = gondolaBox.recommendedTools.map((t) => t.toolId);
    assert.ok(gondolaRecIds.includes('price'), 'Gôndola deve ter price em recommendedTools');
    assert.strictEqual(gondolaRecIds.includes('promotional-price'), false, 'PACOTE 4.5.5: Gôndola NÃO deve ter promotional-price');

    // Hospital NÃO tem Preço e Preço Promo em NENHUMA lista
    const hospitalBox = getNicheToolboxConfig('hospital-identificacao');
    const hospitalAllIds = [...hospitalBox.recommendedTools, ...hospitalBox.availableTools].map((t) => t.toolId);
    assert.strictEqual(hospitalAllIds.includes('price'), false, 'Hospital NÃO deve ter price');
    assert.strictEqual(hospitalAllIds.includes('promotional-price'), false, 'Hospital NÃO deve ter promotional-price');
    assert.ok(hospitalBox.hiddenTools.includes('price'), 'price deve estar em hiddenTools de Hospital');

    // Laboratório NÃO tem Preço
    const labBox = getNicheToolboxConfig('laboratorio');
    const labAllIds = [...labBox.recommendedTools, ...labBox.availableTools].map((t) => t.toolId);
    assert.strictEqual(labAllIds.includes('price'), false, 'Laboratório NÃO deve ter price');
    assert.ok(labBox.hiddenTools.includes('price'));

    // Banco de Sangue NÃO tem Preço e possui DIN (donation-id) e ABO/Rh
    const bloodBox = getNicheToolboxConfig('banco-sangue-hemoterapia');
    const bloodRecIds = bloodBox.recommendedTools.map((t) => t.toolId);
    assert.ok(bloodRecIds.includes('donation-id'), 'Banco de Sangue deve ter donation-id');
    assert.ok(bloodRecIds.includes('abo-rh'), 'Banco de Sangue deve ter abo-rh');
    assert.ok(bloodBox.hiddenTools.includes('price'));

    // Logística possui SSCC
    const logBox = getNicheToolboxConfig('logistica-expedicao-ecommerce');
    const logRecIds = logBox.recommendedTools.map((t) => t.toolId);
    assert.ok(logRecIds.includes('sscc'), 'Logística deve ter SSCC');

    // Patrimônio possui Asset ID e NÃO tem Preço
    const assetBox = getNicheToolboxConfig('patrimonio-inventario');
    const assetRecIds = assetBox.recommendedTools.map((t) => t.toolId);
    assert.ok(assetRecIds.includes('asset-id'), 'Patrimônio deve ter asset-id');
    assert.ok(assetBox.hiddenTools.includes('price'));
  });

});
