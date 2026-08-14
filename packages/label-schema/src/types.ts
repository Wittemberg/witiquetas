export type ElementType = 'text' | 'price' | 'barcode' | 'qrcode' | 'line' | 'rectangle' | 'image';

export interface BaseElement {
  id: string;
  name?: string; // Nome amigável do elemento (ex: "Preço Promocional", "Borda Principal")
  type: ElementType;
  x: number; // Coordenada X em mm
  y: number; // Coordenada Y em mm
  width: number; // Largura em mm
  height: number; // Altura em mm
  rotation?: number; // Rotação em graus (0, 90, 180, 270)
  locked?: boolean; // Se bloqueado para edição no canvas
  visible?: boolean; // Se visível na tela e na impressão
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string; // Conteúdo de texto estático ou template manual
  field?: string; // Vínculo com campo canônico ERP
  fontFamily: string;
  fontSize: number; // Tamanho em pt / px
  fontWeight?: 'normal' | 'bold' | '500' | '600' | '700';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  alignment?: 'left' | 'center' | 'right';
  verticalAlignment?: 'top' | 'middle' | 'bottom';
  wrap?: 'auto' | 'none';
  color?: string;
  autoFit?: boolean; // Redução/ajuste inteligente para não estourar a caixa
  singleLine?: boolean; // Forçar texto em uma única linha
}

export interface PriceElement extends BaseElement {
  type: 'price';
  field: string; // Ex: "produto.preco" ou "produto.promocao.preco"
  prefix?: string; // Ex: "R$", "$", "€"
  sampleValue?: string; // Valor manual para visualização / testes (ex: "9,99")
  reducedCents?: boolean; // Padrão Varejo: Centavos reduzidos a ~60% do inteiro (padrão true)
  centsAlignment?: 'top' | 'baseline'; // Alinhamento superior tradicional dos centavos
  fontFamily?: string;
  integerFontSize?: number; // Tamanho da parte inteira (calculado automaticamente se não definido)
  fractionFontSize?: number; // Tamanho dos centavos
  currencyFontSize?: number; // Tamanho do prefixo R$
  color?: string;
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  format: 'AUTO' | 'EAN13' | 'EAN8' | 'UPCA' | 'UPCE' | 'CODE128' | 'ITF14';
  field?: string; // Ex: "produto.ean" (Fonte da verdade)
  value: string; // Valor manual / exemplo para visualização
  showText?: boolean; // Exibir numeração humana abaixo das barras
  fontFamily?: string;
  fontSize?: number;
}

export interface QrCodeElement extends BaseElement {
  type: 'qrcode';
  field?: string;
  value: string; // URL ou conteúdo do QR Code
  qrLibraryId?: string; // ID de referência da biblioteca (opcional e desacoplado)
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
  fillColor?: string; // 'transparent' ou código hexadecimal
  cornerRadius?: number;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string; // URL ou Base64
  fit?: 'contain' | 'cover' | 'fill';
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
