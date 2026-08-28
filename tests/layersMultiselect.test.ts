import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useEditorStore } from '../apps/frontend/src/editor/useEditorStore.ts';
import type { LabelDocument, TextElement, PriceElement, BarcodeElement, QrCodeElement, LineElement, RectangleElement, ImageElement } from '@witiquetas/label-schema';

describe('PACOTE 4.4 — MULTISELECT VIA LISTA DE CAMADAS SUITE DE TESTES', () => {

  function createTestDocument(): LabelDocument {
    return {
      schemaVersion: 1,
      title: 'Etiqueta Teste Multiselect Camadas',
      dimensions: {
        widthMm: 100,
        heightMm: 50,
        dpi: 203,
        orientation: 'landscape',
      },
      elements: [
        {
          id: 'elem-text-1',
          name: 'Texto Oferta',
          type: 'text',
          text: 'PROMOÇÃO',
          x: 5,
          y: 5,
          width: 40,
          height: 8,
          fontSize: 12,
          fontFamily: 'Roboto',
          color: '#000000',
        } as TextElement,
        {
          id: 'elem-price-1',
          name: 'Preço Especial',
          type: 'price',
          x: 50,
          y: 5,
          width: 30,
          height: 12,
          integerFontSize: 20,
          fractionFontSize: 12,
          color: '#dc2626',
        } as PriceElement,
        {
          id: 'elem-barcode-1',
          name: 'EAN-13',
          type: 'barcode',
          format: 'EAN13',
          value: '7891234567890',
          x: 5,
          y: 20,
          width: 40,
          height: 15,
        } as BarcodeElement,
        {
          id: 'elem-qrcode-1',
          name: 'QR Code Loja',
          type: 'qrcode',
          value: 'https://witiquetas.com.br',
          x: 50,
          y: 20,
          width: 15,
          height: 15,
        } as QrCodeElement,
        {
          id: 'elem-line-1',
          name: 'Linha Divisória',
          type: 'line',
          x: 0,
          y: 38,
          width: 100,
          height: 1,
          strokeWidth: 1,
          color: '#000000',
        } as LineElement,
        {
          id: 'elem-rect-1',
          name: 'Retângulo Moldura',
          type: 'rectangle',
          x: 2,
          y: 2,
          width: 96,
          height: 46,
          strokeWidth: 1,
          color: '#000000',
        } as RectangleElement,
        {
          id: 'elem-image-1',
          name: 'Logo Empresa',
          type: 'image',
          x: 70,
          y: 20,
          width: 20,
          height: 15,
          src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        } as ImageElement,
      ],
    };
  }

  // Resetar store limpa para cada teste
  function setupStore() {
    const doc = createTestDocument();
    useEditorStore.setState({
      document: doc,
      selectedElementIds: [],
      history: [doc],
      historyIndex: 0,
      isDirty: false,
    });
    return useEditorStore.getState();
  }

  it('1. Clique simples seleciona apenas um elemento e limpa seleção anterior', () => {
    const store = setupStore();

    store.toggleSelectElement('elem-text-1', false);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-text-1']);

    store.toggleSelectElement('elem-price-1', false);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-price-1']);
  });

  it('2. Ctrl+clique adiciona segundo elemento à seleção', () => {
    const store = setupStore();

    store.toggleSelectElement('elem-text-1', false);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-text-1']);

    store.toggleSelectElement('elem-price-1', true);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-text-1', 'elem-price-1']);
  });

  it('3. Ctrl+clique adiciona terceiro elemento à seleção', () => {
    const store = setupStore();

    store.toggleSelectElement('elem-text-1', false);
    store.toggleSelectElement('elem-price-1', true);
    store.toggleSelectElement('elem-barcode-1', true);

    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-text-1', 'elem-price-1', 'elem-barcode-1']);
  });

  it('4. Ctrl+clique em elemento já selecionado remove somente ele da seleção', () => {
    const store = setupStore();

    store.toggleSelectElement('elem-text-1', false);
    store.toggleSelectElement('elem-price-1', true);
    store.toggleSelectElement('elem-barcode-1', true);
    assert.equal(useEditorStore.getState().selectedElementIds.length, 3);

    // Deselecionar elem-price-1 via Ctrl+clique
    store.toggleSelectElement('elem-price-1', true);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-text-1', 'elem-barcode-1']);
  });

  it('5. Clique simples após multiselect limpa seleção anterior e seleciona apenas o novo', () => {
    const store = setupStore();

    store.toggleSelectElement('elem-text-1', false);
    store.toggleSelectElement('elem-price-1', true);
    store.toggleSelectElement('elem-barcode-1', true);
    assert.equal(useEditorStore.getState().selectedElementIds.length, 3);

    // Clique simples em elem-qrcode-1 sem Ctrl/Cmd
    store.toggleSelectElement('elem-qrcode-1', false);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-qrcode-1']);
  });

  it('6. Seleção via lista atualiza o estado canônico único (selectedElementIds)', () => {
    const store = setupStore();

    store.toggleSelectElement('elem-rect-1', false);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-rect-1']);

    store.toggleSelectElement('elem-line-1', true);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-rect-1', 'elem-line-1']);
  });

  it('7. Seleção via canvas reflete corretamente no predicado da lista (selectedElementIds.includes)', () => {
    const store = setupStore();

    // Simula seleção vinda do canvas (ex: marquee ou setSelectedElementIds)
    store.setSelectedElementIds(['elem-text-1', 'elem-image-1']);

    const currentSelection = useEditorStore.getState().selectedElementIds;
    assert.strictEqual(currentSelection.includes('elem-text-1'), true);
    assert.strictEqual(currentSelection.includes('elem-image-1'), true);
    assert.strictEqual(currentSelection.includes('elem-rect-1'), false);
  });

  it('8. Multiselect funciona perfeitamente com todos os tipos (text, price, barcode, qrcode, line, rect, image)', () => {
    const store = setupStore();

    store.toggleSelectElement('elem-text-1', true);
    store.toggleSelectElement('elem-price-1', true);
    store.toggleSelectElement('elem-barcode-1', true);
    store.toggleSelectElement('elem-qrcode-1', true);
    store.toggleSelectElement('elem-line-1', true);
    store.toggleSelectElement('elem-rect-1', true);
    store.toggleSelectElement('elem-image-1', true);

    assert.equal(useEditorStore.getState().selectedElementIds.length, 7);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, [
      'elem-text-1',
      'elem-price-1',
      'elem-barcode-1',
      'elem-qrcode-1',
      'elem-line-1',
      'elem-rect-1',
      'elem-image-1',
    ]);
  });

  it('9. Elementos sobrepostos (ex: Retângulo + Linha + Texto na mesma área) podem ser selecionados deterministicamente pela lista', () => {
    const store = setupStore();

    // elem-rect-1, elem-line-1 e elem-text-1 estão sobrepostos
    store.toggleSelectElement('elem-rect-1', false);
    store.toggleSelectElement('elem-line-1', true);
    store.toggleSelectElement('elem-text-1', true);

    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-rect-1', 'elem-line-1', 'elem-text-1']);
  });

  it('10. Nenhuma regressão na seleção por marquee (setSelectedElementIds)', () => {
    const store = setupStore();

    // Marquee seleciona área com text, price e barcode
    store.setSelectedElementIds(['elem-text-1', 'elem-price-1', 'elem-barcode-1']);
    assert.equal(useEditorStore.getState().selectedElementIds.length, 3);

    // Mover os elementos selecionados via nudge
    store.nudgeElements(2, 2);

    const doc = useEditorStore.getState().document;
    const textEl = doc.elements.find(e => e.id === 'elem-text-1');
    const priceEl = doc.elements.find(e => e.id === 'elem-price-1');
    const barcodeEl = doc.elements.find(e => e.id === 'elem-barcode-1');

    assert.equal(Math.round(textEl?.x || 0), 7);
    assert.equal(Math.round(textEl?.y || 0), 7);
    assert.equal(Math.round(priceEl?.x || 0), 52);
    assert.equal(Math.round(priceEl?.y || 0), 7);
    assert.equal(Math.round(barcodeEl?.x || 0), 7);
    assert.equal(Math.round(barcodeEl?.y || 0), 22);
  });

  it('11. Remoção do último elemento deixa a seleção vazia sem exceção', () => {
    const store = setupStore();

    store.toggleSelectElement('elem-text-1', false);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-text-1']);

    store.toggleSelectElement('elem-text-1', true);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, []);
  });

  it('12. Remoção parcial mantém a seleção normal dos elementos restantes', () => {
    const store = setupStore();

    store.toggleSelectElement('elem-text-1', false);
    store.toggleSelectElement('elem-price-1', true);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-text-1', 'elem-price-1']);

    store.toggleSelectElement('elem-text-1', true);
    assert.deepEqual(useEditorStore.getState().selectedElementIds, ['elem-price-1']);
  });
});
