import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getIntegrationFieldsByNiche,
  normalizeNicheId,
  CANONICAL_NICHE_PROFILES,
  DEFAULT_HOSPITAL_CATALOG,
  DEFAULT_LABORATORY_CATALOG,
  DEFAULT_LOGISTICS_CATALOG,
  DEFAULT_INDUSTRY_CATALOG,
  DEFAULT_FOOD_CATALOG,
  DEFAULT_PHARMACY_CATALOG,
  DEFAULT_RETAIL_CATALOG,
} from '../packages/label-schema/dist/index.js';

describe('HOTFIX 4.5.2 — Runtime Component Gate & Symbol Validation', () => {
  const canonicalNiches = [
    'hospital',
    'laboratory',
    'retail',
    'logistics',
    'industry',
    'food',
    'pharmacy',
  ] as const;

  test('1. Símbolo getIntegrationFieldsByNiche está definido e é uma função', () => {
    assert.equal(typeof getIntegrationFieldsByNiche, 'function');
  });

  test('2. Execução de getIntegrationFieldsByNiche para os 7 nichos canônicos', () => {
    for (const niche of canonicalNiches) {
      const fields = getIntegrationFieldsByNiche(niche);
      assert.ok(Array.isArray(fields), `Campos do nicho ${niche} devem ser um Array.`);
      assert.ok(fields.length > 0, `Nicho ${niche} deve possuir ao menos 1 campo de integração.`);

      // Garantir integridade de cada campo
      for (const f of fields) {
        assert.ok(f.id, `Campo do nicho ${niche} deve possuir id.`);
        assert.ok(f.label, `Campo do nicho ${niche} deve possuir label.`);
        assert.ok(f.namespace, `Campo do nicho ${niche} deve possuir namespace.`);
      }
    }
  });

  test('3. Retorno específico dos catálogos de cada perfil sem contaminar com retail', () => {
    // Hospital
    const hospitalFields = getIntegrationFieldsByNiche('hospital').map((f) => f.id);
    assert.ok(hospitalFields.includes('paciente.nome'));
    assert.ok(hospitalFields.includes('paciente.id'));

    // Laboratory
    const labFields = getIntegrationFieldsByNiche('laboratory').map((f) => f.id);
    assert.ok(labFields.includes('coleta.id'));
    assert.ok(labFields.includes('exame.nome'));

    // Retail
    const retailFields = getIntegrationFieldsByNiche('retail').map((f) => f.id);
    assert.ok(retailFields.includes('produto.descricao'));
    assert.ok(retailFields.includes('produto.preco'));

    // Logistics
    const logisticsFields = getIntegrationFieldsByNiche('logistics').map((f) => f.id);
    assert.ok(logisticsFields.includes('sscc'));

    // Industry
    const industryFields = getIntegrationFieldsByNiche('industry').map((f) => f.id);
    assert.ok(industryFields.includes('ordemProducao'));

    // Food
    const foodFields = getIntegrationFieldsByNiche('food').map((f) => f.id);
    assert.ok(foodFields.includes('ingredientes'));

    // Pharmacy
    const pharmacyFields = getIntegrationFieldsByNiche('pharmacy').map((f) => f.id);
    assert.ok(pharmacyFields.includes('medicamento.nome'));
  });

  test('4. Fallback de nicheId ausente/legado/inválido para RETAIL', () => {
    const defaultFields = getIntegrationFieldsByNiche(undefined);
    assert.equal(defaultFields, DEFAULT_RETAIL_CATALOG);

    const emptyFields = getIntegrationFieldsByNiche('');
    assert.equal(emptyFields, DEFAULT_RETAIL_CATALOG);

    const unknownFields = getIntegrationFieldsByNiche('niche-inexistente-xyz');
    assert.equal(unknownFields, DEFAULT_RETAIL_CATALOG);
  });

  test('5. Validação de resolução para aliases e descrições humanas (ex: "Hospital / Identificação")', () => {
    const fields1 = getIntegrationFieldsByNiche('Hospital / Identificação');
    assert.equal(fields1, DEFAULT_HOSPITAL_CATALOG);

    const fields2 = getIntegrationFieldsByNiche('Laboratório Clínico');
    assert.equal(fields2, DEFAULT_LABORATORY_CATALOG);

    const fields3 = getIntegrationFieldsByNiche('Logística / Armazém');
    assert.equal(fields3, DEFAULT_LOGISTICS_CATALOG);
  });
});
