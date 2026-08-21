import { create } from 'zustand';
import {
  LabelDocument,
  LabelElement,
  ElementType,
  calculateOrientation,
} from '@witiquetas/label-schema';
import { QRCodeLibraryItemDTO, PrinterDTO } from '@witiquetas/contracts';
import { normalizeElementGeometry, normalizeDocumentGeometry, constrainElementToLabel, constrainGroupMovement, validateDocumentBounds, SAFE_AREA_MARGIN_MM } from './bounds';

// Converter Milímetros ➔ Pixels com base no DPI (ex: 203 DPI = ~8 dots/mm)
export function mmToPx(mm: number, dpi: number = 203): number {
  return Math.round((mm * dpi) / 25.4);
}

// Converter Pixels ➔ Milímetros
export function pxToMm(px: number, dpi: number = 203): number {
  return parseFloat(((px * 25.4) / dpi).toFixed(2));
}

// Formatador dimensional consistente pt-BR (ex: "30 mm" ou "25,4 mm")
export function formatDimensionBR(mm?: number | null): string {
  if (mm === undefined || mm === null || isNaN(Number(mm))) return '0 mm';
  const val = Number(mm);
  const rounded = Number.isInteger(val) ? val.toString() : val.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  return `${rounded} mm`;
}

// Verificador central de foco em campos de texto (Item 242-245, 265)
export function isEditingTextInput(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;

  const tag = active.tagName?.toLowerCase();
  if (tag === 'input') {
    const type = (active as HTMLInputElement).type?.toLowerCase() || 'text';
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color'].includes(type);
  }
  if (tag === 'textarea' || tag === 'select') return true;
  if (active.isContentEditable) return true;
  if (active.getAttribute('role') === 'textbox') return true;

  return false;
}

// Dados comerciais de teste simulados para o modo Preview
export const MOCK_PRODUCT_DATA: Record<string, string> = {
  'produto.codigo': '789123',
  'produto.descricao': 'REFRIGERANTE COCA-COLA 2L',
  'produto.descricaoLonga': 'REFRIGERANTE COCA-COLA PET 2 LITROS - EMBALAGEM FAMÍLIA',
  'produto.ean': '7894900011517',
  'produto.unidade': 'UN',
  'produto.preco': '9.99',
  'produto.promocao': '7.99',
  'produto.promocao.preco': '7.99',
  'produto.promocao.inicio': '10/08/2026',
  'produto.promocao.fim': '20/08/2026',
  'produto.referencia.unidade': '1L',
  'produto.referencia.preco': '5.00',
  'produto.fabricante': 'COCA-COLA',
  'empresa.razaoSocial': 'WR TECNOLOGIA SUPERMERCADOS LTDA',
  'empresa.nomeFantasia': 'SUPERMERCADO WR',
  'empresa.nomeFilial': 'MATRIZ SÃO PAULO',
  'job.quantidade': '1',
  'impressao.data': '15/08/2026',
  'impressao.hora': '15:30',
  'system.printDateTime': '20/08/2026 12:35',
  'system.printDate': '20/08/2026',
  'system.printTime': '12:35',
};


// Resolvedor Universal de Campos da Integração e do Sistema
export function resolveFieldValue(
  field?: string,
  data: Record<string, string> = MOCK_PRODUCT_DATA,
  format?: string
): string | undefined {
  if (!field) return undefined;

  if (field === 'system.printDateTime' || field === 'system.printDate' || field === 'system.printTime') {
    const fmt = format || (field === 'system.printDate' ? 'date' : field === 'system.printTime' ? 'time' : 'datetime');
    if (fmt === 'date') {
      return data['system.printDate'] || '20/08/2026';
    }
    if (fmt === 'time') {
      return data['system.printTime'] || '12:35';
    }
    return data['system.printDateTime'] || '20/08/2026 12:35';
  }

  if (data[field] !== undefined) {
    return data[field];
  }

  return undefined;
}

