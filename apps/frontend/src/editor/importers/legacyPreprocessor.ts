import type { VisibilityRule, FieldTransformation } from '@witiquetas/label-schema';
import type {
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
 * Inverte uma regra de visibilidade para geração da regra do ramo ELSE ([[SENAO]])
 */
export function invertVisibilityRule(rule: VisibilityRule): VisibilityRule {
  const opMap: Record<string, any> = {
    '=': '!=',
    '!=': '=',
    '>': '<=',
    '<=': '>',
    '<': '>=',
    '>=': '<',
    'empty': 'not_empty',
    'not_empty': 'empty',
  };
  return {
    field: rule.field,
    operator: opMap[rule.operator] || '!=',
    value: rule.value,
  };
}

interface ConditionalStackFrame {
  node: ConditionalASTNode;
  currentBranch: 'then' | 'else';
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
   * Interpreta condição de blocos [[SE]]{{condição}}{{corpo}} ou [[SE]]{{condição}}
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

    // Variável única (ex: {{frente}} ou {{precoAtacadista}} ou {{cd_regraPrecos}})
    const singleVarMatch = clean.match(/^(?:\[\[([A-Z0-9_]+)\]\]|([A-Z0-9_]+))$/i);
    if (singleVarMatch) {
      const rawField = (singleVarMatch[1] || singleVarMatch[2]).toUpperCase();
      const field = ERP_MACRO_MAP[rawField] || `custom.${rawField.toLowerCase()}`;
      return {
        field,
        operator: 'not_empty',
        value: '',
      };
    }

    return {
      field: 'produto.promocao.preco',
      operator: '>',
      value: '0',
    };
  }

  /**
   * Pré-processa as linhas do arquivo em Nós da AST com suporte completo a condicionais inline e multilinha
   */
  static preprocessLines(content: string): ASTNode[] {
    const lines = content.split(/\r?\n/);
    const nodes: ASTNode[] = [];
    const stack: ConditionalStackFrame[] = [];
    const MAX_DEPTH = 5; // Limite defensivo de aninhamento

    const appendNode = (node: ASTNode) => {
      if (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.currentBranch === 'then') {
          top.node.thenNodes = top.node.thenNodes || [];
          top.node.thenNodes.push(node);
        } else {
          top.node.elseNodes = top.node.elseNodes || [];
          top.node.elseNodes.push(node);
        }
      } else {
        nodes.push(node);
      }
    };

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
        appendNode(node);
        continue;
      }

      // 2. Condicionais Inline e Encadeadas: [[SE]]{{cond1}}[[SE]]{{cond2}}{{cmd}} ou [[SE]]{{cond}}12110...
      const inlineCondMatch = trimmed.match(/^((?:\[\[SE\]\]\{\{[^}]+\}\})+)(.+)$/i);
      if (inlineCondMatch) {
        const condPart = inlineCondMatch[1];
        let innerCmd = inlineCondMatch[2].trim();
        if (innerCmd.startsWith('{{') && innerCmd.endsWith('}}')) {
          innerCmd = innerCmd.slice(2, -2).trim();
        }

        const condMatches = Array.from(condPart.matchAll(/\[\[SE\]\]\{\{([^}]+)\}\}/gi));
        const rules = condMatches.map((m) => this.parseCondition(m[1]));

        const innerNode: RawASTNode = {
          id: `inner-${i}`,
          type: 'raw',
          line: i + 1,
          originalText: innerCmd,
          recognized: false,
        };

        // Construir nós condicionais aninhados se houver encadeamento
        let currentInnermost: ASTNode = innerNode;
        for (let rIdx = rules.length - 1; rIdx >= 0; rIdx--) {
          const rule = rules[rIdx];
          const condExpr = condMatches[rIdx][1];
          const condNode: ConditionalASTNode = {
            id: `cond-${i}-${rIdx}`,
            type: 'conditional',
            line: i + 1,
            originalText: rIdx === 0 ? rawLine : currentInnermost.originalText,
            conditionExpression: condExpr,
            rule,
            thenNodes: [currentInnermost],
            elseNodes: [],
            children: [currentInnermost],
            isMultiline: false,
            rawOpenCommand: rawLine,
            startLine: i + 1,
            endLine: i + 1,
          };
          currentInnermost = condNode;
        }

        appendNode(currentInnermost);
        continue;
      }

      // 3. Início de Condicional Multilinha: [[SE]]{{condição}}
      const multilineOpenMatch = trimmed.match(/^\[\[SE\]\]\s*\{\{([^}]+)\}\}$/i);
      if (multilineOpenMatch) {
        if (stack.length >= MAX_DEPTH) {
          appendNode({
            id: `raw-${i}`,
            type: 'raw',
            line: i + 1,
            originalText: rawLine,
            recognized: false,
            notes: `Limite máximo de aninhamento (${MAX_DEPTH}) excedido`,
          });
          continue;
        }

        const condExpr = multilineOpenMatch[1];
        const rule = this.parseCondition(condExpr);

        const condNode: ConditionalASTNode = {
          id: `cond-${i}`,
          type: 'conditional',
          line: i + 1,
          originalText: rawLine,
          conditionExpression: condExpr,
          rule,
          thenNodes: [],
          elseNodes: [],
          children: [],
          isMultiline: true,
          rawOpenCommand: rawLine,
          startLine: i + 1,
          endLine: i + 1,
        };

        stack.push({ node: condNode, currentBranch: 'then' });
        continue;
      }

      // 4. Ramo Alternativo: [[SENAO]] ou [[ELSE]]
      if (/^\[\[(SENAO|ELSE)\]\]$/i.test(trimmed)) {
        if (stack.length > 0) {
          const top = stack[stack.length - 1];
          top.currentBranch = 'else';
          top.node.rawElseCommand = rawLine;
        } else {
          // SENAO órfão (sem SE anterior)
          appendNode({
            id: `raw-${i}`,
            type: 'raw',
            line: i + 1,
            originalText: rawLine,
            recognized: false,
            notes: 'Orphaned [[SENAO]] without matching [[SE]]',
          });
        }
        continue;
      }

      // 5. Fechamento de Condicional Multilinha: [[FIMSE]], [[ENDIF]], [[FIM_SE]]
      if (/^\[\[(FIMSE|FIM_SE|ENDIF)\]\]$/i.test(trimmed)) {
        if (stack.length > 0) {
          const popped = stack.pop()!;
          popped.node.rawCloseCommand = rawLine;
          popped.node.endLine = i + 1;
          popped.node.children = [...popped.node.thenNodes, ...(popped.node.elseNodes || [])];
          appendNode(popped.node);
        } else {
          // FIMSE órfão (sem SE anterior)
          appendNode({
            id: `raw-${i}`,
            type: 'raw',
            line: i + 1,
            originalText: rawLine,
            recognized: false,
            notes: 'Orphaned [[FIMSE]] without matching [[SE]]',
          });
        }
        continue;
      }

      // 6. Quantidade de Impressão (ex: P[[QUANTIDADE]] ou P1)
      if (/^P(\[\[[A-Z0-9_]+\]\]|\d+)$/i.test(trimmed)) {
        const qMatch = trimmed.match(/^P(.+)$/i);
        const node: QuantityASTNode = {
          id: `qty-${i}`,
          type: 'quantity',
          line: i + 1,
          originalText: rawLine,
          quantityExpression: qMatch ? qMatch[1] : '1',
        };
        appendNode(node);
        continue;
      }

      // 7. Comandos de Configuração de Impressora (PPLB / Eltron / ZPL)
      if (
        /^(I8|Q\d+|q\d+|r[N|Y]|S\d+|D\d+|ZT|JF|OD|R\d+,\d+|f\d+|N|\^XA|\^XZ|\^PW\d+|\^LL\d+)/i.test(trimmed) &&
        !trimmed.startsWith('A') &&
        !trimmed.startsWith('B') &&
        !trimmed.startsWith('L') &&
        !trimmed.startsWith('X')
      ) {
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
        appendNode(node);
        continue;
      }

      // 8. Nó genérico / comando visual
      appendNode({
        id: `raw-${i}`,
        type: 'raw',
        line: i + 1,
        originalText: rawLine,
        recognized: false,
      });
    }

    // Fechamento defensivo de blocos não fechados no final do arquivo
    while (stack.length > 0) {
      const unclosed = stack.pop()!;
      unclosed.node.endLine = lines.length;
      unclosed.node.children = [...unclosed.node.thenNodes, ...(unclosed.node.elseNodes || [])];
      appendNode(unclosed.node);
    }

    return nodes;
  }
}
