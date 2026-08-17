import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Regressão React #310: CompileModal declara todos os hooks antes de qualquer retorno condicional', () => {
  const filePath = path.join(__dirname, '../apps/frontend/src/editor/CompileModal.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Encontrar a posição do retorno condicional `if (!isOpen)`
  const conditionalReturnIdx = content.indexOf('if (!isOpen) return null');
  assert.ok(conditionalReturnIdx > 0, 'Deve conter o retorno condicional `if (!isOpen) return null`');

  // Encontrar as posições de todos os hooks dentro da função do componente
  const componentStartIdx = content.indexOf('export default function CompileModal');
  assert.ok(componentStartIdx > 0, 'Componente CompileModal deve estar presente');

  const beforeReturn = content.substring(componentStartIdx, conditionalReturnIdx);
  const afterReturn = content.substring(conditionalReturnIdx);

  // Verificar que hooks críticos como useMemo e useState(showDiff) estão ANTES do return condicional
  assert.ok(beforeReturn.includes('useMemo('), 'useMemo(roundTripData) deve estar declarado ANTES de if (!isOpen)');
  assert.ok(beforeReturn.includes('useState(false)'), 'useState(showDiff) deve estar declarado ANTES de if (!isOpen)');
  assert.ok(beforeReturn.includes('useEffect('), 'useEffect deve estar declarado ANTES de if (!isOpen)');

  // Garantir que nenhum hook é invocado DEPOIS do retorno condicional
  const hookRegexAfter = /\b(useState|useEffect|useMemo|useCallback|useContext|useReducer)\s*\(/g;
  const matchesAfter = afterReturn.match(hookRegexAfter);
  assert.equal(
    matchesAfter,
    null,
    `Nenhum React Hook pode ser declarado após o retorno condicional. Encontrados: ${matchesAfter}`
  );
});