// Avaliador Seguro de Regras de Visibilidade Condicional (Item 277-286)
export function evaluateVisibilityRule(
  rule?: import('@witiquetas/label-schema').VisibilityRule | null,
  data: Record<string, string> = MOCK_PRODUCT_DATA
): boolean {
  if (!rule || !rule.field) return true;

  const resolved = resolveFieldValue(rule.field, data);
  const rawVal = resolved !== undefined ? String(resolved).trim() : '';
  const targetVal = String(rule.value || '').trim();

  switch (rule.operator) {
    case '=':
      return rawVal === targetVal;
    case '!=':
      return rawVal !== targetVal;
    case '>': {
      const numRaw = parseFloat(rawVal);
      const numTarget = parseFloat(targetVal);
      if (!isNaN(numRaw) && !isNaN(numTarget)) return numRaw > numTarget;
      return rawVal > targetVal;
    }
    case '<': {
      const numRaw = parseFloat(rawVal);
      const numTarget = parseFloat(targetVal);
      if (!isNaN(numRaw) && !isNaN(numTarget)) return numRaw < numTarget;
      return rawVal < targetVal;
    }
    case '>=': {
      const numRaw = parseFloat(rawVal);
      const numTarget = parseFloat(targetVal);
      if (!isNaN(numRaw) && !isNaN(numTarget)) return numRaw >= numTarget;
      return rawVal >= targetVal;
    }
    case '<=': {
      const numRaw = parseFloat(rawVal);
      const numTarget = parseFloat(targetVal);
      if (!isNaN(numRaw) && !isNaN(numTarget)) return numRaw <= numTarget;
      return rawVal <= targetVal;
    }
    case 'empty':
      return rawVal === '' || rawVal === '0' || rawVal === '0.00';
    case 'not_empty':
      return rawVal !== '' && rawVal !== '0' && rawVal !== '0.00';
    default:
      return true;
  }
}

// Documento inicial padrão (100x30mm em 203 DPI)
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
      name: 'Faixa de Cabeçalho',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 6,
      strokeWidth: 0,
      fillColor: '#1e293b',
      locked: false,
      visible: true,
    },
    {
      id: 'header-text',
      name: 'Texto Destaque',
      type: 'text',
      text: 'OFERTA ESPECIAL',
      x: 2,
      y: 1,
      width: 96,
      height: 4,
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 'bold',
      alignment: 'center',
      color: '#ffffff',
      locked: false,
      visible: true,
    },
    {
      id: 'prod-desc',
      name: 'Nome do Produto',
      type: 'text',
      text: 'REFRIGERANTE COCA-COLA 2L',
      field: 'produto.descricao',
      x: 4,
      y: 8,
      width: 60,
      height: 10,
      fontFamily: 'Roboto',
      fontSize: 12,
      fontWeight: 'bold',
      alignment: 'left',
      color: '#0f172a',
      locked: false,
      visible: true,
    },
    {
      id: 'prod-price',
      name: 'Preço Principal',
      type: 'price',
      field: 'produto.preco',
      prefix: 'R$',
      fontFamily: 'Roboto',
      x: 65,
      y: 7,
      width: 31,
      height: 14,
      integerFontSize: 24,
      fractionFontSize: 14,
      currencyFontSize: 12,
      color: '#dc2626',
      locked: false,
      visible: true,
    },
    {
      id: 'prod-ean',
      name: 'Código de Barras EAN',
      type: 'barcode',
      format: 'EAN13',
      field: 'produto.ean',
      value: '7894900011517',
      x: 4,
      y: 19,
      width: 50,
      height: 9,
      showText: true,
      locked: false,
      visible: true,
    },
    {
      id: 'company-name',
      name: 'Nome da Empresa',
      type: 'text',
      text: 'SUPERMERCADO WR',
      field: 'empresa.nomeFantasia',
      x: 56,
      y: 22,
      width: 40,
      height: 5,
      fontFamily: 'Roboto',
      fontSize: 8,
      alignment: 'right',
      color: '#475569',
      locked: false,
      visible: true,
    },
  ],
};

export interface CreateNewDocumentParams {
  title: string;
  widthMm: number;
  heightMm: number;
  dpi?: 203 | 300 | 600;
  nicheName?: string;
}

interface EditorState {
  document: LabelDocument;
  selectedElementIds: string[];
  zoom: number; // 1 = 100%
  snapToGrid: boolean;
  gridSizeMm: number;
  showRulers: boolean;
  showSafeArea: boolean;
  safeAreaMarginMm: number;
  showPreviewData: boolean;
  showGhostConditionalElements: boolean; // Modo Fantasma: elementos condicionais inativos com opacidade (Item 286)
  previewScenario: 'normal' | 'promo' | 'custom'; // Cenário de teste (Item 285)
  mockProductData: Record<string, string>;
  isDirty: boolean;
  saveStatus: 'saved' | 'unsaved' | 'saving' | 'error';
  currentTemplateId: string | null;
  currentTemplateVersion: number | null;

  // Painéis
  isLeftSidebarCollapsed: boolean;
  isRightSidebarCollapsed: boolean;

  // Impressora Ativa e Biblioteca de QR Codes
  selectedPrinter: PrinterDTO | null;
  qrCodeLibrary: QRCodeLibraryItemDTO[];

  // Histórico Undo / Redo
  history: LabelDocument[];
  historyIndex: number;

  // Área de transferência
  clipboard: LabelElement[];

