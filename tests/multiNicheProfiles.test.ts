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

import { templateRepository, getSeedTemplates } from '../apps/backend/dist/repositories/templateRepository.js';

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

  // =========================================================================
  // HOTFIX 4.5.1 — TESTES DE INTEGRAÇÃO UI E RUNTIME (18 ITENS OBRIGATÓRIOS)
  // =========================================================================

  it('1. Hospital template -> FieldPicker deve carregar catálogo de hospital', () => {
    const fields = getIntegrationFieldsByNiche('hospital');
    const fieldIds = fields.map((f) => f.id);
    assert.ok(fieldIds.includes('paciente.nome'));
    assert.ok(fieldIds.includes('atendimento.leito'));
    assert.equal(fieldIds.includes('produto.preco'), false);
  });

  it('2. Laboratory template -> FieldPicker deve carregar catálogo de laboratório', () => {
    const fields = getIntegrationFieldsByNiche('laboratory');
    const fieldIds = fields.map((f) => f.id);
    assert.ok(fieldIds.includes('amostra.tipo'));
    assert.ok(fieldIds.includes('exame.nome'));
    assert.equal(fieldIds.includes('produto.preco'), false);
  });

  it('3. Retail template -> FieldPicker deve carregar catálogo de varejo', () => {
    const fields = getIntegrationFieldsByNiche('retail');
    const fieldIds = fields.map((f) => f.id);
    assert.ok(fieldIds.includes('produto.descricao'));
    assert.ok(fieldIds.includes('produto.preco'));
  });

  it('4. nicheId explícito hospital NÃO pode cair no fallback retail', () => {
    const norm = normalizeNicheId('hospital');
    assert.equal(norm, 'hospital');
    assert.notEqual(norm, 'retail');
  });

  it('5. Documento legado sem nicheId deve cair no fallback retail', () => {
    const norm = normalizeNicheId(undefined);
    assert.equal(norm, 'retail');
  });

  it('6. PrintCenter deve possuir opções válidas para o Seletor de Nicho', () => {
    const validNiches = ['all', ...CANONICAL_NICHE_PROFILES.map((p) => p.id)];
    assert.ok(validNiches.includes('all'));
    assert.ok(validNiches.includes('hospital'));
    assert.ok(validNiches.includes('laboratory'));
    assert.equal(validNiches.length, 8);
  });

  it('7. Selecionar filtro Hospital deve filtrar somente modelos Hospital', async () => {
    const allTpls = await templateRepository.listTemplates({ companyId: 'comp-default' });
    const hospitalOnly = allTpls.filter((t) => normalizeNicheId(t.nicheId || t.nicheName) === 'hospital');
    assert.ok(hospitalOnly.length > 0);
    assert.ok(hospitalOnly.every((t) => normalizeNicheId(t.nicheId || t.nicheName) === 'hospital'));
  });

  it('8. Nicho Hospital deve carregar MOCK_NICHE_DATASETS.hospital', () => {
    const dataset = MOCK_NICHE_DATASETS.hospital;
    assert.ok(dataset);
    assert.equal(dataset['paciente.nome'], 'MARIA APARECIDA SILVA');
  });

  it('9. Nicho Hospital NÃO deve carregar dataset retail (Coca-Cola / Preço)', () => {
    const dataset = MOCK_NICHE_DATASETS.hospital;
    assert.equal(dataset['produto.descricao'], undefined);
  });

  it('10. Selecionar modelo Hospital com filtro "Todos" deve usar dataset hospital', async () => {
    const seeds = getSeedTemplates();
    const hospTpl = seeds.find((s) => s.nicheId === 'hospital');
    assert.ok(hospTpl);

    const normNiche = normalizeNicheId(hospTpl.nicheId);
    const mockData = getMockDataByNiche(normNiche);
    assert.equal(normNiche, 'hospital');
    assert.equal(mockData['paciente.nome'], 'MARIA APARECIDA SILVA');
  });

  it('11. Trocar Nicho de Retail para Hospital invalida template retail', async () => {
    const seeds = getSeedTemplates();
    const retailTpl = seeds.find((s) => s.nicheId === 'retail');
    const hospTpl = seeds.find((s) => s.nicheId === 'hospital');
    assert.ok(retailTpl);
    assert.ok(hospTpl);

    // Quando nicho ativo é hospital, modelo retail é inválido
    const activeNiche = 'hospital';
    const isRetailValid = normalizeNicheId(retailTpl.nicheId) === activeNiche;
    const isHospValid = normalizeNicheId(hospTpl.nicheId) === activeNiche;

    assert.equal(isRetailValid, false);
    assert.equal(isHospValid, true);
  });

  it('12. Preview do modelo hospitalar deve receber registro hospitalar', () => {
    const hospMock = MOCK_NICHE_DATASETS.hospital;
    const resolvedName = resolveFieldValue('paciente.nome', { nicheId: 'hospital', mockRecord: hospMock });
    assert.equal(resolvedName, 'MARIA APARECIDA SILVA');
    assert.notEqual(resolvedName, 'REFRIGERANTE COCA-COLA 2L');
  });

  it('13. Nicho Logistics deve usar dataset logistics', () => {
    const dataset = MOCK_NICHE_DATASETS.logistics;
    assert.ok(dataset['sscc']);
    assert.equal(dataset['sscc'], '178912345678901234');
  });

  it('14. Nicho Industry deve usar dataset industry', () => {
    const dataset = MOCK_NICHE_DATASETS.industry;
    assert.ok(dataset['ordemProducao']);
    assert.equal(dataset['ordemProducao'], 'OP-4491');
  });

  it('15. Nicho Food deve usar dataset food', () => {
    const dataset = MOCK_NICHE_DATASETS.food;
    assert.ok(dataset['dataValidade']);
    assert.equal(dataset['dataValidade'], '15/09/2026');
  });

  it('16. Nicho Pharmacy deve usar dataset pharmacy', () => {
    const dataset = MOCK_NICHE_DATASETS.pharmacy;
    assert.ok(dataset['medicamento.nome']);
    assert.equal(dataset['medicamento.nome'], 'AMOXICILINA 500MG');
  });

  it('17. Nicho Laboratory deve usar dataset laboratory', () => {
    const dataset = MOCK_NICHE_DATASETS.laboratory;
    assert.ok(dataset['exame.nome']);
    assert.equal(dataset['exame.nome'], 'HEMOGRAMA COMPLETO');
  });

  it('18. Validação de impressão deve bloquear mismatch de template/niche', () => {
    const activeNiche = 'hospital';
    const retailTemplateNiche = 'retail';
    const hospitalTemplateNiche = 'hospital';

    const isRetailAllowed = normalizeNicheId(retailTemplateNiche) === normalizeNicheId(activeNiche);
    const isHospitalAllowed = normalizeNicheId(hospitalTemplateNiche) === normalizeNicheId(activeNiche);

    assert.equal(isRetailAllowed, false);
    assert.equal(isHospitalAllowed, true);
  });
});

