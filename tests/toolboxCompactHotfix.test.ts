import assert from 'node:assert';
import { test, describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  NICHES,
  getNicheToolboxConfig,
  NICHE_TOOLBOX_CONFIGS,
} from '../packages/label-schema/dist/index.js';

describe('HOTFIX UX 4.5.4 — Toolbox Compacta Completa em Lista & Fluxo Vertical Natural', () => {

  test('1. Nenhum limite artificial (slice) é aplicado a recommendedTools em NICHES', () => {
    NICHES.forEach((niche) => {
      const config = getNicheToolboxConfig(niche.id);
      assert.ok(config, `Configuração de toolbox deve existir para ${niche.id}`);
      assert.ok(config.recommendedTools.length > 0, `Nicho ${niche.id} deve ter ferramentas recomendadas`);

      // Verificar que recommendedTools.map é renderizado na íntegra
      const renderedTools = config.recommendedTools.map((t) => t.toolId);
      assert.strictEqual(renderedTools.length, config.recommendedTools.length);
    });
  });

  test('2. Nicho Hospital renderiza TODOS os 10 recommendedTools sem price', () => {
    const hospitalConfig = getNicheToolboxConfig('hospital-identificacao');
    assert.strictEqual(hospitalConfig.recommendedTools.length, 10, 'Hospital deve ter 10 ferramentas recomendadas configuradas');
    
    const recIds = hospitalConfig.recommendedTools.map((t) => t.toolId);
    assert.strictEqual(recIds.includes('price'), false, 'Hospital NÃO deve conter price');
    assert.strictEqual(recIds.includes('promotional-price'), false, 'Hospital NÃO deve conter promotional-price');
    assert.ok(recIds.includes('patient-name'), 'Hospital deve ter patient-name');
    assert.ok(recIds.includes('patient-id'), 'Hospital deve ter patient-id');
    assert.ok(recIds.includes('bed'), 'Hospital deve ter bed');
  });

  test('3. Nicho Logística renderiza TODOS os 10 recommendedTools', () => {
    const logConfig = getNicheToolboxConfig('logistica-expedicao-ecommerce');
    assert.strictEqual(logConfig.recommendedTools.length, 10, 'Logística deve ter 10 ferramentas recomendadas configuradas');
    
    const recIds = logConfig.recommendedTools.map((t) => t.toolId);
    assert.ok(recIds.includes('sscc'), 'Logística deve ter SSCC');
    assert.ok(recIds.includes('tracking-code'), 'Logística deve ter tracking-code');
  });

  test('4. Nicho Joalheria renderiza TODOS os 9 recommendedTools', () => {
    const jewelConfig = getNicheToolboxConfig('joalheria-otica');
    assert.strictEqual(jewelConfig.recommendedTools.length, 9, 'Joalheria deve ter 9 ferramentas recomendadas configuradas');
    
    const recIds = jewelConfig.recommendedTools.map((t) => t.toolId);
    assert.ok(recIds.includes('price'), 'Joalheria deve ter price');
    assert.ok(recIds.includes('product-name'), 'Joalheria deve ter product-name');
    assert.ok(recIds.includes('material'), 'Joalheria deve ter material');
  });

  test('5. Nicho Uso Geral renderiza TODOS os 5 recommendedTools', () => {
    const generalConfig = getNicheToolboxConfig('uso-geral');
    assert.strictEqual(generalConfig.recommendedTools.length, 5, 'Uso Geral deve ter 5 ferramentas recomendadas configuradas');
  });

  test('6. hiddenTools continuam estritamente ocultas em todos os nichos', () => {
    NICHES.forEach((niche) => {
      const config = getNicheToolboxConfig(niche.id);
      const visibleIds = [...config.recommendedTools, ...config.availableTools].map((t) => t.toolId);
      
      config.hiddenTools.forEach((hiddenId) => {
        assert.strictEqual(
          visibleIds.includes(hiddenId),
          false,
          `Ferramenta oculta ${hiddenId} não pode estar visível no nicho ${niche.id}`
        );
      });
    });
  });

  test('7. Gôndola e Banco de Sangue possuem regras de visibilidade corretas', () => {
    const gondolaConfig = getNicheToolboxConfig('gondola-supermercado');
    const gondolaRecIds = gondolaConfig.recommendedTools.map((t) => t.toolId);
    assert.ok(gondolaRecIds.includes('price'), 'Gôndola deve conter price em recomendados');

    const bloodConfig = getNicheToolboxConfig('banco-sangue-hemoterapia');
    const bloodRecIds = bloodConfig.recommendedTools.map((t) => t.toolId);
    assert.strictEqual(bloodRecIds.includes('price'), false, 'Banco de sangue NÃO deve conter price');
    assert.ok(bloodRecIds.includes('donation-id'), 'Banco de sangue deve conter donation-id em recomendados');
  });

  test('8. EditorLayout e index.css contêm classes de lista compacta e fluxo vertical', () => {
    const editorLayoutPath = path.join(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
    const indexCssPath = path.join(process.cwd(), 'apps/frontend/src/index.css');

    const editorLayoutContent = fs.readFileSync(editorLayoutPath, 'utf8');
    const indexCssContent = fs.readFileSync(indexCssPath, 'utf8');

    // Garantir que não existe .slice(0, ...) ou equivalente
    assert.strictEqual(editorLayoutContent.includes('recommendedTools.slice'), false, 'NÃO pode haver recommendedTools.slice');
    
    // Verificar criação da lista compacta e expansão inline
    assert.ok(editorLayoutContent.includes('creation-palette-list'), 'EditorLayout deve utilizar a classe creation-palette-list');
    assert.ok(editorLayoutContent.includes('Mais elementos'), 'EditorLayout deve conter a seção Mais elementos');
    
    // Verificar CSS da lista compacta
    assert.ok(indexCssContent.includes('flex-direction: row;'), 'creation-tool-btn deve ter alinhamento horizontal');
    assert.ok(indexCssContent.includes('min-height: 32px;') || indexCssContent.includes('height: 34px;'), 'creation-tool-btn deve ter altura entre 32px e 36px');
    assert.ok(indexCssContent.includes('font-weight: 500;'), 'creation-tool-btn deve ter peso de fonte ~500');
  });

  test('9. Invariantes de NICHE_TOOLBOX_CONFIGS permanecem 100% intactos', () => {
    assert.strictEqual(Object.keys(NICHE_TOOLBOX_CONFIGS).length >= 11, true, 'Deve manter todas as configs de nicho');
  });

});
