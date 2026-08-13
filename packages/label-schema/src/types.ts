export type ElementType = 'text' | 'price' | 'barcode' | 'qrcode' | 'line' | 'rectangle' | 'image';

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number; // Coordenada X em mm
  y: number; // Coordenada Y em mm
  width: number; // Largura em mm
  height: number; // Altura em mm
  rotation?: number; // Rotação em graus (0, 90, 180, 270)
  locked?: boolean;
  visible?: boolean;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string; // Conteúdo de texto estático ou template ex: "{produto.descricao}"
  field?: string; // Vínculo com campo canônico
  fontFamily: string;
  fontSize: number; // Tamanho em pt / px
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  alignment?: 'left' | 'center' | 'right';
  verticalAlignment?: 'top' | 'middle' | 'bottom';
  wrap?: 'auto' | 'none';
  color?: string;
}

export interface PriceElement extends BaseElement {
  type: 'price';
  field: string; // Ex: "produto.preco" ou "produto.promocao.preco"
  prefix?: string; // Ex: "R$"
  integerFontSize: number; // Tamanho da parte inteira
  fractionFontSize: number; // Tamanho dos centavos
  currencyFontSize?: number; // Tamanho do R$
  color?: string;
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  format: 'EAN13' | 'CODE128' | 'EAN8';
  field?: string; // Ex: "produto.ean"
  value: string; // Valor padrão se não vinculado
  showText?: boolean; // Exibir números abaixo das barras
  fontFamily?: string;
  fontSize?: number;
}

export interface QrCodeElement extends BaseElement {
  type: 'qrcode';
  field?: string;
  value: string;
}

export interface LineElement extends BaseElement {
  type: 'line';
  strokeWidth: number;
  color?: string;
  dash?: number[];
}

export interface RectangleElement extends BaseElement {
  type: 'rectangle';
  strokeWidth: number;
  strokeColor?: string;
  fillColor?: string;
  cornerRadius?: number;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string; // URL ou Base64
}

export type LabelElement =
  | TextElement
  | PriceElement
  | BarcodeElement
  | QrCodeElement
  | LineElement
  | RectangleElement
  | ImageElement;

export interface LabelDimensions {
  widthMm: number;
  heightMm: number;
  dpi: 203 | 300 | 600;
  orientation?: 'portrait' | 'landscape';
}

export interface LabelDocument {
  schemaVersion: number;
  title: string;
  dimensions: LabelDimensions;
  elements: LabelElement[];
  createdAt?: string;
  updatedAt?: string;
}
