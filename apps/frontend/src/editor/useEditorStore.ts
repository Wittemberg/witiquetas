import { create } from 'zustand';
import { LabelDocument, LabelElement, ElementType } from '@witiquetas/label-schema';

// Converter Milímetros ➔ Pixels com base no DPI (ex: 203 DPI = ~8 dots/mm)
export function mmToPx(mm: number, dpi: number = 203): number {
  return Math.round((mm * dpi) / 25.4);
}

// Converter Pixels ➔ Milímetros
export function pxToMm(px: number, dpi: number = 203): number {
  return parseFloat(((px * 25.4) / dpi).toFixed(2));
}

// Dados comerciais de teste simulados para o modo Preview
export const MOCK_PRODUCT_DATA: Record<string, string> = {
  'produto.codigo': '789123',
  'produto.descricao': 'REFRIGERANTE COCA-COLA 2L',
  'produto.descricaoLonga': 'REFRIGERANTE COCA-COLA PET 2 LITROS - EMBALAGEM FAMÍLIA',
  'produto.ean': '7894900011517',
  'produto.unidade': 'UN',
  'produto.preco': '9.99',
  'produto.promocao.preco': '7.99',
  'produto.promocao.inicio': '10/08/2026',
  'produto.promocao.fim': '20/08/2026',
  'produto.referencia.unidade': '1L',
  'produto.referencia.preco': '5.00',
  'produto.fabricante': 'COCA-COLA',
  'empresa.razaoSocial': 'WR TECNOLOGIA SUPERMERCADOS LTDA',
  'empresa.nomeFantasia': 'SUPERMERCADO WR',
  'impressao.data': '13/08/2026',
  'impressao.hora': '19:30',
};

// Documento padrão de inicialização (100x30mm em 203 DPI)
const initialDocument: LabelDocument = {
  schemaVersion: 1,
  title: 'Etiqueta de Gôndola Padrão (100x30mm)',
  dimensions: {
    widthMm: 100,
    heightMm: 30,
    dpi: 203,
    orientation: 'landscape',
  },
  elements: [
    {
      id: 'header-bg',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 6,
      strokeWidth: 0,
      fillColor: '#1e293b',
    },
    {
      id: 'header-text',
      type: 'text',
      text: 'OFERTA ESPECIAL',
      x: 2,
      y: 1,
      width: 96,
      height: 4,
      fontFamily: 'Inter',
      fontSize: 10,
      fontWeight: 'bold',
      alignment: 'center',
      color: '#ffffff',
    },
    {
      id: 'prod-desc',
      type: 'text',
      text: 'REFRIGERANTE COCA-COLA 2L',
      field: 'produto.descricao',
      x: 4,
      y: 8,
      width: 60,
      height: 10,
      fontFamily: 'Inter',
      fontSize: 12,
      fontWeight: 'bold',
      alignment: 'left',
      color: '#0f172a',
    },
    {
      id: 'prod-price',
      type: 'price',
      field: 'produto.preco',
      prefix: 'R$',
      x: 65,
      y: 7,
      width: 31,
      height: 14,
      integerFontSize: 24,
      fractionFontSize: 14,
      currencyFontSize: 12,
      color: '#dc2626',
    },
    {
      id: 'prod-ean',
      type: 'barcode',
      format: 'EAN13',
      field: 'produto.ean',
      value: '7894900011517',
      x: 4,
      y: 19,
      width: 50,
      height: 9,
      showText: true,
    },
    {
      id: 'company-name',
      type: 'text',
      text: 'SUPERMERCADO WR',
      field: 'empresa.nomeFantasia',
      x: 56,
      y: 22,
      width: 40,
      height: 5,
      fontFamily: 'Inter',
      fontSize: 8,
      alignment: 'right',
      color: '#475569',
    },
  ],
};

interface EditorState {
  document: LabelDocument;
  selectedElementId: string | null;
  zoom: number; // Escala do canvas (1 = 100%)
  snapToGrid: boolean;
  gridSizeMm: number;
  showPreviewData: boolean;
  
  // Histórico Undo / Redo
  history: LabelDocument[];
  historyIndex: number;

  // Actions
  setDocument: (doc: LabelDocument) => void;
  updateDimensions: (widthMm: number, heightMm: number, dpi: 203 | 300 | 600) => void;
  setSelectedElementId: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  setSnapToGrid: (snap: boolean) => void;
  setShowPreviewData: (show: boolean) => void;

