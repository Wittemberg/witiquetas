import type { LabelElement } from '@witiquetas/label-schema';

export interface BoundingBoxMm {
  x: number;
  y: number;
  width: number;
  height: number;
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

/**
 * Calcula o Bounding Box de um elemento considerando sua rotação
 */
export function getElementBoundingBox(element: LabelElement): BoundingBoxMm {
  const rotation = Number(element.rotation || 0) % 360;
  const normalizedRotation = rotation < 0 ? rotation + 360 : rotation;

  const w = Math.max(0.1, Number(element.width) || 1);
  const h = Math.max(0.1, Number(element.height) || 1);
  const x = Number(element.x) || 0;
  const y = Number(element.y) || 0;

  if (normalizedRotation === 90 || normalizedRotation === 270) {
    return {
      x,
      y,
      width: h,
      height: w,
    };
  }

  if (normalizedRotation !== 0 && normalizedRotation !== 180) {
    const rad = (normalizedRotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    return {
      x,
      y,
      width: parseFloat((w * cos + h * sin).toFixed(2)),
      height: parseFloat((w * sin + h * cos).toFixed(2)),
    };
  }

  return {
    x,
    y,
    width: w,
    height: h,
  };
}

/**
 * Limita um elemento estritamente aos limites físicos da etiqueta
 */
export function constrainElementToLabel<T extends LabelElement>(
  element: T,
  dimensions: { widthMm: number; heightMm: number }
): T {
  const maxW = Math.max(1, dimensions.widthMm);
  const maxH = Math.max(1, dimensions.heightMm);

  let width = Math.max(0.5, Number(element.width) || 1);
  let height = Math.max(0.5, Number(element.height) || 1);

  // 1. Regras específicas por tipo de elemento
  if (element.type === 'qrcode') {
    // QR Code sempre quadrado 1:1
    const size = Math.max(5, Math.min(Math.min(width, height), maxW, maxH));
    width = size;
    height = size;
  } else if (element.type === 'barcode') {
    // Código de barras: largura mínima e altura mínima para legibilidade
    width = Math.max(10, Math.min(width, maxW));
    height = Math.max(3, Math.min(height, maxH));
  } else if (element.type === 'line') {
    width = Math.max(1, Math.min(width, maxW));
    height = Math.max(0.5, height);
  } else {
    width = Math.max(2, Math.min(width, maxW));
    height = Math.max(2, Math.min(height, maxH));
  }

  // 2. Considerar bounding box com rotação
  const rotation = Number(element.rotation || 0) % 360;
  const isPerpendicular = rotation === 90 || rotation === 270;
  const bboxW = isPerpendicular ? height : width;
  const bboxH = isPerpendicular ? width : height;

  // 3. Clamping de coordenadas (x, y >= 0 e x + bboxW <= maxW, y + bboxH <= maxH)
  const x = Math.max(0, Math.min(Number(element.x) || 0, parseFloat((maxW - bboxW).toFixed(2))));
  const y = Math.max(0, Math.min(Number(element.y) || 0, parseFloat((maxH - bboxH).toFixed(2))));

  return {
    ...element,
    x: parseFloat(x.toFixed(2)),
    y: parseFloat(y.toFixed(2)),
    width: parseFloat(width.toFixed(2)),
    height: parseFloat(height.toFixed(2)),
  };
}

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
  const minX = Math.min(...bboxes.map((b) => b.x));
  const minY = Math.min(...bboxes.map((b) => b.y));
  const maxX = Math.max(...bboxes.map((b) => b.x + b.width));
  const maxY = Math.max(...bboxes.map((b) => b.y + b.height));

  const maxW = dimensions.widthMm;
  const maxH = dimensions.heightMm;

  // Clampar dx
  let allowedDx = dxMm;
  if (minX + allowedDx < 0) {
    allowedDx = -minX;
  } else if (maxX + allowedDx > maxW) {
    allowedDx = maxW - maxX;
  }

  // Clampar dy
  let allowedDy = dyMm;
  if (minY + allowedDy < 0) {
    allowedDy = -minY;
  } else if (maxY + allowedDy > maxH) {
    allowedDy = maxH - maxY;
  }

  return {
    dxMm: parseFloat(allowedDx.toFixed(2)),
    dyMm: parseFloat(allowedDy.toFixed(2)),
  };
}

/**
 * Valida se um elemento ultrapassa os limites físicos da etiqueta
 * (útil para auditoria de arquivos legados importados sem destruição silenciosa).
 */
export function validateElementBounds(
  element: LabelElement,
  dimensions: { widthMm: number; heightMm: number }
): BoundsViolation {
  const bbox = getElementBoundingBox(element);
  const maxW = dimensions.widthMm;
  const maxH = dimensions.heightMm;

  const overflowLeftMm = bbox.x < 0 ? parseFloat(Math.abs(bbox.x).toFixed(2)) : 0;
  const overflowTopMm = bbox.y < 0 ? parseFloat(Math.abs(bbox.y).toFixed(2)) : 0;
  const overflowRightMm = bbox.x + bbox.width > maxW ? parseFloat((bbox.x + bbox.width - maxW).toFixed(2)) : 0;
  const overflowBottomMm = bbox.y + bbox.height > maxH ? parseFloat((bbox.y + bbox.height - maxH).toFixed(2)) : 0;

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
    .map((el) => validateElementBounds(el, document.dimensions))
    .filter((v) => v.isOutOfBounds);
}
