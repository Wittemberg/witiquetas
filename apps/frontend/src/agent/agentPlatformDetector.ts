/**
 * Módulo de Detecção Inteligente de Plataforma e Arquitetura do Agent
 * Utiliza User-Agent Client Hints (quando suportado) e fallbacks estruturados.
 */

export type PlatformKey =
  | 'WINDOWS_X64'
  | 'WINDOWS_X86'
  | 'WINDOWS_ARM64'
  | 'LINUX_X64'
  | 'LINUX_ARM64'
  | 'MACOS_X64'
  | 'MACOS_ARM64'
  | 'FREEBSD_X64'
  | 'ANDROID'
  | 'IOS'
  | 'UNKNOWN';

export type OSKey = 'windows' | 'linux' | 'macos' | 'freebsd' | 'android' | 'ios' | 'unknown';
export type ArchKey = 'x86_64' | 'x86' | 'arm64' | 'unknown';
export type ConfidenceLevel = 'high' | 'partial' | 'low';

export interface PlatformDetectionResult {
  platformKey: PlatformKey;
  osKey: OSKey;
  osName: string;
  arch: ArchKey;
  archName: string;
  bitness?: 32 | 64;
  confidence: ConfidenceLevel;
  isMobile: boolean;
  rawDetails?: {
    platform?: string;
    architecture?: string;
    bitness?: string;
    wow64?: boolean;
    userAgent?: string;
  };
}

interface NavigatorUAData {
  brands?: Array<{ brand: string; version: string }>;
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{
    architecture?: string;
    bitness?: string;
    platform?: string;
    platformVersion?: string;
    wow64?: boolean;
    model?: string;
  }>;
}

/**
 * Detecta a plataforma e arquitetura atual a partir do ambiente do navegador
 */