  // Actions
  setDocument: (doc: LabelDocument, templateId?: string, version?: number) => void;
  createNewDocument: (params: CreateNewDocumentParams) => void;
  updateDimensions: (widthMm: number, heightMm: number, dpi: 203 | 300 | 600) => void;
  saveDocumentToBackend: () => Promise<boolean>;
  setSaveStatus: (status: 'saved' | 'unsaved' | 'saving' | 'error') => void;
  
  // Seleção
  setSelectedElementId: (id: string | null) => void;
  setSelectedElementIds: (ids: string[]) => void;
  toggleSelectElement: (id: string, multi?: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Visualização e Ferramentas
  setZoom: (zoom: number) => void;
  fitToScreen: (containerW?: number, containerH?: number) => void;
  setSnapToGrid: (snap: boolean) => void;
  setShowRulers: (show: boolean) => void;
  setShowSafeArea: (show: boolean) => void;
  setShowPreviewData: (show: boolean) => void;
  toggleShowGhostConditionalElements: () => void;
  setPreviewScenario: (scenario: 'normal' | 'promo' | 'custom') => void;
  updateMockProductData: (field: string, val: string) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;

  // Impressora & QR Codes
  setSelectedPrinter: (printer: PrinterDTO | null) => void;
  setQRCodeLibrary: (items: QRCodeLibraryItemDTO[]) => void;
  addQRCodeToLibrary: (item: QRCodeLibraryItemDTO) => void;

  // CRUD de Elementos
  addElement: (type: ElementType) => void;
  updateElement: (id: string, patch: Partial<LabelElement>) => void;
  updateSelectedElements: (patch: Partial<LabelElement>) => void;
  removeElement: (id: string) => void;
  removeSelectedElements: () => void;
  duplicateSelectedElements: () => void;
  renameElement: (id: string, name: string) => void;
  toggleLock: (id: string) => void;
  toggleVisibility: (id: string) => void;

  // Camadas (Z-Index)
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;

  // Clipboard (Copiar / Recortar / Colar)
  copySelection: () => void;
  cutSelection: () => void;
  pasteSelection: () => void;

  // Alinhamento & Nudge
  alignElements: (direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  distributeElements: (direction: 'horizontal' | 'vertical') => void;
  nudgeElements: (dxMm: number, dyMm: number) => void;

  // Histórico & Auto-save
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  markSaved: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  document: normalizeDocumentGeometry(initialDocument),
  selectedElementIds: ['prod-desc'],
  zoom: 1.0, // Zoom padrão inicial de 100%
  snapToGrid: true,
  gridSizeMm: 1,
  showRulers: true,
  showSafeArea: false,
  safeAreaMarginMm: 1.0,
  showPreviewData: true,
  showGhostConditionalElements: false, // Modo Fantasma: elementos condicionais inativos aparecem translúcidos
  previewScenario: 'promo',
  mockProductData: { ...MOCK_PRODUCT_DATA },
  isDirty: false,
  saveStatus: 'saved',
  currentTemplateId: null,
  currentTemplateVersion: null,

  isLeftSidebarCollapsed: false,
  isRightSidebarCollapsed: false,

  selectedPrinter: null,
  qrCodeLibrary: [],

  history: [normalizeDocumentGeometry(initialDocument)],
  historyIndex: 0,
  clipboard: [],

  setDocument: (doc, templateId, version) => {
    const normalizedDoc = normalizeDocumentGeometry(doc);
    set({
      document: normalizedDoc,
      currentTemplateId: templateId || null,
      currentTemplateVersion: version !== undefined ? version : null,
      selectedElementIds: [],
      history: [normalizedDoc],
      historyIndex: 0,
      isDirty: false,
      saveStatus: 'saved',
    });
  },

  setSaveStatus: (status) => set({ saveStatus: status }),

  createNewDocument: ({ title, widthMm, heightMm, dpi = 203, nicheName }) => {
    const orientation = calculateOrientation(widthMm, heightMm);
    const elements: LabelElement[] = [];

    if (widthMm >= 40 && heightMm >= 20) {
      elements.push({
        id: `elem-desc-${Date.now()}`,
        name: 'Nome do Produto',
        type: 'text',
        text: 'NOME / DESCRIÇÃO DO PRODUTO',
        field: 'produto.descricao',
        x: Math.round(widthMm * 0.05),
        y: Math.round(heightMm * 0.08),
        width: Math.round(widthMm * 0.9),
        height: Math.max(5, Math.round(heightMm * 0.2)),
        fontFamily: 'Roboto',
        fontSize: Math.min(14, Math.max(8, Math.round(widthMm * 0.12))),
        fontWeight: 'bold',
        alignment: 'left',
        color: '#0f172a',
        locked: false,
        visible: true,
      });

      if (heightMm >= 30) {
        elements.push({
          id: `elem-price-${Date.now() + 1}`,
          name: 'Preço Promocional',
          type: 'price',
          field: 'produto.preco',
          prefix: 'R$',
          fontFamily: 'Roboto',
          x: Math.round(widthMm * 0.55),
          y: Math.round(heightMm * 0.35),
          width: Math.round(widthMm * 0.4),
          height: Math.round(heightMm * 0.3),
          integerFontSize: Math.min(26, Math.max(14, Math.round(heightMm * 0.5))),
          fractionFontSize: Math.min(16, Math.max(10, Math.round(heightMm * 0.3))),
          currencyFontSize: 10,
          color: '#dc2626',
          locked: false,
          visible: true,
        });

        elements.push({
          id: `elem-ean-${Date.now() + 2}`,
          name: 'Código de Barras EAN',
          type: 'barcode',
          format: 'EAN13',
          field: 'produto.ean',
          value: '7894900011517',
          x: Math.round(widthMm * 0.05),
          y: Math.round(heightMm * 0.45),
          width: Math.min(widthMm * 0.48, 50),
          height: Math.round(heightMm * 0.4),
          showText: true,
          locked: false,
          visible: true,
        });
      }
    } else {
      elements.push({
        id: `elem-text-${Date.now()}`,
        name: 'Item / Código',
        type: 'text',
        text: 'ITEM REF',
        field: 'produto.descricao',
        x: 1,
        y: 1,
        width: widthMm - 2,
        height: heightMm - 2,
        fontFamily: 'Roboto',
        fontSize: 8,
        fontWeight: 'normal',
        alignment: 'center',
        color: '#0f172a',
        locked: false,
        visible: true,
      });
    }

    const newDoc: LabelDocument = {
      schemaVersion: 1,
      title: title || `${nicheName || 'Etiqueta'} (${widthMm}x${heightMm}mm)`,
      dimensions: {
        widthMm,
        heightMm,
        dpi,
        orientation: orientation === 'quadrada' ? 'portrait' : orientation === 'horizontal' ? 'landscape' : 'portrait',
      },
      elements,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    set({
      document: newDoc,
      selectedElementIds: elements.length > 0 ? [elements[0].id] : [],
      history: [newDoc],
      historyIndex: 0,
      isDirty: false,
      zoom: 1.0,
    });
  },

  updateDimensions: (widthMm, heightMm, dpi) => {
    const { document, pushHistory } = get();
    const orientation = calculateOrientation(widthMm, heightMm);
    const updated: LabelDocument = {
      ...document,
      dimensions: {
        ...document.dimensions,
        widthMm,
        heightMm,
        dpi,
        orientation: orientation === 'quadrada' ? 'portrait' : orientation === 'horizontal' ? 'landscape' : 'portrait',
      },
    };
    set({ document: updated, isDirty: true });
    pushHistory();
  },

  setSelectedElementId: (id) => set({ selectedElementIds: id ? [id] : [] }),
  setSelectedElementIds: (ids) => set({ selectedElementIds: ids }),
  toggleSelectElement: (id, multi = false) => {
    const { selectedElementIds } = get();
    if (!multi) {
      set({ selectedElementIds: [id] });
    } else {
      if (selectedElementIds.includes(id)) {
        set({ selectedElementIds: selectedElementIds.filter((item) => item !== id) });
      } else {
        set({ selectedElementIds: [...selectedElementIds, id] });
      }
    }
  },
  selectAll: () => set({ selectedElementIds: get().document.elements.map((el) => el.id) }),
  clearSelection: () => set({ selectedElementIds: [] }),

  setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(4.0, parseFloat((Number(zoom) || 1.0).toFixed(2)))) }),
  fitToScreen: (containerW = 800, containerH = 500) => {
    const { document } = get();
    const widthMm = Number(document?.dimensions?.widthMm) || 100;
    const heightMm = Number(document?.dimensions?.heightMm) || 30;
    const dpi = Number(document?.dimensions?.dpi) || 203;

    const stageW = mmToPx(widthMm, dpi);
    const stageH = mmToPx(heightMm, dpi);

    const paddingPx = 64;
    const availW = Math.max(100, containerW - paddingPx);
    const availH = Math.max(100, containerH - paddingPx);

    const scaleW = availW / stageW;
    const scaleH = availH / stageH;
    const targetZoom = Math.min(scaleW, scaleH);
    const clampedZoom = Math.max(0.25, Math.min(4.0, parseFloat(targetZoom.toFixed(2))));

    set({ zoom: clampedZoom });
  },
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setShowRulers: (showRulers) => set({ showRulers }),
  setShowSafeArea: (showSafeArea) => set({ showSafeArea }),
  setShowPreviewData: (showPreviewData) => set({ showPreviewData }),
  toggleShowGhostConditionalElements: () =>
    set((state) => ({ showGhostConditionalElements: !state.showGhostConditionalElements })),
  setPreviewScenario: (scenario) => {
    const { mockProductData } = get();
    const updated = { ...mockProductData };
    if (scenario === 'promo') {
      updated['produto.promocao'] = '7.99';
      updated['produto.promocao.preco'] = '7.99';
    } else if (scenario === 'normal') {
      updated['produto.promocao'] = '0';
      updated['produto.promocao.preco'] = '0';
    }
    set({ previewScenario: scenario, mockProductData: updated });
  },
  updateMockProductData: (field, val) =>
    set((state) => ({
      mockProductData: { ...state.mockProductData, [field]: val },
      previewScenario: 'custom',
    })),
  toggleLeftSidebar: () => set((state) => ({ isLeftSidebarCollapsed: !state.isLeftSidebarCollapsed })),
  toggleRightSidebar: () => set((state) => ({ isRightSidebarCollapsed: !state.isRightSidebarCollapsed })),

