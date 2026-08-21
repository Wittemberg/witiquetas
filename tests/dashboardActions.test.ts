import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Carregar código-fonte de App.tsx para análise estática de regressão e integridade de hooks
const appTsxPath = path.resolve('apps/frontend/src/App.tsx');
const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');

const pairModalPath = path.resolve('apps/frontend/src/agent/PairAgentModal.tsx');
const pairModalContent = fs.readFileSync(pairModalPath, 'utf8');

const downloadModalPath = path.resolve('apps/frontend/src/agent/DownloadAgentModal.tsx');
const downloadModalContent = fs.readFileSync(downloadModalPath, 'utf8');

// ============================================================================
// SUÍTE DE TESTES: DASHBOARD ACTIONS E AUSÊNCIA DE REDUNDÂNCIAS
// ============================================================================

test('1. Header NÃO contém botões redundantes de Nova Etiqueta, Conectar Agent ou Baixar Agent', () => {
  // Extrai a seção do header
  const headerMatch = appTsxContent.match(/<header className="header">([\s\S]*?)<\/header>/);
  assert.ok(headerMatch, 'Header principal deve existir em App.tsx');
  const headerHtml = headerMatch[1];

  assert.ok(!headerHtml.includes('Nova Etiqueta (Por Nicho)'), 'Header NÃO deve ter botão Nova Etiqueta redundante');
  assert.ok(!headerHtml.includes('Conectar Agent'), 'Header NÃO deve ter botão Conectar Agent redundante');
  assert.ok(!headerHtml.includes('Baixar Agent'), 'Header NÃO deve ter botão Baixar Agent redundante');
});

test('2. Header mantém exclusivamente controle de Tema e remove botões redundantes (Abrir Editor, Auto-refresh e Atualizar)', () => {
  const headerMatch = appTsxContent.match(/<header className="header">([\s\S]*?)<\/header>/);
  assert.ok(headerMatch);
  const headerHtml = headerMatch[1];

  assert.ok(headerHtml.includes('btn-theme-toggle'), 'Header deve conter alternador de tema');
  assert.ok(!headerHtml.includes('Abrir Editor'), 'Header NÃO deve conter botão Abrir Editor');
  assert.ok(!headerHtml.includes('Auto-refresh'), 'Header NÃO deve conter controle de Auto-refresh');
  assert.ok(!headerHtml.includes('Atualizar'), 'Header NÃO deve conter botão de Atualizar');
});

test('3. Banner principal é o ponto único para criação guiada com CTA "Selecionar Nicho & Tamanho"', () => {
  assert.ok(appTsxContent.includes('Selecionar Nicho & Tamanho'), 'Banner deve conter CTA "Selecionar Nicho & Tamanho"');
  assert.ok(appTsxContent.includes('onClick={() => setIsWizardOpen(true)}'), 'CTA do banner deve abrir o NewTemplateWizard');
});

test('4. Card "Agent de Impressão" contém os botões "Conectar Agent" e "Baixar Agent"', () => {
  assert.ok(appTsxContent.includes('<span>Conectar Agent</span>'), 'Card do Agent deve conter botão "Conectar Agent"');
  assert.ok(appTsxContent.includes('<span>Baixar Agent</span>'), 'Card do Agent deve conter botão "Baixar Agent"');
  assert.ok(appTsxContent.includes('onClick={() => setIsPairModalOpen(true)}'), 'Botão Conectar Agent deve acionar setIsPairModalOpen(true)');
  assert.ok(appTsxContent.includes('onClick={() => setIsDownloadModalOpen(true)}'), 'Botão Baixar Agent deve acionar setIsDownloadModalOpen(true)');
});

test('5. Modais de Agent utilizam classes padronizadas de overlay e background do design system', () => {
  assert.ok(pairModalContent.includes('className="wizard-modal-overlay"'), 'PairAgentModal deve usar wizard-modal-overlay');
  assert.ok(pairModalContent.includes('className="wizard-modal-content"'), 'PairAgentModal deve usar wizard-modal-content');
  assert.ok(downloadModalContent.includes('className="wizard-modal-overlay"'), 'DownloadAgentModal deve usar wizard-modal-overlay');
  assert.ok(downloadModalContent.includes('className="wizard-modal-content"'), 'DownloadAgentModal deve usar wizard-modal-content');
});

test('6. Regra dos Hooks React: App, PairAgentModal e DownloadAgentModal declaram todos os hooks incondicionalmente no topo', () => {
  // Verificar que em DownloadAgentModal, if (!isOpen) return null está APÓS os hooks
  const dlHooksIdx = downloadModalContent.indexOf('useEffect(');
  const dlReturnIdx = downloadModalContent.indexOf('if (!isOpen) return null');
  assert.ok(dlHooksIdx !== -1 && dlReturnIdx !== -1);
  assert.ok(dlHooksIdx < dlReturnIdx, 'DownloadAgentModal deve declarar useEffect antes de if (!isOpen) return null');

  // Verificar que em PairAgentModal, if (!isOpen) return null está APÓS os hooks
  const pairHooksIdx = pairModalContent.indexOf('useEffect(');
  const pairReturnIdx = pairModalContent.indexOf('if (!isOpen) return null');
  assert.ok(pairHooksIdx !== -1 && pairReturnIdx !== -1);
  assert.ok(pairHooksIdx < pairReturnIdx, 'PairAgentModal deve declarar useEffect antes de if (!isOpen) return null');
});