  addElement: (type: ElementType) => void;
  updateElement: (id: string, patch: Partial<LabelElement>) => void;
  removeElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  document: initialDocument,
  selectedElementId: 'prod-desc',
  zoom: 2.5, // 250% de zoom padrão para facilitar a visualização no monitor
  snapToGrid: true,
  gridSizeMm: 2,
  showPreviewData: true,

  history: [initialDocument],
  historyIndex: 0,

  setDocument: (doc) => {
    set({
      document: doc,
      selectedElementId: null,
      history: [doc],
      historyIndex: 0,
    });
  },

  updateDimensions: (widthMm, heightMm, dpi) => {
    const { document, pushHistory } = get();
    const updated: LabelDocument = {
      ...document,
      dimensions: {
        ...document.dimensions,
        widthMm,
        heightMm,
        dpi,
      },
    };
    set({ document: updated });
    pushHistory();
  },

  setSelectedElementId: (id) => set({ selectedElementId: id }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(5, zoom)) }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setShowPreviewData: (showPreviewData) => set({ showPreviewData }),

  addElement: (type) => {
    const { document, pushHistory } = get();
    const newId = `elem-${Date.now()}`;
    let newElem: LabelElement;

    switch (type) {
      case 'text':
        newElem = {
          id: newId,
          type: 'text',
          text: 'Novo Texto',
          x: 10,
          y: 10,
          width: 40,
          height: 6,
          fontFamily: 'Inter',
          fontSize: 12,
          fontWeight: 'normal',
          alignment: 'left',
          color: '#0f172a',
        };
        break;
      case 'price':
        newElem = {
          id: newId,
          type: 'price',
          field: 'produto.preco',
          prefix: 'R$',
          x: 10,
          y: 10,
          width: 30,
          height: 12,
          integerFontSize: 20,
          fractionFontSize: 12,
          currencyFontSize: 10,
          color: '#dc2626',
        };
        break;
      case 'barcode':
        newElem = {
          id: newId,
          type: 'barcode',
          format: 'EAN13',
          field: 'produto.ean',
          value: '7894900011517',
          x: 10,
          y: 10,
          width: 45,
          height: 10,
          showText: true,
        };
        break;
      case 'qrcode':
        newElem = {
          id: newId,
          type: 'qrcode',
          value: 'https://witiquetas.wrtec.com.br',
          x: 10,
          y: 10,
          width: 15,
          height: 15,
        };
        break;
      case 'line':
        newElem = {
          id: newId,
          type: 'line',
          x: 5,
          y: 10,
          width: 90,
          height: 1,
          strokeWidth: 1,
          color: '#000000',
        };
        break;
      case 'rectangle':
        newElem = {
          id: newId,
          type: 'rectangle',
          x: 10,
          y: 10,
          width: 30,
          height: 15,
          strokeWidth: 1,
          strokeColor: '#000000',
          fillColor: 'transparent',
        };
        break;
      default:
        return;
    }

    const updated: LabelDocument = {
      ...document,
      elements: [...document.elements, newElem],
    };

    set({
      document: updated,
      selectedElementId: newId,
    });
    pushHistory();
  },

  updateElement: (id, patch) => {
    const { document, pushHistory } = get();
    const updatedElements = document.elements.map((el) =>
      el.id === id ? ({ ...el, ...patch } as LabelElement) : el
    );

    const updated: LabelDocument = {
      ...document,
      elements: updatedElements,
    };

    set({ document: updated });
    pushHistory();
  },

  removeElement: (id) => {
    const { document, selectedElementId, pushHistory } = get();
    const updatedElements = document.elements.filter((el) => el.id !== id);

    const updated: LabelDocument = {
      ...document,
      elements: updatedElements,
    };

    set({
      document: updated,
      selectedElementId: selectedElementId === id ? null : selectedElementId,
    });
    pushHistory();
  },

  duplicateElement: (id) => {
    const { document, pushHistory } = get();
    const target = document.elements.find((el) => el.id === id);
    if (!target) return;

    const newId = `elem-${Date.now()}`;
    const clone: LabelElement = {
      ...JSON.parse(JSON.stringify(target)),
      id: newId,
      x: target.x + 2,
      y: target.y + 2,
    };

    const updated: LabelDocument = {
      ...document,
      elements: [...document.elements, clone],
    };

    set({
      document: updated,
      selectedElementId: newId,
    });
    pushHistory();
  },

  pushHistory: () => {
    const { document, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(document)));
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      set({
        document: JSON.parse(JSON.stringify(history[prevIndex])),
        historyIndex: prevIndex,
      });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      set({
        document: JSON.parse(JSON.stringify(history[nextIndex])),
        historyIndex: nextIndex,
      });
    }
  },
}));
