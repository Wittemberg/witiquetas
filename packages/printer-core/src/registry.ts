import type { PrinterCompiler, PrinterLanguage } from './types.js';

class CompilerRegistry {
  private compilers = new Map<PrinterLanguage, PrinterCompiler>();

  register(compiler: PrinterCompiler) {
    this.compilers.set(compiler.language, compiler);
  }

  get(language: PrinterLanguage): PrinterCompiler | undefined {
    return this.compilers.get(language);
  }

  has(language: PrinterLanguage): boolean {
    return this.compilers.has(language);
  }

  getSupportedLanguages(): PrinterLanguage[] {
    return Array.from(this.compilers.keys());
  }
}

export const compilerRegistry = new CompilerRegistry();
