import type { ElementBinding } from './canonicalFields';

export type ElementType = 'text' | 'price' | 'barcode' | 'qrcode' | 'line' | 'rectangle' | 'image';

export type VisibilityOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'empty' | 'not_empty';

export interface VisibilityRule {
  field: string;
  operator: VisibilityOperator;
  value: string;
  binding?: ElementBinding;
}

export interface FieldSubstringTransformation {
  type: 'substring';
  start: number;
  length: number;
}

export type FieldTransformation = FieldSubstringTransformation;

export interface ElementSourceReference {
  originalCommand?: string;
  originalLine?: number;
  originalIndex?: number;
  format?: string;
  state?: 'unchanged' | 'modified' | 'created' | 'deleted';
}

export interface BaseElement {
  id: string;
  name?: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  locked?: boolean;
  visible?: boolean;
  groupId?: string;
  visibilityRule?: VisibilityRule;
  transformations?: FieldTransformation[];
  sourceReference?: ElementSourceReference;
  binding?: ElementBinding;
  bindingFormat?: 'date' | 'datetime' | 'time' | string;
  format?: 'date' | 'datetime' | 'time' | string;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  field?: string;
  fontFamily: string;
  fontSize: number;
  fontWeight?: 'normal' | 'bold' | '500' | '600' | '700';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  alignment?: 'left' | 'center' | 'right';
  verticalAlignment?: 'top' | 'middle' | 'bottom';
  wrap?: 'auto' | 'none';
  color?: string;
  autoFit?: boolean;
  singleLine?: boolean;
  printerFontId?: string | number;
  horizontalMultiplier?: number;
  verticalMultiplier?: number;
  scaleX?: number;
  secondLineScale?: number;
  reversePrint?: boolean;
}

export interface PriceElement extends BaseElement {
  type: 'price';
  field: string;
  prefix?: string;
  sampleValue?: string;
  reducedCents?: boolean;
  centsAlignment?: 'top' | 'baseline';
  fontFamily?: string;
  integerFontSize?: number;
  fractionFontSize?: number;
  currencyFontSize?: number;
  color?: string;
  printerFontId?: string | number;
  horizontalMultiplier?: number;
  verticalMultiplier?: number;
  scaleX?: number;
  reversePrint?: boolean;
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  format: 'AUTO' | 'EAN13' | 'EAN8' | 'UPCA' | 'UPCE' | 'CODE128' | 'ITF14';
  field?: string;
  value: string;
  showText?: boolean;
  fontFamily?: string;
  fontSize?: number;
  narrowBarDots?: number;
  wideBarDots?: number;
  barcodeHeightDots?: number;
  sourceBarcodeType?: string;
}

export interface QrCodeElement extends BaseElement {
  type: 'qrcode';
  field?: string;
  value: string;
  qrLibraryId?: string;
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
  src: string;
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
  gapMm?: number;
  widthDots?: number;
  heightDots?: number;
  gapDots?: number;
  rawQCommand?: string;
  rawqCommand?: string;
}

export interface SourceFileMetadata {
  rawText: string;
  format: string;
  importedAt?: string;
  hash?: string;
  configCommands?: string[];
  comments?: Array<{ line: number; text: string }>;
  rawCommands?: Array<{ line: number; text: string }>;
  printQuantity?: string;
}

export interface LabelDocument {
  schemaVersion: number;
  title: string;
  dimensions: LabelDimensions;
  elements: LabelElement[];
  sourceFile?: SourceFileMetadata;
  createdAt?: string;
  updatedAt?: string;
}