  setSelectedPrinter: (printer) => set({ selectedPrinter: printer }),
  setQRCodeLibrary: (items) => set({ qrCodeLibrary: items }),
  addQRCodeToLibrary: (item) => set((state) => ({ qrCodeLibrary: [item, ...state.qrCodeLibrary] })),

  addElement: (type) => {
    const { document, pushHistory } = get();
    const newId = `elem-${Date.now()}`;
    let newElem: LabelElement;

    switch (type) {
      case 'text':
        newElem = {
          id: newId,
          name: 'Texto Manual',
          type: 'text',
          text: 'Novo Texto',
          x: 10,
          y: 10,
          width: Math.min(40, document.dimensions.widthMm - 10),
          height: 6,
          fontFamily: 'Roboto',
          fontSize: 12,
          fontWeight: 'normal',
          alignment: 'left',
          color: '#0f172a',
          locked: false,
          visible: true,
          sourceReference: { state: 'created', format: document.sourceFile?.format || 'pplb' },
        };
        break;
      case 'price':
        newElem = {
          id: newId,
          name: 'Preço em R$',
          type: 'price',
          field: 'produto.preco',
          prefix: 'R$',
          fontFamily: 'Roboto',
          x: 10,
          y: 10,
          width: Math.min(30, document.dimensions.widthMm - 10),
          height: 12,
          integerFontSize: 20,
          fractionFontSize: 12,
          currencyFontSize: 10,
          color: '#dc2626',
          locked: false,
          visible: true,
          sourceReference: { state: 'created', format: document.sourceFile?.format || 'pplb' },
        };
        break;
      case 'barcode':
        newElem = {
          id: newId,
          name: 'Código de Barras',
          type: 'barcode',
          format: 'EAN13',
          field: 'produto.ean',
          value: '7894900011517',
          x: 10,
          y: 10,
          width: Math.min(45, document.dimensions.widthMm - 10),
          height: Math.min(12, document.dimensions.heightMm - 10),
          showText: true,
          locked: false,
          visible: true,
          sourceReference: { state: 'created', format: document.sourceFile?.format || 'pplb' },
        };
        break;
      case 'qrcode':
        newElem = {
          id: newId,
          name: 'QR Code Link',
          type: 'qrcode',
          value: 'https://witiquetas.wrtec.com.br/clube',
          x: 10,
          y: 10,
          width: Math.min(15, document.dimensions.widthMm - 10),
          height: Math.min(15, document.dimensions.heightMm - 10),
          locked: false,
          visible: true,
          sourceReference: { state: 'created', format: document.sourceFile?.format || 'pplb' },
        };
        break;
      case 'rectangle':
        newElem = {
          id: newId,
          name: 'Retângulo / Moldura',
          type: 'rectangle',
          x: 5,
          y: 5,
          width: Math.min(30, document.dimensions.widthMm - 10),
          height: Math.min(15, document.dimensions.heightMm - 10),
          strokeWidth: 1,
          strokeColor: '#000000',
          fillColor: 'transparent',
          locked: false,
          visible: true,
          sourceReference: { state: 'created', format: document.sourceFile?.format || 'pplb' },
        };
        break;
      case 'line':
        newElem = {
          id: newId,
          name: 'Linha Divisória',
          type: 'line',
          x: 2,
          y: 10,
          width: document.dimensions.widthMm - 4,
          height: 1,
          strokeWidth: 1,
          color: '#000000',
          locked: false,
          visible: true,
          sourceReference: { state: 'created', format: document.sourceFile?.format || 'pplb' },
        };
        break;
      case 'image':
        newElem = {
          id: newId,
          name: 'Logotipo / Imagem',
          type: 'image',
          src: 'https://via.placeholder.com/150',
          x: 5,
          y: 5,
          width: Math.min(20, document.dimensions.widthMm - 10),
          height: Math.min(20, document.dimensions.heightMm - 10),
          locked: false,
          visible: true,
          sourceReference: { state: 'created', format: document.sourceFile?.format || 'pplb' },
        };
        break;
      default:
        return;
    }

    newElem = constrainElementToLabel(newElem, document.dimensions);

    const updated: LabelDocument = {
      ...document,
      elements: [...document.elements, newElem],
    };

    set({
      document: updated,
      selectedElementIds: [newId],
      isDirty: true,
    });
    pushHistory();
  },

