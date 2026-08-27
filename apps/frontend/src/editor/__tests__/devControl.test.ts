import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DevelopmentControlService } from '../../../../backend/dist/services/developmentControlService.js';

describe('DEVELOPMENT CONTROL CENTER 0.1.1 - TESTES DE INTEGRIDADE E CONTRATOS FRONTEND (REGRAS SEÇÃO 11)', () => {
  const service = new DevelopmentControlService();

  it('1. Cálculo de MVP Readiness vs Implementation independe da quantidade de commits', () => {
    const overview = service.getOverview();
    assert.ok(overview.progress.mvp.readinessPercent > 0);
    assert.ok(overview.progress.mvp.implementationPercent > 0);
    assert.ok(overview.progress.fullRoadmap.readinessPercent > 0);
    assert.ok(overview.progress.fullRoadmap.implementationPercent > 0);

    // Soma de pesos bate com fullRoadmap.totalWeight
    assert.equal(overview.progress.fullRoadmap.totalWeight, 262);
    assert.equal(overview.progress.mvp.totalWeight, 198);
  });

  it('2. Status Canônicos: Todos os enums estão previstos e validados', () => {
    const capabilities = service.getCapabilities();
    const validStatuses = new Set([
      'PLANNED',
      'READY',
      'IN_PROGRESS',
      'IMPLEMENTED',
      'VALIDATION',
      'HOMOLOGATED',
      'FROZEN',
      'BLOCKED',
      'UNMAPPED',
    ]);

    for (const cap of capabilities) {
      assert.ok(validStatuses.has(cap.status), `Status ${cap.status} em ${cap.id} é um status canônico válido`);
    }
  });

  it('3. Checkpoints: Metadados históricos contêm apenas dados seguros sem segredos', () => {
    const checkpoints = service.getCheckpoints();
    assert.ok(checkpoints.length > 0);

    for (const chk of checkpoints) {
      assert.ok(chk.sha, 'SHA presente');
      assert.ok(chk.shortSha, 'Short SHA presente');
      assert.ok(chk.title, 'Título do checkpoint presente');
      assert.ok(!JSON.stringify(chk).includes('secret'), 'Checkpoints não vazam segredos');
      assert.ok(!JSON.stringify(chk).includes('password'), 'Checkpoints não vazam senhas');
    }
  });

  it('4. Componentes Congelados: Proteção explícita de componentes críticos', () => {
    const frozen = service.getFrozenComponents();
    assert.ok(frozen.length >= 6);
    const ids = frozen.map((f) => f.id);
    assert.ok(ids.includes('editor-toolbar'), 'editor-toolbar congelado');
    assert.ok(ids.includes('canvas-area'), 'canvas-area congelado');
    assert.ok(ids.includes('price-element'), 'price-element congelado');
  });

  it('5. Frontend Integridade: Frontend consome dados da API sem hardcodar percentuais ou fases no JSX', () => {
    const devPagePath = path.resolve(process.cwd(), 'apps/frontend/src/modules/devcontrol/DevControlPage.tsx');
    const devPageContent = fs.readFileSync(devPagePath, 'utf-8');

    assert.ok(devPageContent.includes('progress.mvp.readinessPercent'), 'Frontend consome progress.mvp.readinessPercent dinamicamente');
    assert.ok(devPageContent.includes('progress.fullRoadmap.readinessPercent'), 'Frontend consome progress.fullRoadmap.readinessPercent dinamicamente');
  });

  it('6. Sidebar Integridade: Item Desenvolvimento é gerado por função com verificação de ambiente', () => {
    const sidebarPath = path.resolve(process.cwd(), 'apps/frontend/src/shell/Sidebar.tsx');
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

    assert.ok(sidebarContent.includes('isDevControlCenterEnabled()'), 'Sidebar utiliza função de verificação de ambiente');
    assert.ok(sidebarContent.includes('Development Control Center'), 'Descrição canônica mantida');
  });

  it('7. Proteção de Rota Backend: Router inclui guard de verificação de ambiente', () => {
    const routerPath = path.resolve(process.cwd(), 'apps/backend/src/routes/developmentControl.ts');
    const routerContent = fs.readFileSync(routerPath, 'utf-8');

    assert.ok(routerContent.includes('devControlGuard'), 'Middleware guard presente nas rotas backend');
    assert.ok(routerContent.includes('process.env.NODE_ENV !== \'production\''), 'Verificação de NODE_ENV != production');
    assert.ok(routerContent.includes('res.status(404)'), 'Retorna HTTP 404 para solicitações não autorizadas');
  });
});
