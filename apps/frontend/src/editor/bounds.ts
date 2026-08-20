import type { LabelElement } from '@witiquetas/label-schema';

export const SAFE_AREA_MARGIN_MM = 1.0;

export interface BoundingBoxMm {
  x: number;
  y: number;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface BoundsViolation {
  isOutOfBounds: boolean;
  elementId: string;
  elementName: string;
  overflowLeftMm: number;
  overflowTopMm: number;
  overflowRightMm: number;
  overflowBottomMm: number;
  message?: string;
}

export interface NormalizeGeometryContext {
  dpi?: number;
  safeAreaMarginMm?: number;
}

/**
 * Normaliza um ângulo em graus para o intervalo [0, 360)
 */
export function normalizeRotation(angle: number = 0): number {
  let normalized = Math.round(Number(angle) || 0) % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

/**
 * Aplica atração magnética (Magnetic Snap) exclusivamente nos ângulos cardinais:
 * 0°, 90°, 180° e 270°.
 *
 * Tolerância configurada:
 * - 0° / 360°: [357°, 360°] U [0°, 4°] -> 0°
 * - 90°: [87°, 94°] -> 90° (86° não snap, 87..94 snap, 95° não snap)
 * - 180°: [177°, 184°] -> 180°
 * - 270°: [267°, 274°] -> 270°
 */
export function applyMagneticRotationSnap(rawAngle: number): {
  angle: number;
  isSnapped: boolean;
  snapTarget?: number;
} {
  const normalized = normalizeRotation(rawAngle);

  if (normalized >= 87 && normalized <= 94) {
    return { angle: 90, isSnapped: true, snapTarget: 90 };
  }
  if (normalized >= 177 && normalized <= 184) {
    return { angle: 180, isSnapped: true, snapTarget: 180 };
  }
  if (normalized >= 267 && normalized <= 274) {
    return { angle: 270, isSnapped: true, snapTarget: 270 };
  }
  if (normalized <= 4 || normalized >= 357) {
    return { angle: 0, isSnapped: true, snapTarget: 0 };
  }

  return { angle: normalized, isSnapped: false };
}

/**
 * Calcula o Bounding Box exato (AABB) de um elemento considerando qualquer rotação (0° a 360°)
 */
export function getElementBoundingBox(element: LabelElement): BoundingBoxMm {
  const rotation = normalizeRotation(element.rotation || 0);
  const w = Math.max(0.1, Number(element.width) || 1);
  const h = Math.max(0.1, Number(element.height) || 1);
  const x = Number(element.x) || 0;
  const y = Number(element.y) || 0;

  // Otimização para os ângulos cardinais ortogonais
  if (rotation === 0) {
    return {
      x,
      y,
      width: w,
      height: h,
      minX: x,
      maxX: x + w,
      minY: y,
      maxY: y + h,
    };
  }

  if (rotation === 90) {
    const minX = x - h;
    const maxX = x;
    const minY = y;
    const maxY = y + w;
    return {
      x: minX,
      y: minY,
      width: h,
      height: w,
      minX,
      maxX,
      minY,
      maxY,
    };
  }

  if (rotation === 180) {
    const minX = x - w;
    const maxX = x;
    const minY = y - h;
    const maxY = y;
    return {
      x: minX,
      y: minY,
      width: w,
      height: h,
      minX,
      maxX,
      minY,
      maxY,
    };
  }

  if (rotation === 270) {
    const minX = x;
    const maxX = x + h;
    const minY = y - w;
    const maxY = y;
    return {
      x: minX,
      y: minY,
      width: h,
      height: w,
      minX,
      maxX,
      minY,
      maxY,
    };
  }

  // Ângulos genéricos: cálculo trigonométrico exato dos 4 vértices
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const dx0 = 0;
  const dy0 = 0;
  const dx1 = w * cos;
  const dy1 = w * sin;
  const dx2 = w * cos - h * sin;
  const dy2 = w * sin + h * cos;
  const dx3 = -h * sin;
  const dy3 = h * cos;

  const minDx = Math.min(dx0, dx1, dx2, dx3);
  const maxDx = Math.max(dx0, dx1, dx2, dx3);
  const minDy = Math.min(dy0, dy1, dy2, dy3);
  const maxDy = Math.max(dy0, dy1, dy2, dy3);

  const minX = parseFloat((x + minDx).toFixed(2));
  const maxX = parseFloat((x + maxDx).toFixed(2));
  const minY = parseFloat((y + minDy).toFixed(2));
  const maxY = parseFloat((y + maxDy).toFixed(2));
  const bboxW = parseFloat((maxDx - minDx).toFixed(2));
  const bboxH = parseFloat((maxDy - minDy).toFixed(2));

  return {
    x: minX,
    y: minY,
    width: bboxW,
    height: bboxH,
    minX,
    maxX,
    minY,
    maxY,
  };
}

/**
 * Verifica se um elemento está 100% contido dentro da mídia física da etiqueta
 */
export function isElementInsideMedia(
  element: LabelElement,
  dimensions: { widthMm: number; heightMm: number },
  toleranceMm: number = 0.05
): boolean {
  const bbox = getElementBoundingBox(element);
  const maxW = dimensions.widthMm;
  const maxH = dimensions.heightMm;

  return (
    bbox.minX >= -toleranceMm &&
    bbox.minY >= -toleranceMm &&
    bbox.maxX <= maxW + toleranceMm &&
    bbox.maxY <= maxH + toleranceMm
  );
}

/**
 * Limita e ajusta um elemento estritamente aos limites físicos da etiqueta
 * durante criação, drag, resize, rotação ou edição numérica.
 */
export function clampElementToMedia<T extends LabelElement>(
  element: T,
  dimensions: { widthMm: number; heightMm: number }
): T {
  const maxW = Math.max(1, Number(dimensions.widthMm) || 100);
  const maxH = Math.max(1, Number(dimensions.heightMm) || 30);

  let width = Math.max(0.5, Number(element.width) || 1);
  let height = Math.max(0.5, Number(element.height) || 1);
  let rotation = normalizeRotation(element.rotation || 0);

  // 1. Regras específicas por tipo de elemento
  if (element.type === 'qrcode') {
    const size = Math.max(5, Math.min(width, height, maxW, maxH));
    width = size;
    height = size;
  } else if (element.type === 'barcode') {
    width = Math.max(10, Math.min(width, maxW));
    height = Math.max(3, Math.min(height, maxH));
  } else if (element.type === 'line') {
    width = Math.max(1, Math.min(width, maxW));
    height = Math.max(0.2, height);
  } else {
    width = Math.max(1, Math.min(width, maxW));
    height = Math.max(2, Math.min(height, maxH));
  }

  // 2. Verificar se o tamanho do elemento rotacionado excede a mídia
  if (rotation === 90 || rotation === 270) {
    if (height > maxW) height = maxW;
    if (width > maxH) width = maxH;
  } else if (rotation === 0 || rotation === 180) {
    if (width > maxW) width = maxW;
    if (height > maxH) height = maxH;
  }

  // 3. Obter deltas de rotação em relação à origem (x, y)
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const dx0 = 0;
  const dy0 = 0;
  const dx1 = width * cos;
  const dy1 = width * sin;
  const dx2 = width * cos - height * sin;
  const dy2 = width * sin + height * cos;
  const dx3 = -height * sin;
  const dy3 = height * cos;

  const minDx = Math.min(dx0, dx1, dx2, dx3);
  const maxDx = Math.max(dx0, dx1, dx2, dx3);
  const minDy = Math.min(dy0, dy1, dy2, dy3);
  const maxDy = Math.max(dy0, dy1, dy2, dy3);

  const minAllowedX = -minDx;
  const maxAllowedX = maxW - maxDx;
  const minAllowedY = -minDy;
  const maxAllowedY = maxH - maxDy;

  let currentX = Number(element.x) || 0;
  let currentY = Number(element.y) || 0;

  let clampedX = Math.max(minAllowedX, Math.min(currentX, maxAllowedX));
  let clampedY = Math.max(minAllowedY, Math.min(currentY, maxAllowedY));

  if (minAllowedX > maxAllowedX) clampedX = minAllowedX;
  if (minAllowedY > maxAllowedY) clampedY = minAllowedY;

  return {
    ...element,
    x: parseFloat(clampedX.toFixed(3)),
    y: parseFloat(clampedY.toFixed(3)),
    width: parseFloat(width.toFixed(3)),
    height: parseFloat(height.toFixed(3)),
    rotation,
  };
}

/**
 * Funçao canônica única de normalização de geometria.
 * Aplica atração magnética de rotação, quantização cardinal em dot-grid (quando ortogonal)
 * e clamping físico aos limites da mídia.
 */
export function normalizeElementGeometry<T extends LabelElement>(
  element: T,
  dimensions: { widthMm: number; heightMm: number },
  context: NormalizeGeometryContext = {}
): T {
  const dpi = context.dpi || 203;

  // 1. Rotação Magnética (0°, 90°, 180°, 270°)
  let rotation = normalizeRotation(element.rotation || 0);
  const snapResult = applyMagneticRotationSnap(rotation);
  rotation = snapResult.angle;

  let elem = { ...element, rotation };

  // 2. Quantização Cardinal em Dot Grid (apenas para ângulos cardinais ortogonais)
  const isCardinal = rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270;
  if (isCardinal) {
    const mmToDot = (mm: number) => Math.round((mm * dpi) / 25.4);
    const dotToMm = (dot: number) => parseFloat(((dot * 25.4) / dpi).toFixed(3));

    elem.x = dotToMm(mmToDot(Number(elem.x) || 0));
    elem.y = dotToMm(mmToDot(Number(elem.y) || 0));
    elem.width = dotToMm(mmToDot(Number(elem.width) || 1));
    elem.height = dotToMm(mmToDot(Number(elem.height) || 1));
  }

  // 3. Clamping físico rigoroso à mídia
  return clampElementToMedia(elem, dimensions);
}

/**
 * Alias mantido para compatibilidade retroativa
 */
export const constrainElementToLabel = normalizeElementGeometry;

/**
 * Move um grupo de elementos mantendo a distância relativa exata entre eles,
 * parando o grupo inteiro ao atingir qualquer borda física da etiqueta.
 */
export function constrainGroupMovement(
  elements: LabelElement[],
  dxMm: number,
  dyMm: number,
  dimensions: { widthMm: number; heightMm: number }
): { dxMm: number; dyMm: number } {
  if (elements.length === 0) return { dxMm: 0, dyMm: 0 };

  const bboxes = elements.map(getElementBoundingBox);
  const minX = Math.min(...bboxes.map((b) => b.minX));
  const minY = Math.min(...bboxes.map((b) => b.minY));
  const maxX = Math.max(...bboxes.map((b) => b.maxX));
  const maxY = Math.max(...bboxes.map((b) => b.maxY));

  const maxW = dimensions.widthMm;
  const maxH = dimensions.heightMm;

  let allowedDx = dxMm;
  if (minX + allowedDx < 0) {
    allowedDx = -minX;
  } else if (maxX + allowedDx > maxW) {
    allowedDx = maxW - maxX;
  }

  let allowedDy = dyMm;
  if (minY + allowedDy < 0) {
    allowedDy = -minY;
  } else if (maxY + allowedDy > maxH) {
    allowedDy = maxH - maxY;
  }

  return {
    dxMm: parseFloat(allowedDx.toFixed(3)),
    dyMm: parseFloat(allowedDy.toFixed(3)),
  };
}

/**
 * Valida se um elemento ultrapassa os limites físicos ou a margem segura da etiqueta.
 */
export function validateElementBounds(
  element: LabelElement,
  dimensions: { widthMm: number; heightMm: number },
  safeMarginMm: number = SAFE_AREA_MARGIN_MM
): BoundsViolation {
  const bbox = getElementBoundingBox(element);
  const maxW = dimensions.widthMm;
  const maxH = dimensions.heightMm;

  const overflowLeftMm = bbox.minX < 0 ? parseFloat(Math.abs(bbox.minX).toFixed(2)) : 0;
  const overflowTopMm = bbox.minY < 0 ? parseFloat(Math.abs(bbox.minY).toFixed(2)) : 0;
  const overflowRightMm = bbox.maxX > maxW ? parseFloat((bbox.maxX - maxW).toFixed(2)) : 0;
  const overflowBottomMm = bbox.maxY > maxH ? parseFloat((bbox.maxY - maxH).toFixed(2)) : 0;

  const isOutOfBounds = overflowLeftMm > 0 || overflowTopMm > 0 || overflowRightMm > 0 || overflowBottomMm > 0;
  const name = element.name || (element as any).text || (element as any).field || element.id;

  let message = '';
  if (overflowRightMm > 0) {
    const formatted = overflowRightMm.toString().replace('.', ',');
    message = `"${name}" ultrapassa a borda direita em ${formatted} mm.`;
  } else if (overflowBottomMm > 0) {
    const formatted = overflowBottomMm.toString().replace('.', ',');
    message = `"${name}" ultrapassa a borda inferior em ${formatted} mm.`;
  } else if (overflowLeftMm > 0) {
    const formatted = overflowLeftMm.toString().replace('.', ',');
    message = `"${name}" ultrapassa a borda esquerda em ${formatted} mm.`;
  } else if (overflowTopMm > 0) {
    const formatted = overflowTopMm.toString().replace('.', ',');
    message = `"${name}" ultrapassa a borda superior em ${formatted} mm.`;
  }

  return {
    isOutOfBounds,
    elementId: element.id,
    elementName: name,
    overflowLeftMm,
    overflowTopMm,
    overflowRightMm,
    overflowBottomMm,
    message: isOutOfBounds ? message : undefined,
  };
}

/**
 * Valida todos os elementos de um documento e retorna a lista de violações
 */
export function validateDocumentBounds(
  document: { elements: LabelElement[]; dimensions: { widthMm: number; heightMm: number } }
): BoundsViolation[] {
  return document.elements
    .filter((el) => el.visible !== false)
    .map((el) => validateElementBounds(el, document.dimensions, SAFE_AREA_MARGIN_MM))
    .filter((v) => v.isOutOfBounds);
}