  updateElement: (id, patch) => {
    const { document, pushHistory } = get();
    const updatedElements = document.elements.map((el) => {
      if (el.id !== id) return el;
      const currentRef = el.sourceReference || {};
      const newRef = {
        ...currentRef,
        state: currentRef.state === 'created' ? ('created' as const) : ('modified' as const),
      };
      const merged = { ...el, ...patch, sourceReference: newRef } as LabelElement;
      return constrainElementToLabel(merged, document.dimensions);
    });

    const updated: LabelDocument = {
      ...document,
      elements: updatedElements,
    };

    set({ document: updated, isDirty: true });
    pushHistory();
  },

  updateSelectedElements: (patch) => {
    const { document, selectedElementIds, pushHistory } = get();
    if (selectedElementIds.length === 0) return;

    const updatedElements = document.elements.map((el) => {
      if (!selectedElementIds.includes(el.id)) return el;
      const currentRef = el.sourceReference || {};
      const newRef = {
        ...currentRef,
        state: currentRef.state === 'created' ? ('created' as const) : ('modified' as const),
      };
      const merged = { ...el, ...patch, sourceReference: newRef } as LabelElement;
      return constrainElementToLabel(merged, document.dimensions);
    });

    set({ document: { ...document, elements: updatedElements }, isDirty: true });
    pushHistory();
  },

