import { z } from 'zod';

export const LabelDimensionsSchema = z.object({
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  dpi: z.union([z.literal(203), z.literal(300), z.literal(600)]),
  orientation: z.enum(['portrait', 'landscape']).optional(),
});

export const BaseElementSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.enum(['text', 'price', 'barcode', 'qrcode', 'line', 'rectangle', 'image']),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().optional(),
  locked: z.boolean().optional(),
  visible: z.boolean().optional(),
});

export const TextElementSchema = BaseElementSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  field: z.string().optional(),
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  fontWeight: z.union([z.enum(['normal', 'bold']), z.string()]).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  textDecoration: z.enum(['none', 'underline']).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  verticalAlignment: z.enum(['top', 'middle', 'bottom']).optional(),
  wrap: z.enum(['auto', 'none']).optional(),
  color: z.string().optional(),
  autoFit: z.boolean().optional(),
  singleLine: z.boolean().optional(),
});

export const PriceElementSchema = BaseElementSchema.extend({
  type: z.literal('price'),
  field: z.string(),
  prefix: z.string().max(8).optional(),
  sampleValue: z.string().optional(),
  reducedCents: z.boolean().optional(),
  centsAlignment: z.enum(['top', 'baseline']).optional(),
  fontFamily: z.string().optional(),
  integerFontSize: z.number().positive().optional(),
  fractionFontSize: z.number().positive().optional(),
  currencyFontSize: z.number().positive().optional(),
  color: z.string().optional(),
});

export const BarcodeElementSchema = BaseElementSchema.extend({
  type: z.literal('barcode'),
  format: z.enum(['AUTO', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'CODE128', 'ITF14']),
  field: z.string().optional(),
  value: z.string(),
  showText: z.boolean().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
});

export const QrCodeElementSchema = BaseElementSchema.extend({
  type: z.literal('qrcode'),
  field: z.string().optional(),
  value: z.string(),
  qrLibraryId: z.string().optional(),
});

export const LineElementSchema = BaseElementSchema.extend({
  type: z.literal('line'),
  strokeWidth: z.number().positive(),
  color: z.string().optional(),
  dash: z.array(z.number()).optional(),
});

export const RectangleElementSchema = BaseElementSchema.extend({
  type: z.literal('rectangle'),
  strokeWidth: z.number().nonnegative(),
  strokeColor: z.string().optional(),
  fillColor: z.string().optional(),
  cornerRadius: z.number().nonnegative().optional(),
});

export const ImageElementSchema = BaseElementSchema.extend({
  type: z.literal('image'),
  src: z.string(),
  fit: z.enum(['contain', 'cover', 'fill']).optional(),
});

export const LabelElementSchema = z.discriminatedUnion('type', [
  TextElementSchema,
  PriceElementSchema,
  BarcodeElementSchema,
  QrCodeElementSchema,
  LineElementSchema,
  RectangleElementSchema,
  ImageElementSchema,
]);

export const LabelDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  title: z.string(),
  dimensions: LabelDimensionsSchema,
  elements: z.array(LabelElementSchema),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
