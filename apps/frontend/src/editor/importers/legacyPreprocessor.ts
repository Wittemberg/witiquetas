import { VisibilityRule, FieldTransformation } from '@witiquetas/label-schema';
import {
  ASTNode,
  CommentASTNode,
  ConfigASTNode,
  ConditionalASTNode,
  QuantityASTNode,
  RawASTNode,
  VisualASTNode,
} from './astTypes';

/**
 * Mapeamento Canônico de Macros ERP para Campos canônicos do Witiquetas
 */
export const ERP_MACRO_MAP: Record<string, string> = {
  NOME: 'produto.descricao',
  MERCADORIA: 'produto.descricao',
  DESCRICAO: 'produto.descricao',
  BARRA: 'produto.ean',
  BARRAS: 'produto.ean',
  EAN: 'produto.ean',
  GTIN: 'produto.ean',
  PRECO: 'produto.preco',
  PRECO_NORMAL: 'produto.preco',
  PROMOCAO: 'produto.promocao.preco',
  PRECO_PROMOCAO: 'produto.promocao.preco',
  NOMEFILIAL: 'empresa.nomeFilial',
  FILIAL: 'empresa.nomeFilial',
  FATORBARRA: 'produto.fatorBarra',
  ULTIMA: 'produto.ultimaCompra',
  UC: 'produto.ultimaCompra',
  QUANTIDADE: 'job.quantidade',
  CODIGO: 'produto.codigoInterno',
  CODIGO_INTERNO: 'produto.codigoInterno',
};

export interface PreprocessedMacro {
  field: string;
  rawMacro: string;
  transformations?: FieldTransformation[];
}

/**
 * ETAPA A: Pré-processamento de Macros, Condicionais e Comentários do ERP
 */
export class LegacyPreprocessor {
  /**
   * Extrai e mapeia macros em um trecho de texto
   * Ex: "[[NOME,0,18]]" ➔ field: 'produto.descricao', substring: [0, 18]
   */
  static parseMacro(macroStr: string): PreprocessedMacro | null {
    const clean = macroStr.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
    const parts = clean.split(',').map((p) => p.trim());
    const macroName = parts[0].toUpperCase();

    const mappedField = ERP_MACRO_MAP[macroName] || `custom.${macroName.toLowerCase()}`;

    if (parts.length >= 3) {
      const start = parseInt(parts[1], 10);
      const length = parseInt(parts[2], 10);
      if (!isNaN(start) && !isNaN(length)) {
        return {
          field: mappedField,
          rawMacro: macroStr,
          transformations: [{ type: 'substring', start, length }],
        };
      }
    }

    return {
      field: mappedField,
      rawMacro: macroStr,
    };
  }

