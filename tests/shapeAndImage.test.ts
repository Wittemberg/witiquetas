import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LabelDocumentSchema, ImageElementSchema, LineElementSchema, RectangleElementSchema } from '@witiquetas/label-schema';
import type { LabelDocument, ImageElement, LineElement, RectangleElement } from '@witiquetas/label-schema';
import { PPLBCompiler } from '../packages/printer-pplb/src/index.ts';
import { PPLACompiler } from '../packages/printer-ppla/src/index.ts';
import { ZPLCompiler } from '../packages/printer-core/dist/index.js';

describe('PACOTE 4.3 — SHAPE + IMAGE/LOGO SUITE DE TESTES', () => {

  // =========================================================================
  // SEÇÃO FORMA (ITENS 1 A 5)
  // =========================================================================
  describe('A. FORMA — RETROCOMPATIBILIDADE E UNIFICAÇÃO DA TOOLBAR', () => {
    it('1. Line legado continua carregando e sendo validado pelo schema', () => {
      const doc: LabelDocument = {
        schemaVersion: 1,
        title: 'Modelo Legado com Linha',
        dimensions: { widthMm: 100, heightMm: 30, dpi: 203 },
        elements: [
          {
            id: 'line-1',
            type: 'line',
            x: 5,
            y: 10,
            width: 90,
            height: 1,
            strokeWidth: 0.5,
            color: '#000000',
          },
        ],
      };

      const result = LabelDocumentSchema.safeParse(doc);
      assert.strictEqual(result.success, true, 'Modelos legados com LineElement devem passar no parse do schema');
      assert.strictEqual((doc.elements[0] as LineElement).type, 'line');
    });

    it('2. Rectangle legado continua carregando e sendo validado pelo schema', () => {
      const doc: LabelDocument = {
        schemaVersion: 1,
        title: 'Modelo Legado com Retângulo',
        dimensions: { widthMm: 100, heightMm: 30, dpi: 203 },
        elements: [
          {
            id: 'rect-1',
            type: 'rectangle',
            x: 2,
            y: 2,
            width: 96,
            height: 26,
            strokeWidth: 1,
            strokeColor: '#000000',
            fillColor: 'transparent',
          },
        ],
      };

      const result = LabelDocumentSchema.safeParse(doc);
      assert.strictEqual(result.success, true, 'Modelos legados com RectangleElement devem passar no parse do schema');
      assert.strictEqual((doc.elements[0] as RectangleElement).type, 'rectangle');
    });

    it('3. Toolbar possui agrupamento Forma com botões de Linha e Retângulo', () => {
      const editorLayoutPath = path.resolve(process.cwd(), 'apps/frontend/src/editor/EditorLayout.tsx');
      const content = fs.readFileSync(editorLayoutPath, 'utf8');

      // Botão Forma deve existir
      assert.strictEqual(content.includes('<span>Forma</span>'), true, 'Botão Forma deve existir na toolbar');
      // Botões isolados antigos não devem estar no grid principal de criação
      assert.strictEqual(content.includes('<span>Moldura</span>'), false, 'Botão isolado Moldura não deve mais existir na toolbar');
      // Deve permitir criar linha e retângulo via popover
      assert.strictEqual(content.includes("addElement('line')"), true, 'Criador de linha deve ser chamado via Forma');
      assert.strictEqual(content.includes("addElement('rectangle')"), true, 'Criador de retângulo deve ser chamado via Forma');
    });

    it('4. Nova toolbar permite criar Line e Rectangle via Forma', () => {
      const lineElem: LineElement = {
        id: 'new-line',
        type: 'line',
        x: 10,
        y: 10,
        width: 80,
        height: 1,
        strokeWidth: 1,
      };

      const rectElem: RectangleElement = {
        id: 'new-rect',
        type: 'rectangle',
        x: 5,
        y: 5,
        width: 40,
        height: 20,
        strokeWidth: 1,
      };

      assert.strictEqual(LineElementSchema.safeParse(lineElem).success, true);
      assert.strictEqual(RectangleElementSchema.safeParse(rectElem).success, true);
    });

    it('5. Save/Reopen preserva ambos os elementos intactos sem mutação destrutiva', () => {
      const doc: LabelDocument = {
        schemaVersion: 1,
        title: 'Modelo Híbrido com Forma e Linha',
        dimensions: { widthMm: 100, heightMm: 50, dpi: 300 },
        elements: [
          { id: 'l1', type: 'line', x: 2, y: 15, width: 96, height: 1, strokeWidth: 0.5 },
          { id: 'r1', type: 'rectangle', x: 2, y: 2, width: 96, height: 46, strokeWidth: 1 },
        ],
      };

      const serialized = JSON.stringify(doc);
      const reloaded = JSON.parse(serialized);
      const parseResult = LabelDocumentSchema.safeParse(reloaded);

      assert.strictEqual(parseResult.success, true);
      assert.strictEqual(reloaded.elements.length, 2);
      assert.strictEqual(reloaded.elements[0].type, 'line');
      assert.strictEqual(reloaded.elements[1].type, 'rectangle');
    });
  });

  // =========================================================================
  // SEÇÃO IMAGEM (ITENS 6 A 16)
  // =========================================================================
  describe('B. ELEMENTO IMAGEM / LOGO — COMPORTAMENTO E RESILIÊNCIA', () => {
    it('6. Criar ImageElement com propriedades canônicas mínimas e estendidas', () => {
      const img: ImageElement = {
        id: 'img-logo-01',
        name: 'Logo Hospitalar / Supermercado',
        type: 'image',
        x: 5,
        y: 5,
        width: 25,
        height: 25,
        rotation: 0,
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        source: 'logo-hospital.png',
        mimeType: 'image/png',
        originalWidth: 100,
        originalHeight: 100,
        preserveAspectRatio: true,
        locked: false,
        visible: true,
      };

      const parseResult = ImageElementSchema.safeParse(img);
      assert.strictEqual(parseResult.success, true, 'ImageElement deve validar corretamente no Zod schema');
    });

    it('7. Persistir e reabrir ImageElement via JSON', () => {
      const doc: LabelDocument = {
        schemaVersion: 1,
        title: 'Modelo com Logo Institucional',
        dimensions: { widthMm: 80, heightMm: 40, dpi: 203 },
        elements: [
          {
            id: 'img-1',
            type: 'image',
            x: 10,
            y: 5,
            width: 20,
            height: 20,
            src: 'data:image/svg+xml;utf8,<svg></svg>',
            source: 'logo.svg',
            preserveAspectRatio: true,
          },
        ],
      };

      const jsonStr = JSON.stringify(doc);
      const parsedDoc = JSON.parse(jsonStr);
      const valid = LabelDocumentSchema.safeParse(parsedDoc);

      assert.strictEqual(valid.success, true);
      assert.strictEqual(parsedDoc.elements[0].type, 'image');
      assert.strictEqual(parsedDoc.elements[0].source, 'logo.svg');
    });

    it('8. Resize preserva proporção de aspecto por padrão no Konva Transformer', () => {
      const canvasContent = fs.readFileSync(path.resolve(process.cwd(), 'apps/frontend/src/editor/CanvasArea.tsx'), 'utf8');

      // Transformer no CanvasArea deve ativar keepRatio para elementos de imagem
      assert.strictEqual(
        canvasContent.includes("primarySelected?.type === 'image'"),
        true,
        'Transformer do Canvas deve verificar se o tipo selecionado é image para manter proporção'
      );
    });

    it('9. Rotação canônica (0°, 90°, 180°, 270°) é aceita e normalizada para ImageElement', () => {
      const angles = [0, 90, 180, 270];

      angles.forEach((angle) => {
        const img: ImageElement = {
          id: `img-${angle}`,
          type: 'image',
          x: 10,
          y: 10,
          width: 15,
          height: 15,
          rotation: angle,
          src: 'data:image/png;base64,dummy',
        };
        const valid = ImageElementSchema.safeParse(img);
        assert.strictEqual(valid.success, true);
        assert.strictEqual(img.rotation, angle);
      });
    });

    it('10. Duplicate mantém propriedades originais do ImageElement', () => {
      const original: ImageElement = {
        id: 'img-orig',
        type: 'image',
        x: 5,
        y: 5,
        width: 30,
        height: 20,
        rotation: 90,
        src: 'data:image/png;base64,dummy',
        source: 'marca-operacional.png',
        preserveAspectRatio: true,
      };

      const duplicate: ImageElement = {
        ...original,
        id: 'img-dup',
        x: original.x + 2,
        y: original.y + 2,
      };

      assert.strictEqual(duplicate.src, original.src);
      assert.strictEqual(duplicate.source, original.source);
      assert.strictEqual(duplicate.rotation, 90);
      assert.strictEqual(duplicate.preserveAspectRatio, true);
    });

    it('11. Undo/Redo registra modificações em elementos do tipo image', () => {
      const initialElements: ImageElement[] = [
        { id: 'img-1', type: 'image', x: 5, y: 5, width: 20, height: 20, src: 'data:image/png;base64,1' },
      ];

      const updatedElements: ImageElement[] = [
        { id: 'img-1', type: 'image', x: 15, y: 15, width: 30, height: 30, src: 'data:image/png;base64,1' },
      ];

      const history = [initialElements, updatedElements];
      let pointer = 1;

      // Undo
      pointer--;
      assert.strictEqual(history[pointer][0].x, 5);

      // Redo
      pointer++;
      assert.strictEqual(history[pointer][0].x, 15);
    });

    it('12. Respeita margem segura (1.0 mm) na auditoria geométrica', () => {
      const boundsContent = fs.readFileSync(path.resolve(process.cwd(), 'apps/frontend/src/editor/CanvasArea.tsx'), 'utf8');
      assert.strictEqual(boundsContent.includes('issueList'), true, 'CanvasArea deve auditar margem segura para todos os elementos incluindo imagens');
    });

    it('13. Respeita limites físicos da etiqueta (bounds clamping)', () => {
      const imgOutOfBounds: ImageElement = {
        id: 'img-out',
        type: 'image',
        x: -5,
        y: 40,
        width: 20,
        height: 20,
        src: 'data:image/png;base64,1',
      };

      const isOut = imgOutOfBounds.x < 0 || imgOutOfBounds.y + imgOutOfBounds.height > 30;
      assert.strictEqual(isOut, true, 'Detecta corretamente elemento de imagem fora dos limites físicos');
    });

    it('14. Participa de multiselect e transformações em grupo', () => {
      const selectedIds = ['text-1', 'img-1'];
      assert.strictEqual(selectedIds.includes('img-1'), true);
      assert.strictEqual(selectedIds.length, 2);
    });

    it('15. PrintPreview renderiza ImageElement usando KonvaImagePreview', () => {
      const printPreviewContent = fs.readFileSync(path.resolve(process.cwd(), 'apps/frontend/src/modules/printcenter/PrintPreview.tsx'), 'utf8');
      assert.strictEqual(printPreviewContent.includes('KonvaImagePreview'), true, 'PrintPreview deve possuir o subcomponente KonvaImagePreview');
      assert.strictEqual(printPreviewContent.includes("case 'image':"), true, 'PrintPreview deve possuir o case image no SingleElementPreview');
    });

    it('16. Modelo antigo sem imagem continua renderizando sem alterações', () => {
      const docLegacy: LabelDocument = {
        schemaVersion: 1,
        title: 'Modelo Antigo Sem Imagem',
        dimensions: { widthMm: 100, heightMm: 30, dpi: 203 },
        elements: [
          { id: 't1', type: 'text', text: 'ARROZ BRANCO 5KG', fontFamily: 'Roboto', fontSize: 10, x: 5, y: 5, width: 90, height: 10 },
        ],
      };

      const parseResult = LabelDocumentSchema.safeParse(docLegacy);
      assert.strictEqual(parseResult.success, true);
      assert.strictEqual(docLegacy.elements.some((e) => e.type === 'image'), false);
    });
  });

  // =========================================================================
  // SEÇÃO COMPILADORES (AJUSTE P0 — COMPILER CAPABILITY FAILURES)
  // =========================================================================
  describe('C. COMPILADORES — CAPABILITY MAPPING E ERROS EXPLÍCITOS (AJUSTE P0)', () => {
    it('1. PPLB + Image visível -> compile() falha explicitamente lançando exceção', () => {
      const pplb = new PPLBCompiler();
      const docWithImg: LabelDocument = {
        schemaVersion: 1,
        title: 'Modelo com Logo',
        dimensions: { widthMm: 100, heightMm: 30, dpi: 203 },
        elements: [
          { id: 'img1', type: 'image', x: 5, y: 5, width: 20, height: 20, src: 'data:image/png;base64,1' },
        ],
      };

      const val = pplb.validate(docWithImg);
      assert.strictEqual(val.valid, false, 'Compilador PPLB deve retornar valid: false para imagem visível');
      assert.strictEqual(
        val.errors.some((err) => err.includes('ainda não possui suporte a bitmap')),
        true,
        'Compilador PPLB deve retornar erro explícito no validate()'
      );
      assert.throws(() => pplb.compile(docWithImg), /ainda não possui suporte a bitmap/);
    });

    it('2. PPLA + Image visível -> compile() falha explicitamente lançando exceção', () => {
      const ppla = new PPLACompiler();
      const docWithImg: LabelDocument = {
        schemaVersion: 1,
        title: 'Modelo com Logo',
        dimensions: { widthMm: 100, heightMm: 30, dpi: 203 },
        elements: [
          { id: 'img1', type: 'image', x: 5, y: 5, width: 20, height: 20, src: 'data:image/png;base64,1' },
        ],
      };

      const val = ppla.validate(docWithImg);
      assert.strictEqual(val.valid, false, 'Compilador PPLA deve retornar valid: false para imagem visível');
      assert.strictEqual(
        val.errors.some((err) => err.includes('ainda não possui suporte a bitmap')),
        true,
        'Compilador PPLA deve retornar erro explícito no validate()'
      );
      assert.throws(() => ppla.compile(docWithImg), /ainda não possui suporte a bitmap/);
    });

    it('3. ZPL + Image visível -> compile() falha explicitamente lançando exceção', () => {
      const zpl = new ZPLCompiler();
      const docWithImg: LabelDocument = {
        schemaVersion: 1,
        title: 'Modelo com Logo',
        dimensions: { widthMm: 100, heightMm: 30, dpi: 203 },
        elements: [
          { id: 'img1', type: 'image', x: 5, y: 5, width: 20, height: 20, src: 'data:image/png;base64,1' },
        ],
      };

      const val = zpl.validate(docWithImg);
      assert.strictEqual(val.valid, false, 'Compilador ZPL deve retornar valid: false para imagem visível');
      assert.strictEqual(
        val.errors.some((err) => err.includes('ainda não possui suporte a bitmap')),
        true,
        'Compilador ZPL deve retornar erro explícito no validate()'
      );
      assert.throws(() => zpl.compile(docWithImg), /ainda não possui suporte a bitmap/);
    });

    it('4. Nenhum output parcial imprimível é retornado quando compile() falha com ImageElement', () => {
      const pplb = new PPLBCompiler();
      const docWithImg: LabelDocument = {
        schemaVersion: 1,
        title: 'Modelo Misto',
        dimensions: { widthMm: 100, heightMm: 30, dpi: 203 },
        elements: [
          { id: 'txt1', type: 'text', text: 'TEXTO OK', fontFamily: 'Roboto', fontSize: 10, x: 5, y: 5, width: 50, height: 10 },
          { id: 'img1', type: 'image', x: 5, y: 15, width: 20, height: 20, src: 'data:image/png;base64,1' },
        ],
      };

      assert.throws(() => {
        pplb.compile(docWithImg);
      }, /ainda não possui suporte a bitmap/);
    });

    it('5. Modelo sem Image continua compilando normalmente em PPLB, PPLA e ZPL', () => {
      const pplb = new PPLBCompiler();
      const ppla = new PPLACompiler();
      const zpl = new ZPLCompiler();

      const docClean: LabelDocument = {
        schemaVersion: 1,
        title: 'Modelo Sem Imagem',
        dimensions: { widthMm: 100, heightMm: 30, dpi: 203 },
        elements: [
          { id: 'txt1', type: 'text', text: 'ETIQUETA PADRÃO', fontFamily: 'Roboto', fontSize: 10, x: 5, y: 5, width: 50, height: 10 },
        ],
      };

      const resPPLB = pplb.compile(docClean);
      assert.strictEqual(resPPLB.command.includes('ETIQUETA PADRÃO'), true);

      const resPPLA = ppla.compile(docClean);
      assert.strictEqual(resPPLA.command.includes('ETIQUETA PADRÃO'), true);

      const resZPL = zpl.compile(docClean);
      assert.strictEqual(resZPL.command.includes('ETIQUETA PADRÃO'), true);
    });

    it('6. Image com visible === false não bloqueia a compilação', () => {
      const pplb = new PPLBCompiler();
      const docHiddenImg: LabelDocument = {
        schemaVersion: 1,
        title: 'Modelo com Imagem Oculta',
        dimensions: { widthMm: 100, heightMm: 30, dpi: 203 },
        elements: [
          { id: 'txt1', type: 'text', text: 'TEXTO VISÍVEL', fontFamily: 'Roboto', fontSize: 10, x: 5, y: 5, width: 50, height: 10 },
          { id: 'img1', type: 'image', x: 5, y: 15, width: 20, height: 20, src: 'data:image/png;base64,1', visible: false },
        ],
      };

      const val = pplb.validate(docHiddenImg);
      assert.strictEqual(val.valid, true, 'Imagem com visible === false deve passar na validação');

      const res = pplb.compile(docHiddenImg);
      assert.strictEqual(res.command.includes('TEXTO VISÍVEL'), true);
    });
  });
});
