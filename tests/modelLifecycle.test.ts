import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  templateRepository,
  MismatchedVersionError,
} from '../apps/backend/src/repositories/templateRepository';
import type { LabelDocument } from '@witiquetas/label-schema';

const sampleDoc: LabelDocument = {
  schemaVersion: 1,
  title: 'Etiqueta Teste Ciclo de Vida',
  dimensions: { widthMm: 100, heightMm: 30, dpi: 203, orientation: 'landscape' },
  elements: [],
};

test('1. Summary DTO não inclui document_schema nas listagens', async () => {
  const companyId = 'comp-summary-test';
  await templateRepository.createTemplate({ title: 'Modelo Leve 1', document: sampleDoc }, companyId);

  const summaries = await templateRepository.listTemplates({ companyId });
  assert.ok(summaries.length > 0, 'Deve listar ao menos 1 resumo de modelo.');

  const first = summaries[0];
  assert.equal(first.title, 'Modelo Leve 1');
  assert.equal((first as any).document, undefined, 'Summary DTO NUNCA deve incluir document_schema.');
});

test('2. Tenant Isolation: Empresa A não pode acessar nem alterar modelos da Empresa B', async () => {
  const companyA = 'comp-tenant-A';
  const companyB = 'comp-tenant-B';

  const tplA = await templateRepository.createTemplate({ title: 'Modelo Exclusivo A', document: sampleDoc }, companyA);

  // Tentar buscar modelo de A usando credencial/tenant de B
  const retrievedFromB = await templateRepository.getTemplateById(tplA.id, companyB);
  assert.equal(retrievedFromB, null, 'Empresa B não deve conseguir ler o modelo da Empresa A.');

  // Tentar atualizar modelo de A usando tenant de B
  await assert.rejects(
    async () => {
      await templateRepository.updateTemplate(tplA.id, { title: 'Ataque Tenant B' }, companyB);
    },
    /não encontrado/,
    'Tentativa de atualização cross-tenant deve ser rejeitada com erro 404.'
  );
});

test('3. Optimistic Locking: expectedVersion desatualizado lança MismatchedVersionError (HTTP 409)', async () => {
  const companyId = 'comp-lock-test';
  const tpl = await templateRepository.createTemplate({ title: 'Modelo Concorrência', document: sampleDoc }, companyId);

  // Primeira atualização (sucesso) -> Versão passa de 1 para 2
  const updated1 = await templateRepository.updateTemplate(
    tpl.id,
    { title: 'Modelo Alterado v2', expectedVersion: 1 },
    companyId
  );
  assert.equal(updated1.version, 2, 'Versão do modelo deve ser incrementada para 2.');

  // Segunda atualização simulando outra sessão que ainda tem expectedVersion = 1 (obsoleto)
  await assert.rejects(
    async () => {
      await templateRepository.updateTemplate(
        tpl.id,
        { title: 'Tentativa Obsoleta', expectedVersion: 1 },
        companyId
      );
    },
    MismatchedVersionError,
    'Sessão com expectedVersion desatualizado deve falhar com MismatchedVersionError (409 Conflict).'
  );
});

test('4. Soft Delete: deleted_at oculta o modelo das listagens normais', async () => {
  const companyId = 'comp-softdelete-test';
  const tpl = await templateRepository.createTemplate({ title: 'Modelo Para Excluir', document: sampleDoc }, companyId);

  let list = await templateRepository.listTemplates({ companyId });
  assert.ok(list.some((item) => item.id === tpl.id), 'Modelo criado deve estar presente na listagem.');

  // Executar Soft Delete
  await templateRepository.deleteTemplate(tpl.id, companyId);

  // Verificar que deixou de ser listado
  list = await templateRepository.listTemplates({ companyId });
  assert.ok(!list.some((item) => item.id === tpl.id), 'Modelo excluído (soft-delete) NÃO deve aparecer nas listagens.');

  // Verificar que busca direta retorna null
  const retrieved = await templateRepository.getTemplateById(tpl.id, companyId);
  assert.equal(retrieved, null, 'Busca por ID de modelo soft-deleted deve retornar null.');
});

test('5. Duplicação Server-Side: Cria novo ID, adiciona sufixo "- Cópia" e reinicia versão em 1', async () => {
  const companyId = 'comp-dup-test';
  const original = await templateRepository.createTemplate({ title: 'Gôndola Promo', document: sampleDoc }, companyId);

  const clone = await templateRepository.duplicateTemplate(original.id, companyId);

  assert.notEqual(clone.id, original.id, 'Clone deve possuir um novo ID único.');
  assert.equal(clone.title, 'Gôndola Promo - Cópia', 'Título do clone deve possuir o sufixo "- Cópia".');
  assert.equal(clone.version, 1, 'Versão do novo clone deve ser reiniciada em 1.');
  assert.equal(clone.companyId, companyId, 'Clone deve pertencer ao mesmo tenant.');
});