  /**
   * Interpreta condição de blocos [[SE]]{{condição}}{{corpo}}
   * Ex: "[[PROMOCAO]]>0" ➔ { field: 'produto.promocao.preco', operator: '>', value: '0' }
   */
  static parseCondition(conditionExpr: string): VisibilityRule {
    const clean = conditionExpr.trim();

    // Regex para operadores lógicos
    const match = clean.match(/^(?:\[\[([A-Z0-9_]+)\]\]|([A-Z0-9_]+))\s*(>=|<=|!=|<>|>|<|=)\s*(.+)$/i);
    if (match) {
      const rawField = (match[1] || match[2]).toUpperCase();
      const rawOp = match[3];
      const val = match[4].replace(/^["']|["']$/g, '').trim();

      let operator: any = rawOp;
      if (rawOp === '<>') operator = '!=';

      const field = ERP_MACRO_MAP[rawField] || `custom.${rawField.toLowerCase()}`;
      return { field, operator, value: val };
    }

    // Checagem de vazio / não vazio
    if (/não\s+vazio/i.test(clean) || /not\s+empty/i.test(clean)) {
      const fieldMatch = clean.match(/\[\[([A-Z0-9_]+)\]\]/i);
      const rawField = fieldMatch ? fieldMatch[1].toUpperCase() : 'PROMOCAO';
      return { field: ERP_MACRO_MAP[rawField] || `custom.${rawField.toLowerCase()}`, operator: 'not_empty', value: '' };
    }

    return {
      field: 'produto.promocao.preco',
      operator: '>',
      value: '0',
    };
  }

  /**
   * Pré-processa as linhas do arquivo em Nós da AST
   */
  static preprocessLines(content: string): ASTNode[] {
    const lines = content.split(/\r?\n/);
    const nodes: ASTNode[] = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        continue;
      }

      // 1. Comentários (// ou #)
      if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        const node: CommentASTNode = {
          id: `comment-${i}`,
          type: 'comment',
          line: i + 1,
          originalText: rawLine,
          commentText: trimmed.replace(/^(\/\/|#)\s*/, ''),
        };
        nodes.push(node);
        continue;
      }

      // 2. Quantidade de Impressão (ex: P[[QUANTIDADE]] ou P1)
      if (/^P(\[\[[A-Z0-9_]+\]\]|\d+)$/i.test(trimmed)) {
        const qMatch = trimmed.match(/^P(.+)$/i);
        const node: QuantityASTNode = {
          id: `qty-${i}`,
          type: 'quantity',
          line: i + 1,
          originalText: rawLine,
          quantityExpression: qMatch ? qMatch[1] : '1',
        };
        nodes.push(node);
        continue;
      }

      // 3. Blocos Condicionais [[SE]]{{condição}}{{comando}}
      const condMatch = trimmed.match(/^\[\[SE\]\]\{\{([^}]+)\}\}\{\{(.+)\}\}$/i);
      if (condMatch) {
        const condExpr = condMatch[1];
        const innerCmd = condMatch[2];
        const rule = this.parseCondition(condExpr);

        const node: ConditionalASTNode = {
          id: `cond-${i}`,
          type: 'conditional',
          line: i + 1,
          originalText: rawLine,
          conditionExpression: condExpr,
          rule,
          children: [],
        };

        // Cria nó interno temporário para o comando
        const innerNode: RawASTNode = {
          id: `inner-${i}`,
          type: 'raw',
          line: i + 1,
          originalText: innerCmd,
          recognized: false,
        };
        node.children.push(innerNode);
        nodes.push(node);
        continue;
      }

      // 4. Comandos de Configuração de Impressora (PPLB / Eltron / ZPL)
      // Ex: I8,A,001 | Q240,024 | q831 | rN | S4 | D7 | ZT | JF | OD | R0,0 | f100 | N | ^XA | ^XZ
      if (/^(I8|Q\d+|q\d+|r[N|Y]|S\d+|D\d+|ZT|JF|OD|R\d+,\d+|f\d+|N|\^XA|\^XZ|\^PW\d+|\^LL\d+)/i.test(trimmed) && !trimmed.startsWith('A') && !trimmed.startsWith('B') && !trimmed.startsWith('L') && !trimmed.startsWith('X')) {
        let category: any = 'generic';
        if (trimmed.startsWith('Q') || trimmed.startsWith('q') || trimmed.startsWith('^PW') || trimmed.startsWith('^LL')) category = 'dimensions';
        else if (trimmed.startsWith('I8')) category = 'density';
        else if (trimmed.startsWith('S') || trimmed.startsWith('D')) category = 'speed';
        else if (trimmed.toUpperCase() === 'N' || trimmed.toUpperCase() === '^XA' || trimmed.toUpperCase() === '^XZ') category = 'clear';

        const node: ConfigASTNode = {
          id: `cfg-${i}`,
          type: 'config',
          line: i + 1,
          originalText: rawLine,
          command: trimmed,
          category,
        };
        nodes.push(node);
        continue;
      }

      // 5. Nó genérico/raw (será processado na Etapa B pelo Parser de Linguagem de Impressora)
      nodes.push({
        id: `raw-${i}`,
        type: 'raw',
        line: i + 1,
        originalText: rawLine,
        recognized: false,
      });
    }

    return nodes;
  }
}
