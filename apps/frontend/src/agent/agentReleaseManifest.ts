import type { PlatformKey, OSKey } from './agentPlatformDetector';

export type ReleaseStatus = 'AVAILABLE' | 'COMING_SOON' | 'UNSUPPORTED';

export interface AgentPlatformInfo {
  key: PlatformKey;
  name: string;
  osKey: OSKey;
  architectureName: string;
  bitness?: 32 | 64;
  status: ReleaseStatus;
  fileName?: string;
  downloadUrl?: string;
  sha256?: string;
  badge?: string;
  description: string;
  recommended?: boolean;
}

export interface AgentReleaseManifest {
  version: string;
  updatedAt: string;
  releases: Record<PlatformKey, AgentPlatformInfo>;
}

export const AGENT_RELEASE_MANIFEST: AgentReleaseManifest = {
  version: '0.1.0',
  updatedAt: '2026-08-18T12:00:00.000Z',
  releases: {
    WINDOWS_X64: {
      key: 'WINDOWS_X64',
      name: 'Windows',
      osKey: 'windows',
      architectureName: '64 bits (x64)',
      bitness: 64,
      status: 'AVAILABLE',
      fileName: 'witiquetas-agent-windows-x64.exe',
      downloadUrl: '/api/agents/download/windows-x64',
      badge: 'Disponível',
      description: 'Executável nativo de alta performance para Windows 10, 11 e Server 64 bits.',
      recommended: true,
    },
    WINDOWS_X86: {
      key: 'WINDOWS_X86',
      name: 'Windows',
      osKey: 'windows',
      architectureName: '32 bits (x86)',
      bitness: 32,
      status: 'COMING_SOON',
      badge: 'Em breve',
      description: 'Binário compatível com versões antigas ou sistemas legados de 32 bits.',
    },
    WINDOWS_ARM64: {
      key: 'WINDOWS_ARM64',
      name: 'Windows',
      osKey: 'windows',
      architectureName: 'ARM64 (Snapdragon)',
      bitness: 64,
      status: 'COMING_SOON',
      badge: 'Em breve',
      description: 'Compilado nativo para notebooks Windows com processadores ARM Copilot+ PC.',
    },
    LINUX_X64: {
      key: 'LINUX_X64',
      name: 'Linux',
      osKey: 'linux',
      architectureName: '64 bits (x86_64)',
      bitness: 64,
      status: 'COMING_SOON',
      badge: 'Em breve',
      description: 'Binário ELF estático para distribuições Ubuntu, Debian, CentOS, Alpine e Fedora.',
    },
    LINUX_ARM64: {
      key: 'LINUX_ARM64',
      name: 'Linux',
      osKey: 'linux',
      architectureName: 'ARM64 (Raspberry Pi)',
      bitness: 64,
      status: 'COMING_SOON',
      badge: 'Em breve',
      description: 'Ideal para mini-servidores de impressão dedicados em Raspberry Pi e SoCs ARM.',
    },
    MACOS_ARM64: {
      key: 'MACOS_ARM64',
      name: 'macOS',
      osKey: 'macos',
      architectureName: 'Apple Silicon (M1/M2/M3/M4)',
      bitness: 64,
      status: 'COMING_SOON',
      badge: 'Em breve',
      description: 'Binário nativo otimizado para computadores Mac com arquitetura Apple Silicon.',
    },
    MACOS_X64: {
      key: 'MACOS_X64',
      name: 'macOS',
      osKey: 'macos',
      architectureName: 'Intel 64 bits',
      bitness: 64,
      status: 'COMING_SOON',
      badge: 'Em breve',
      description: 'Suporte para computadores Mac anteriores com processadores Intel x86_64.',
    },
    FREEBSD_X64: {
      key: 'FREEBSD_X64',
      name: 'FreeBSD',
      osKey: 'freebsd',
      architectureName: '64 bits (x86_64)',
      bitness: 64,
      status: 'COMING_SOON',
      badge: 'Em breve',
      description: 'Compilação para ambientes de rede robustos baseados em FreeBSD / BSD.',
    },
    ANDROID: {
      key: 'ANDROID',
      name: 'Android',
      osKey: 'android',
      architectureName: 'Mobile / Tablet',
      status: 'UNSUPPORTED',
      badge: 'Não suportado',
      description: 'O Agent requer um computador/servidor conectado diretamente às impressoras.',
    },
    IOS: {
      key: 'IOS',
      name: 'iOS',
      osKey: 'ios',
      architectureName: 'iPhone / iPad',
      status: 'UNSUPPORTED',
      badge: 'Não suportado',
      description: 'O Agent requer um computador/servidor conectado diretamente às impressoras.',
    },
    UNKNOWN: {
      key: 'UNKNOWN',
      name: 'Outro Sistema',
      osKey: 'unknown',
      architectureName: 'Manual',
      status: 'COMING_SOON',
      badge: 'Em breve',
      description: 'Selecione uma das versões acima compatível com seu computador.',
    },
  },
};

/**
 * Retorna os dados da release para a plataforma informada
 */
export function getReleaseForPlatform(platformKey: PlatformKey): AgentPlatformInfo {
  return AGENT_RELEASE_MANIFEST.releases[platformKey] || AGENT_RELEASE_MANIFEST.releases.UNKNOWN;
}

/**
 * Retorna a lista de plataformas disponíveis para exibição no Grid
 */
export function getDesktopPlatformReleases(): AgentPlatformInfo[] {
  const desktopKeys: PlatformKey[] = [
    'WINDOWS_X64',
    'WINDOWS_X86',
    'WINDOWS_ARM64',
    'LINUX_X64',
    'LINUX_ARM64',
    'MACOS_ARM64',
    'MACOS_X64',
    'FREEBSD_X64',
  ];
  return desktopKeys.map((k) => AGENT_RELEASE_MANIFEST.releases[k]);
}
