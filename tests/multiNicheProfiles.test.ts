import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_NICHE_PROFILES,
  getNicheProfile,
  normalizeNicheId,
  getIntegrationFieldsByNiche,
  getMockDataByNiche,
  MOCK_NICHE_DATASETS,
  getRequiredIntegrationFields,
  resolveFieldValue,
} from '@witiquetas/label-schema';

import { templateRepository, getSeedTemplates } from '../apps/backend/src/repositories/templateRepository.ts';

describe('PACOTE 4.5 — Perfis Multi-Nicho + Modelos e Dados de Homologação', () => {
  // 1. Identificadores Canônicos Estreitos & Fallback Legado
  it('deve registrar exatamente 7 perfis canônicos de nicho com os IDs estritos esperados', () => {
    const expectedIds = ['retail', 'hospital', 'laboratory', 'logistics', 'industry', 'food', 'pharmacy'];
    const registeredIds = CANONICAL_NICHE_PROFILES.map((p) => p.id);
    assert.deepEqual(registeredIds, expectedIds);
  });

  it('deve normalizar entradas sem nicheId ou legadas para o fallback "retail"', () => {
    assert.equal(normalizeNicheId(undefined), 'retail');
    assert.equal(normalizeNicheId(''), 'retail');
    assert.equal(normalizeNicheId('desconhecido'), 'retail');
    assert.equal(normalizeNicheId('gondola-supermercado'), 'retail');
  });

  it('deve resolver identificadores canônicos para todas as 7 categorias', () => {
    assert.equal(normalizeNicheId('retail'), 'retail');
    assert.equal(normalizeNicheId('hospital'), 'hospital');
    assert.equal(normalizeNicheId('laboratory'), 'laboratory');
    assert.equal(normalizeNicheId('logistics'), 'logistics');
    assert.equal(normalizeNicheId('industry'), 'industry');
    assert.equal(normalizeNicheId('food'), 'food');
    assert.equal(normalizeNicheId('pharmacy'), 'pharmacy');
  });

  // 2. Elementos Recomendados por Nicho (Exclusão de Preço para Hospital/Laboratório)
  it('não deve incluir o elemento "price" como padrão recomendado para Hospital e Laboratório', () => {
    const hospitalProfile = getNicheProfile('hospital');
    const labProfile = getNicheProfile('laboratory');

    assert.equal(hospitalProfile.recommendedElements.includes('price'), false);
    assert.equal(labProfile.recommendedElements.includes('price'), false);
  });

  it('deve incluir o elemento "price" para Varejo e Alimentos', () => {
    const retailProfile = getNicheProfile('retail');
    const foodProfile = getNicheProfile('food');

    assert.equal(retailProfile.recommendedElements.includes('price'), true);
    assert.equal(foodProfile.recommendedElements.includes('price'), true);
  });

  // 3. Catálogos de Campos de Integração por Nicho
  it('deve retornar os campos específicos do nicho para cada perfil', () => {
    const hospitalFields = getIntegrationFieldsByNiche('hospital').map((f) => f.id);
    assert.ok(hospitalFields.includes('paciente.nome'));
    assert.ok(hospitalFields.includes('atendimento.leito'));

    const labFields = getIntegrationFieldsByNiche('laboratory').map((f) => f.id);
    assert.ok(labFields.includes('amostra.tipo'));
    assert.ok(labFields.includes('exame.nome'));

    const logisticsFields = getIntegrationFieldsByNiche('logistics').map((f) => f.id);
    assert.ok(logisticsFields.includes('sscc'));
    assert.ok(logisticsFields.includes('destino'));

    const pharmacyFields = getIntegrationFieldsByNiche('pharmacy').map((f) => f.id);
    assert.ok(pharmacyFields.includes('medicamento.nome'));
    assert.ok(pharmacyFields.includes('medicamento.lote'));
  });

  // 4. Mock Datasets Realistas por Nicho
  it('deve fornecer mock dataset realista para cada um dos 7 nichos sem nomes genéricos', () => {
    const hospData = getMockDataByNiche('hospital');
    assert.equal(hospData['paciente.nome'], 'MARIA APARECIDA SILVA');
    assert.equal(hospData['atendimento.leito'], '304-B');

    const labData = getMockDataByNiche('laboratory');
    assert.equal(labData['paciente.nome'], 'JOÃO CARLOS PEREIRA');
    assert.equal(labData['exame.nome'], 'HEMOGRAMA COMPLETO');

    const logData = getMockDataByNiche('logistics');
    assert.equal(logData['sscc'], '178912345678901234');

    const pharmData = getMockDataByNiche('pharmacy');
    assert.equal(pharmData['medicamento.nome'], 'AMOXICILINA 500MG');
    assert.equal(pharmData['medicamento.registro'], 'MS 1.0043.0912');
  });

  // 5. Presets Recomendados por Nicho
  it('deve retornar tamanhos recomendados específicos por nicho', () => {
    const labProfile = getNicheProfile('laboratory');
    assert.equal(labProfile.defaultPreset.widthMm, 50.8);
    assert.equal(labProfile.defaultPreset.heightMm, 25.4);

    const logProfile = getNicheProfile('logistics');
    assert.equal(logProfile.defaultPreset.widthMm, 100);
    assert.equal(logProfile.defaultPreset.heightMm, 100);
  });

  // 6. Modelos de Demonstração / Seed (Idempotência e Identificação Demo)
  it('deve ter 7 modelos de demonstração/seed registrados e identificáveis como DEMO', () => {
    const seeds = getSeedTemplates();
    assert.equal(seeds.length, 7);
    for (const seed of seeds) {
      assert.equal(seed.isSeed, true);
      assert.equal(seed.scope, 'DEMO');
      assert.ok(seed.nicheId);
      assert.ok(seed.document.nicheId);
    }
  });

  // 7. Sobrevivência de Metadata Niche no Repositório do Backend
  it('deve persistir e recuperar nicheId e nicheName no repositório de modelos', async () => {
    const created = await templateRepository.createTemplate({
      name: 'Etiqueta Teste Hospitalar',
      nicheId: 'hospital',
      nicheName: 'Hospital / Identificação',
      document: {
        schemaVersion: 1,
        title: 'Etiqueta Teste Hospitalar',
        nicheId: 'hospital',
        nicheName: 'Hospital / Identificação',
        dimensions: { widthMm: 100, heightMm: 30, dpi: 203 },
        elements: [
          {
            id: 'el-1',
            type: 'text',
            text: 'MARIA APARECIDA SILVA',
            field: 'paciente.nome',
            x: 5,
            y: 5,
            width: 50,
            height: 10,
          },
        ],
      },
    });

    assert.equal(created.nicheId, 'hospital');
    assert.equal(created.document.nicheId, 'hospital');

    const fetched = await templateRepository.getTemplateById(created.id, 'comp-default');
    assert.ok(fetched);
    assert.equal(fetched.nicheId, 'hospital');
    assert.equal(fetched.document.nicheId, 'hospital');
  });

  // 8. Filtragem de Modelos por Nicho no Repositório
  it('deve filtrar modelos por nicheId na listagem do repositório', async () => {
    const hospitalTemplates = await templateRepository.listTemplates({
      companyId: 'comp-default',
      nicheId: 'hospital',
    });
    assert.ok(hospitalTemplates.length > 0);
    assert.ok(hospitalTemplates.every((t) => normalizeNicheId(t.nicheId || t.nicheName) === 'hospital'));
  });

  // 9. Retrocompatibilidade Total de Bindings Legados
  it('deve manter compatibilidade retroativa para bindings legados como produto.descricao e produto.preco', () => {
    const resolvedDesc = resolveFieldValue('produto.descricao', { nicheId: 'retail' });
    const resolvedPrice = resolveFieldValue('produto.preco', { nicheId: 'retail' });

    assert.equal(resolvedDesc, 'REFRIGERANTE COCA-COLA 2L');
    assert.equal(resolvedPrice, '9.99');
  });
});
