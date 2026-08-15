import {
  LabelElement,
  VisibilityRule,
  FieldTransformation,
  ElementSourceReference,
} from '@witiquetas/label-schema';

export type ASTNodeType =
  | 'comment'
  | 'config'
  | 'conditional'
  | 'visual'
  | 'quantity'
  | 'raw';

export interface BaseASTNode {
  id: string;
  type: ASTNodeType;
  line: number;
  originalText: string;
}

export interface CommentASTNode extends BaseASTNode {
  type: 'comment';
  commentText: string;
}

export interface ConfigASTNode extends BaseASTNode {
  type: 'config';
  command: string; // Ex: "I8,A,001", "Q240,024", "q831", "S4", "D7", "ZT", "JF", "OD", "R0,0", "f100", "N"
  category?: 'density' | 'dimensions' | 'speed' | 'direction' | 'clear' | 'generic';
  params?: Record<string, any>;
}

export interface VisualASTNode extends BaseASTNode {
  type: 'visual';
  commandType: 'A' | 'B' | 'L' | 'X' | 'W' | 'generic';
  element?: LabelElement;
  visibilityRule?: VisibilityRule;
  transformations?: FieldTransformation[];
  sourceRef: ElementSourceReference;
}

export interface ConditionalASTNode extends BaseASTNode {
  type: 'conditional';
  conditionExpression: string; // Ex: "[[PROMOCAO]]>0"
  rule: VisibilityRule;
  children: ASTNode[];
}

export interface QuantityASTNode extends BaseASTNode {
  type: 'quantity';
  quantityExpression: string; // Ex: "[[QUANTIDADE]]" ou "1"
}

export interface RawASTNode extends BaseASTNode {
  type: 'raw';
  recognized: boolean;
  notes?: string;
}

export type ASTNode =
  | CommentASTNode
  | ConfigASTNode
  | VisualASTNode
  | ConditionalASTNode
  | QuantityASTNode
  | RawASTNode;

export interface LabelAST {
  nodes: ASTNode[];
  detectedFormat: 'pplb' | 'zpl' | 'legacy-witiquetas' | 'unknown';
  dimensionsMm: {
    widthMm: number;
    heightMm: number;
    dpi: 203 | 300 | 600;
  };
  commentsCount: number;
  configCommandsCount: number;
  conditionalsCount: number;
  visualElementsCount: number;
  rawCount: number;
}
