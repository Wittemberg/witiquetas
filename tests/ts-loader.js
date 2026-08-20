import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ZOD_SHIM_URL = pathToFileURL(path.join(__dirname, 'zod-shim.js')).href;
const EXPRESS_SHIM_URL = pathToFileURL(path.join(__dirname, 'express-shim.js')).href;
const PG_SHIM_URL = pathToFileURL(path.join(__dirname, 'pg-shim.js')).href;
const DOTENV_SHIM_URL = pathToFileURL(path.join(__dirname, 'dotenv-shim.js')).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'zod') {
    return { format: 'module', shortCircuit: true, url: ZOD_SHIM_URL };
  }
  if (specifier === 'express') {
    return { format: 'module', shortCircuit: true, url: EXPRESS_SHIM_URL };
  }
  if (specifier === 'pg') {
    return { format: 'module', shortCircuit: true, url: PG_SHIM_URL };
  }
  if (specifier === 'dotenv') {
    return { format: 'module', shortCircuit: true, url: DOTENV_SHIM_URL };
  }

  if (specifier.startsWith('@witiquetas/')) {
    const pkgName = specifier.replace('@witiquetas/', '');
    const pkgPath = path.join(__dirname, '..', 'packages', pkgName, 'src', 'index.ts');
    if (fs.existsSync(pkgPath)) {
      return { format: 'module', shortCircuit: true, url: pathToFileURL(pkgPath).href };
    }
  }

  if (specifier.startsWith('.') && context.parentURL) {
    try {
      const parentPath = fileURLToPath(context.parentURL);
      const parentDir = path.dirname(parentPath);
      let targetPath = path.resolve(parentDir, specifier);
      if (!fs.existsSync(targetPath)) {
        if (specifier.endsWith('.js') && fs.existsSync(targetPath.slice(0, -3) + '.ts')) {
          targetPath = targetPath.slice(0, -3) + '.ts';
        } else if (fs.existsSync(targetPath + '.ts')) {
          targetPath = targetPath + '.ts';
        }
      }
      if (fs.existsSync(targetPath)) {
        return {
          format: 'module',
          shortCircuit: true,
          url: pathToFileURL(targetPath).href,
        };
      }
    } catch (e) {
      console.error('Loader resolve error:', e);
    }
  }

  return await nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const filePath = fileURLToPath(url);
    const source = fs.readFileSync(filePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        inlineSourceMap: true,
      },
    });
    return {
      format: 'module',
      shortCircuit: true,
      source: output.outputText,
    };
  }
  return await nextLoad(url, context);
}
