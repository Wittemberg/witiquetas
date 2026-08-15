import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ZOD_SHIM_URL = pathToFileURL(path.join(__dirname, 'zod-shim.js')).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'zod') {
    return {
      format: 'module',
      shortCircuit: true,
      url: ZOD_SHIM_URL,
    };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Tenta com .ts se terminar com .js
    if (specifier.endsWith('.js')) {
      const tsSpecifier = specifier.slice(0, -3) + '.ts';
      try {
        return await nextResolve(tsSpecifier, context);
      } catch (tsErr) {}
    }

    // Tenta adicionar extensão .ts se for relativo sem extensão
    if (specifier.startsWith('.') && !path.extname(specifier)) {
      try {
        return await nextResolve(specifier + '.ts', context);
      } catch (tsErr2) {}
    }

    throw err;
  }
}
