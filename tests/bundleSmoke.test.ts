import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { useEditorStore } from '../apps/frontend/src/editor/useEditorStore';

test('1. FRONTEND RUNTIME SMOKE TEST: Store useEditorStore Inicializa sem ReferenceError', () => {
  assert.ok(useEditorStore, 'useEditorStore deve estar definido');
  const state = useEditorStore.getState();
  assert.ok(state.document, 'Estado do documento deve estar inicializado');
  assert.equal(state.zoom, 1.0, 'Zoom inicial deve ser 1.0');
  assert.equal(state.snapToGrid, true);
});

test('2. FRONTEND BUNDLE SMOKE TEST: Bundle Minificado Não Contém Referência Livre a create()', () => {
  const distDir = path.resolve('apps/frontend/dist/assets');
  assert.ok(fs.existsSync(distDir), 'Diretório apps/frontend/dist/assets deve existir. Execute npm run build em apps/frontend.');

  const distFiles = fs.readdirSync(distDir).filter((f) => f.endsWith('.js'));
  assert.ok(distFiles.length > 0, 'Deve existir pelo menos um arquivo .js no bundle do frontend');

  const bundlePath = path.join(distDir, distFiles[0]);
  const bundleCode = fs.readFileSync(bundlePath, 'utf8');

  // Prova de que a chamada livre xs=create((... NÃO existe no bundle minificado
  const hasFreeCreate = /\bcreate\(\(/i.test(bundleCode);
  assert.equal(hasFreeCreate, false, 'O bundle minificado NÃO pode conter a chamada livre un-imported create((');

  // Prova de que o import minificado de Zustand (ex: P7 ou similar) é utilizado
  const matchZustandStore = /document:[a-zA-Z0-0_]+\([a-zA-Z0-0_]+\),selectedElementIds:/.test(bundleCode);
  assert.ok(matchZustandStore, 'A fábrica de store Zustand deve estar minificada e devidamente vinculada ao import do pacote zustand');
});

test('3. FRONTEND RUNTIME EVALUATION: Execução do Entrypoint em VM com Globais DOM Não Dispara ReferenceError', () => {
  const distDir = path.resolve('apps/frontend/dist/assets');
  const distFiles = fs.readdirSync(distDir).filter((f) => f.endsWith('.js'));
  const bundleCode = fs.readFileSync(path.join(distDir, distFiles[0]), 'utf8');

  // Mapear ambiente DOM simulado leve para execução do bundle em VM
  const domGlobals: Record<string, any> = {
    window: {},
    document: {
      createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, style: {} }),
      head: { appendChild: () => {} },
      body: { appendChild: () => {} },
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    location: { href: 'http://localhost:3000', origin: 'http://localhost:3000' },
    navigator: { userAgent: 'node-test' },
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    URL: URL,
    Image: class Image {},
    HTMLCanvasElement: class HTMLCanvasElement {},
    ResizeObserver: class ResizeObserver { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: class MutationObserver { observe() {} disconnect() {} },
  };

  domGlobals.window = domGlobals;
  domGlobals.globalThis = domGlobals;

  const context = vm.createContext(domGlobals);

  let uncaughtReferenceError: Error | null = null;
  try {
    // Executa a definição e inicialização dos módulos do bundle no contexto isolado
    const script = new vm.Script(bundleCode);
    script.runInContext(context);
  } catch (err: any) {
    if (err instanceof ReferenceError && err.message.includes('create is not defined')) {
      uncaughtReferenceError = err;
    }
    // Ignorar erros de DOM/React Mount esperados em ambiente VM sem canvas real
  }

  assert.equal(uncaughtReferenceError, null, 'O bundle do frontend NÃO pode disparar ReferenceError: create is not defined ao ser executado');
});