export async function detectPlatform(customNavigator?: any): Promise<PlatformDetectionResult> {
  const nav = customNavigator || (typeof navigator !== 'undefined' ? navigator : null);

  if (!nav) {
    return {
      platformKey: 'UNKNOWN',
      osKey: 'unknown',
      osName: 'Sistema Desconhecido',
      arch: 'unknown',
      archName: 'Arquitetura Desconhecida',
      confidence: 'low',
      isMobile: false,
    };
  }

  const userAgent = nav.userAgent || '';
  const platformStr = nav.platform || '';
  const maxTouchPoints = nav.maxTouchPoints || 0;

  // 1. Detecção Mobile Especial (Android / iOS)
  const isAndroid = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent) || (platformStr === 'MacIntel' && maxTouchPoints > 1);

  if (isAndroid) {
    return {
      platformKey: 'ANDROID',
      osKey: 'android',
      osName: 'Android',
      arch: 'arm64',
      archName: 'ARM / Mobile',
      bitness: 64,
      confidence: 'high',
      isMobile: true,
      rawDetails: { userAgent, platform: platformStr },
    };
  }

  if (isIOS) {
    return {
      platformKey: 'IOS',
      osKey: 'ios',
      osName: 'iOS (Apple)',
      arch: 'arm64',
      archName: 'Apple ARM',
      bitness: 64,
      confidence: 'high',
      isMobile: true,
      rawDetails: { userAgent, platform: platformStr },
    };
  }

  const uaData: NavigatorUAData | undefined = nav.userAgentData;

  // 2. Método Primário: User-Agent Client Hints (Alta Confiança)
  if (uaData && typeof uaData.getHighEntropyValues === 'function') {
    try {
      const hints = await uaData.getHighEntropyValues(['architecture', 'bitness', 'platform', 'platformVersion', 'wow64']);
      const hintPlatform = (hints.platform || uaData.platform || '').toLowerCase();
      const hintArch = (hints.architecture || '').toLowerCase();
      const hintBitness = hints.bitness ? parseInt(hints.bitness, 10) : undefined;
      const isWow64 = !!hints.wow64;

      // Windows
      if (hintPlatform.includes('win')) {
        if (hintArch === 'arm' || hintArch.includes('arm64') || hintArch.includes('aarch64')) {
          return {
            platformKey: 'WINDOWS_ARM64',
            osKey: 'windows',
            osName: 'Windows',
            arch: 'arm64',
            archName: 'ARM64',
            bitness: 64,
            confidence: 'high',
            isMobile: false,
            rawDetails: { ...hints, userAgent },
          };
        }

        if (hintBitness === 64 || isWow64 || hintArch === 'x86_64' || hintArch === 'x64' || hintArch === 'amd64') {
          return {
            platformKey: 'WINDOWS_X64',
            osKey: 'windows',
            osName: 'Windows',
            arch: 'x86_64',
            archName: '64 bits (x64)',
            bitness: 64,
            confidence: 'high',
            isMobile: false,
            rawDetails: { ...hints, userAgent },
          };
        }

        if (hintBitness === 32 || hintArch === 'x86') {
          return {
            platformKey: 'WINDOWS_X86',
            osKey: 'windows',
            osName: 'Windows',
            arch: 'x86',
            archName: '32 bits (x86)',
            bitness: 32,
            confidence: 'high',
            isMobile: false,
            rawDetails: { ...hints, userAgent },
          };
        }

        // Se detectou Windows mas arquitetura não especificada, assume x64 como recomendado com confiança parcial
        return {
          platformKey: 'WINDOWS_X64',
          osKey: 'windows',
          osName: 'Windows',
          arch: 'x86_64',
          archName: '64 bits (x64) — Recomendado',
          bitness: 64,
          confidence: 'partial',
          isMobile: false,
          rawDetails: { ...hints, userAgent },
        };
      }

      // macOS
      if (hintPlatform.includes('mac')) {
        if (hintArch === 'arm' || hintArch.includes('arm64')) {
          return {
            platformKey: 'MACOS_ARM64',
            osKey: 'macos',
            osName: 'macOS',
            arch: 'arm64',
            archName: 'Apple Silicon (M1/M2/M3/M4)',
            bitness: 64,
            confidence: 'high',
            isMobile: false,
            rawDetails: { ...hints, userAgent },
          };
        }

        return {
          platformKey: 'MACOS_X64',
          osKey: 'macos',
          osName: 'macOS',
          arch: 'x86_64',
          archName: 'Intel 64 bits (x86_64)',
          bitness: 64,
          confidence: 'high',
          isMobile: false,
          rawDetails: { ...hints, userAgent },
        };
      }

      // Linux
      if (hintPlatform.includes('linux')) {
        if (hintArch === 'arm' || hintArch.includes('arm64') || hintArch.includes('aarch64')) {
          return {
            platformKey: 'LINUX_ARM64',
            osKey: 'linux',
            osName: 'Linux',
            arch: 'arm64',
            archName: 'ARM64 / AArch64',
            bitness: 64,
            confidence: 'high',
            isMobile: false,
            rawDetails: { ...hints, userAgent },
          };
        }

        return {
          platformKey: 'LINUX_X64',
          osKey: 'linux',
          osName: 'Linux',
          arch: 'x86_64',
          archName: '64 bits (x86_64)',
          bitness: 64,
          confidence: 'high',
          isMobile: false,
          rawDetails: { ...hints, userAgent },
        };
      }
    } catch {
      // Fallback para parsing tradicional se getHighEntropyValues falhar
    }
  }

  // 3. Método Fallback: User-Agent Tradicional (Confiança Parcial)
  const isWindows = /Windows|Win32|Win64|WOW64/i.test(userAgent) || platformStr.startsWith('Win');
  const isMac = /Macintosh|Mac OS X/i.test(userAgent) || platformStr.startsWith('Mac');
  const isLinux = /Linux|X11/i.test(userAgent) || platformStr.startsWith('Linux');
  const isFreeBSD = /FreeBSD/i.test(userAgent) || platformStr.startsWith('FreeBSD');

  // Indícios de 64 bits / ARM no UA tradicional
  const is64Bit = /x86_64|x86-64|Win64|x64|amd64|WOW64|x86_64/i.test(userAgent);
  const isArm = /arm64|aarch64|ARM/i.test(userAgent);

  if (isWindows) {
    if (isArm) {
      return {
        platformKey: 'WINDOWS_ARM64',
        osKey: 'windows',
        osName: 'Windows',
        arch: 'arm64',
        archName: 'ARM64',
        bitness: 64,
        confidence: 'high',
        isMobile: false,
        rawDetails: { userAgent, platform: platformStr },
      };
    }

    if (is64Bit) {
      return {
        platformKey: 'WINDOWS_X64',
        osKey: 'windows',
        osName: 'Windows',
        arch: 'x86_64',
        archName: '64 bits (x64)',
        bitness: 64,
        confidence: 'high',
        isMobile: false,
        rawDetails: { userAgent, platform: platformStr },
      };
    }

    // Windows detectado sem indício explícito de 64 bits (navigator.platform === "Win32" é ambíguo)
    return {
      platformKey: 'WINDOWS_X64',
      osKey: 'windows',
      osName: 'Windows',
      arch: 'x86_64',
      archName: '64 bits (x64) — Recomendado',
      bitness: 64,
      confidence: 'partial',
      isMobile: false,
      rawDetails: { userAgent, platform: platformStr },
    };
  }

  if (isMac) {
    return {
      platformKey: isArm ? 'MACOS_ARM64' : 'MACOS_X64',
      osKey: 'macos',
      osName: 'macOS',
      arch: isArm ? 'arm64' : 'x86_64',
      archName: isArm ? 'Apple Silicon (M1/M2/M3/M4)' : 'Intel 64 bits',
      bitness: 64,
      confidence: isArm ? 'high' : 'partial',
      isMobile: false,
      rawDetails: { userAgent, platform: platformStr },
    };
  }

  if (isLinux) {
    return {
      platformKey: isArm ? 'LINUX_ARM64' : 'LINUX_X64',
      osKey: 'linux',
      osName: 'Linux',
      arch: isArm ? 'arm64' : 'x86_64',
      archName: isArm ? 'ARM64' : '64 bits (x86_64)',
      bitness: 64,
      confidence: 'partial',
      isMobile: false,
      rawDetails: { userAgent, platform: platformStr },
    };
  }

  if (isFreeBSD) {
    return {
      platformKey: 'FREEBSD_X64',
      osKey: 'freebsd',
      osName: 'FreeBSD',
      arch: 'x86_64',
      archName: '64 bits',
      bitness: 64,
      confidence: 'partial',
      isMobile: false,
      rawDetails: { userAgent, platform: platformStr },
    };
  }

  return {
    platformKey: 'UNKNOWN',
    osKey: 'unknown',
    osName: 'Sistema Desconhecido',
    arch: 'unknown',
    archName: 'Arquitetura Desconhecida',
    confidence: 'low',
    isMobile: false,
    rawDetails: { userAgent, platform: platformStr },
  };
}