  removeElement: (id) => {
    const { document, selectedElementIds, pushHistory } = get();
    const updatedElements = document.elements.filter((el) => el.id !== id);

    set({
      document: { ...document, elements: updatedElements },
      selectedElementIds: selectedElementIds.filter((item) => item !== id),
      isDirty: true,
    });
    pushHistory();
  },

  removeSelectedElements: () => {
    const { document, selectedElementIds, pushHistory } = get();
    if (selectedElementIds.length === 0) return;

    const updatedElements = document.elements.filter((el) => !selectedElementIds.includes(el.id));
    set({
      document: { ...document, elements: updatedElements },
      selectedElementIds: [],
      isDirty: true,
    });
    pushHistory();
  },

  duplicateSelectedElements: () => {
    const { document, selectedElementIds, pushHistory } = get();
    if (selectedElementIds.length === 0) return;

    const newClones: LabelElement[] = [];
    const newSelectedIds: string[] = [];

    document.elements.forEach((el) => {
      if (selectedElementIds.includes(el.id)) {
        const newId = `elem-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
        let clone: LabelElement = {
          ...JSON.parse(JSON.stringify(el)),
          id: newId,
          name: el.name ? `${el.name} (Cópia)` : undefined,
          x: el.x + 2,
          y: el.y + 2,
        };
        clone = constrainElementToLabel(clone, document.dimensions);
        newClones.push(clone);
        newSelectedIds.push(newId);
      }
    });

    set({
      document: { ...document, elements: [...document.elements, ...newClones] },
      selectedElementIds: newSelectedIds,
      isDirty: true,
    });
    pushHistory();
  },

  renameElement: (id, name) => {
    const { updateElement } = get();
    updateElement(id, { name: name.trim() });
  },

  toggleLock: (id) => {
    const { document, pushHistory } = get();
    const updated = document.elements.map((el) =>
      el.id === id ? { ...el, locked: !el.locked } : el
    );
    set({ document: { ...document, elements: updated as any }, isDirty: true });
    pushHistory();
  },

  toggleVisibility: (id) => {
    const { document, pushHistory } = get();
    const updated = document.elements.map((el) =>
      el.id === id ? { ...el, visible: el.visible !== false ? false : true } : el
    );
    set({ document: { ...document, elements: updated as any }, isDirty: true });
    pushHistory();
  },

  bringToFront: (id) => {
    const { document, pushHistory } = get();
    const item = document.elements.find((el) => el.id === id);
    if (!item) return;
    const filtered = document.elements.filter((el) => el.id !== id);
    set({ document: { ...document, elements: [...filtered, item] }, isDirty: true });
    pushHistory();
  },

  sendToBack: (id) => {
    const { document, pushHistory } = get();
    const item = document.elements.find((el) => el.id === id);
    if (!item) return;
    const filtered = document.elements.filter((el) => el.id !== id);
    set({ document: { ...document, elements: [item, ...filtered] }, isDirty: true });
    pushHistory();
  },

  bringForward: (id) => {
    const { document, pushHistory } = get();
    const index = document.elements.findIndex((el) => el.id === id);
    if (index === -1 || index === document.elements.length - 1) return;
    const newElements = [...document.elements];
    const temp = newElements[index];
    newElements[index] = newElements[index + 1];
    newElements[index + 1] = temp;
    set({ document: { ...document, elements: newElements }, isDirty: true });
    pushHistory();
  },

  sendBackward: (id) => {
    const { document, pushHistory } = get();
    const index = document.elements.findIndex((el) => el.id === id);
    if (index <= 0) return;
    const newElements = [...document.elements];
    const temp = newElements[index];
    newElements[index] = newElements[index - 1];
    newElements[index - 1] = temp;
    set({ document: { ...document, elements: newElements }, isDirty: true });
    pushHistory();
  },

  copySelection: () => {
    const { document, selectedElementIds } = get();
    const targets = document.elements.filter((el) => selectedElementIds.includes(el.id));
    if (targets.length > 0) {
      set({ clipboard: JSON.parse(JSON.stringify(targets)) });
    }
  },

  cutSelection: () => {
    const { copySelection, removeSelectedElements } = get();
    copySelection();
    removeSelectedElements();
  },

  pasteSelection: () => {
    const { document, clipboard, pushHistory } = get();
    if (clipboard.length === 0) return;

    const newClones: LabelElement[] = [];
    const newSelectedIds: string[] = [];

    clipboard.forEach((el) => {
      const newId = `elem-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
      let clone: LabelElement = {
        ...JSON.parse(JSON.stringify(el)),
        id: newId,
        x: el.x + 2,
        y: el.y + 2,
      };
      clone = constrainElementToLabel(clone, document.dimensions);
      newClones.push(clone);
      newSelectedIds.push(newId);
    });

    set({
      document: { ...document, elements: [...document.elements, ...newClones] },
      selectedElementIds: newSelectedIds,
      isDirty: true,
    });
    pushHistory();
  },

  alignElements: (direction) => {
    const { document, selectedElementIds, pushHistory } = get();
    if (selectedElementIds.length < 2) return;

    const targets = document.elements.filter((el) => selectedElementIds.includes(el.id));
    let refVal = 0;

    if (direction === 'left') {
      refVal = Math.min(...targets.map((el) => el.x));
    } else if (direction === 'right') {
      refVal = Math.max(...targets.map((el) => el.x + el.width));
    } else if (direction === 'top') {
      refVal = Math.min(...targets.map((el) => el.y));
    } else if (direction === 'bottom') {
      refVal = Math.max(...targets.map((el) => el.y + el.height));
    } else if (direction === 'center') {
      const minX = Math.min(...targets.map((el) => el.x));
      const maxX = Math.max(...targets.map((el) => el.x + el.width));
      refVal = (minX + maxX) / 2;
    } else if (direction === 'middle') {
      const minY = Math.min(...targets.map((el) => el.y));
      const maxY = Math.max(...targets.map((el) => el.y + el.height));
      refVal = (minY + maxY) / 2;
    }

    const updatedElements = document.elements.map((el) => {
      if (!selectedElementIds.includes(el.id)) return el;
      let aligned = { ...el };
      if (direction === 'left') aligned.x = refVal;
      if (direction === 'right') aligned.x = refVal - el.width;
      if (direction === 'top') aligned.y = refVal;
      if (direction === 'bottom') aligned.y = refVal - el.height;
      if (direction === 'center') aligned.x = refVal - el.width / 2;
      if (direction === 'middle') aligned.y = refVal - el.height / 2;
      return constrainElementToLabel(aligned, document.dimensions);
    });

    set({ document: { ...document, elements: updatedElements }, isDirty: true });
    pushHistory();
  },

  distributeElements: (direction) => {
    const { document, selectedElementIds, pushHistory } = get();
    if (selectedElementIds.length < 3) return;

    const targets = document.elements
      .filter((el) => selectedElementIds.includes(el.id))
      .sort((a, b) => (direction === 'horizontal' ? a.x - b.x : a.y - b.y));

    if (direction === 'horizontal') {
      const minX = targets[0].x;
      const last = targets[targets.length - 1];
      const maxX = last.x + last.width;
      const totalElementsWidth = targets.reduce((sum, el) => sum + el.width, 0);
      const gap = (maxX - minX - totalElementsWidth) / (targets.length - 1);

      let currentX = minX;
      const updatedMap = new Map<string, number>();
      targets.forEach((el) => {
        updatedMap.set(el.id, currentX);
        currentX += el.width + gap;
      });

      const updated = document.elements.map((el) => {
        if (updatedMap.has(el.id)) {
          return constrainElementToLabel({ ...el, x: updatedMap.get(el.id)! }, document.dimensions);
        }
        return el;
      });
      set({ document: { ...document, elements: updated }, isDirty: true });
    } else {
      const minY = targets[0].y;
      const last = targets[targets.length - 1];
      const maxY = last.y + last.height;
      const totalElementsHeight = targets.reduce((sum, el) => sum + el.height, 0);
      const gap = (maxY - minY - totalElementsHeight) / (targets.length - 1);

      let currentY = minY;
      const updatedMap = new Map<string, number>();
      targets.forEach((el) => {
        updatedMap.set(el.id, currentY);
        currentY += el.height + gap;
      });

      const updated = document.elements.map((el) => {
        if (updatedMap.has(el.id)) {
          return constrainElementToLabel({ ...el, y: updatedMap.get(el.id)! }, document.dimensions);
        }
        return el;
      });
      set({ document: { ...document, elements: updated }, isDirty: true });
    }

    pushHistory();
  },

  nudgeElements: (dxMm, dyMm) => {
    const { document, selectedElementIds, pushHistory } = get();
    if (selectedElementIds.length === 0) return;

    const selectedElements = document.elements.filter(
      (el) => selectedElementIds.includes(el.id) && !el.locked
    );
    if (selectedElements.length === 0) return;

    if (selectedElements.length === 1) {
      const el = selectedElements[0];
      const moved = {
        ...el,
        x: el.x + dxMm,
        y: el.y + dyMm,
      };
      const normalized = normalizeElementGeometry(moved, document.dimensions, { dpi: document.dimensions.dpi });

      if (normalized.x === el.x && normalized.y === el.y) return;

      const updatedElements = document.elements.map((item) => (item.id === el.id ? normalized : item));
      set({ document: { ...document, elements: updatedElements }, isDirty: true });
      pushHistory();
      return;
    }

    const { dxMm: allowedDx, dyMm: allowedDy } = constrainGroupMovement(
      selectedElements,
      dxMm,
      dyMm,
      document.dimensions
    );

    if (allowedDx === 0 && allowedDy === 0) return;

    const updatedElements = document.elements.map((el) => {
      if (!selectedElementIds.includes(el.id) || el.locked) return el;
      const moved = {
        ...el,
        x: el.x + allowedDx,
        y: el.y + allowedDy,
      };
      return normalizeElementGeometry(moved, document.dimensions, { dpi: document.dimensions.dpi });
    });

    set({ document: { ...document, elements: updatedElements }, isDirty: true });
    pushHistory();
  },

  pushHistory: () => {
    const { document, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(document)));
    // Limitar histórico a 50 passos
    if (newHistory.length > 50) newHistory.shift();

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
      isDirty: true,
      saveStatus: 'unsaved',
    });

    // Auto-save local draft
    try {
      localStorage.setItem('witiquetas-draft-current', JSON.stringify(document));
    } catch {
      // ignore
    }
  },

  markSaved: () => set({ isDirty: false, saveStatus: 'saved' }),

  saveDocumentToBackend: async () => {
    const { document, currentTemplateId, currentTemplateVersion } = get();
    set({ saveStatus: 'saving' });

    try {
      // Importar dinamicamente templatesApi para evitar dependências circulares de módulo
      const { templatesApi } = await import('../services/templatesApi.js');

      if (currentTemplateId) {
        const updated = await templatesApi.updateTemplate(currentTemplateId, {
          title: document.title,
          name: document.title,
          document,
          expectedVersion: currentTemplateVersion || undefined,
        });
        set({
          currentTemplateVersion: updated.version,
          saveStatus: 'saved',
          isDirty: false,
        });
      } else {
        const created = await templatesApi.createTemplate({
          title: document.title || 'Etiqueta Térmica',
          name: document.title || 'Etiqueta Térmica',
          scope: 'COMPANY',
          document,
        });
        set({
          currentTemplateId: created.id,
          currentTemplateVersion: created.version,
          saveStatus: 'saved',
          isDirty: false,
        });
      }
      return true;
    } catch (err: any) {
      console.error('[EditorStore] Falha no salvamento no backend:', err);
      // REGRA: Em caso de erro (ex: 409 Conflito ou indisponibilidade de rede),
      // mantém o documento aberto e as alterações vivas em memória local sem descartar nada
      set({ saveStatus: 'error' });
      return false;
    }
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      set({
        document: JSON.parse(JSON.stringify(history[prevIndex])),
        historyIndex: prevIndex,
        isDirty: true,
        saveStatus: 'unsaved',
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
        isDirty: true,
        saveStatus: 'unsaved',
      });
    }
  },
}));
