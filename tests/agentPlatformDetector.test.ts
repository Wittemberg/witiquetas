import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPlatform,
  type PlatformDetectionResult,
} from '../apps/frontend/src/agent/agentPlatformDetector.js';
import {
  AGENT_RELEASE_MANIFEST,
  getReleaseForPlatform,
  getDesktopPlatformReleases,
} from '../apps/frontend/src/agent/agentReleaseManifest.js';
import agentsRouter from '../apps/backend/src/routes/agents.js';

// ============================================================================
// SUÍTE DE TESTES: CENTRAL DE DOWNLOAD MULTIPLATAFORMA DO AGENT
// ============================================================================

test('1. Windows x64 detectado via Client Hints de alta entropia', async () => {
  const mockNavigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    platform: 'Win32',
    userAgentData: {
      platform: 'Windows',
      getHighEntropyValues: async () => ({
        platform: 'Windows',
        architecture: 'x86',
        bitness: '64',
        wow64: false,
      }),
    },
  };

  const res = await detectPlatform(mockNavigator);
  assert.equal(res.platformKey, 'WINDOWS_X64');
  assert.equal(res.osKey, 'windows');
  assert.equal(res.bitness, 64);
  assert.equal(res.confidence, 'high');
  assert.equal(res.isMobile, false);
});

test('2. Windows x86 (32 bits) detectado via Client Hints', async () => {
  const mockNavigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36',
    platform: 'Win32',
    userAgentData: {
      platform: 'Windows',
      getHighEntropyValues: async () => ({
        platform: 'Windows',
        architecture: 'x86',
        bitness: '32',
        wow64: false,
      }),
    },
  };

  const res = await detectPlatform(mockNavigator);
  assert.equal(res.platformKey, 'WINDOWS_X86');
  assert.equal(res.osKey, 'windows');
  assert.equal(res.bitness, 32);
  assert.equal(res.confidence, 'high');
  assert.equal(res.isMobile, false);
});

test('3. Windows ARM64 detectado via Client Hints', async () => {
  const mockNavigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; ARM64) AppleWebKit/537.36',
    platform: 'Win32',
    userAgentData: {
      platform: 'Windows',
      getHighEntropyValues: async () => ({
        platform: 'Windows',
        architecture: 'arm64',
        bitness: '64',
        wow64: false,
      }),
    },
  };

  const res = await detectPlatform(mockNavigator);
  assert.equal(res.platformKey, 'WINDOWS_ARM64');
  assert.equal(res.osKey, 'windows');
  assert.equal(res.arch, 'arm64');
  assert.equal(res.confidence, 'high');
});

test('4. Linux x64 detectado via Client Hints', async () => {
  const mockNavigator = {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    platform: 'Linux x86_64',
    userAgentData: {
      platform: 'Linux',
      getHighEntropyValues: async () => ({
        platform: 'Linux',
        architecture: 'x86',
        bitness: '64',
      }),
    },
  };

  const res = await detectPlatform(mockNavigator);
  assert.equal(res.platformKey, 'LINUX_X64');
  assert.equal(res.osKey, 'linux');
  assert.equal(res.confidence, 'high');
});

test('5. Linux ARM64 (Raspberry Pi / Server) detectado via Client Hints', async () => {
  const mockNavigator = {
    userAgent: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36',
    platform: 'Linux aarch64',
    userAgentData: {
      platform: 'Linux',
      getHighEntropyValues: async () => ({
        platform: 'Linux',
        architecture: 'arm64',
        bitness: '64',
      }),
    },
  };

  const res = await detectPlatform(mockNavigator);
  assert.equal(res.platformKey, 'LINUX_ARM64');
  assert.equal(res.osKey, 'linux');
  assert.equal(res.arch, 'arm64');
});

test('6. macOS Intel 64 bits detectado', async () => {
  const mockNavigator = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    platform: 'MacIntel',
    userAgentData: {
      platform: 'macOS',
      getHighEntropyValues: async () => ({
        platform: 'macOS',
        architecture: 'x86_64',
        bitness: '64',
      }),
    },
  };

  const res = await detectPlatform(mockNavigator);
  assert.equal(res.platformKey, 'MACOS_X64');
  assert.equal(res.osKey, 'macos');
  assert.equal(res.confidence, 'high');
});

test('7. macOS Apple Silicon (M1/M2/M3/M4) detectado via Client Hints', async () => {
  const mockNavigator = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    platform: 'MacIntel',
    userAgentData: {
      platform: 'macOS',
      getHighEntropyValues: async () => ({
        platform: 'macOS',
        architecture: 'arm',
        bitness: '64',
      }),
    },
  };

  const res = await detectPlatform(mockNavigator);
  assert.equal(res.platformKey, 'MACOS_ARM64');
  assert.equal(res.osKey, 'macos');
  assert.equal(res.arch, 'arm64');
  assert.equal(res.confidence, 'high');
});

test('8. Client Hints indisponível (Fallback gracioso via User-Agent sem quebrar)', async () => {
  const mockNavigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    platform: 'Win32',
    userAgentData: undefined, // Sem Client Hints (ex: Firefox ou Safari)
  };

  const res = await detectPlatform(mockNavigator);
  assert.equal(res.platformKey, 'WINDOWS_X64');
  assert.equal(res.osKey, 'windows');
  assert.equal(res.isMobile, false);
});

test('9. Windows com arquitetura indeterminada recomenda x64 com confiança parcial', async () => {
  const mockNavigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) GenericBrowser',
    platform: 'Win32',
    userAgentData: undefined,
  };

  const res = await detectPlatform(mockNavigator);
  assert.equal(res.platformKey, 'WINDOWS_X64');
  assert.equal(res.osKey, 'windows');
  assert.equal(res.confidence, 'partial');
  assert.ok(res.archName.includes('Recomendado'));
});

test('10. Mobile (Android e iOS) detectado como não elegível para Agent móvel', async () => {
  const mockAndroid = {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
    platform: 'Linux armv8l',
  };

  const resAndroid = await detectPlatform(mockAndroid);
  assert.equal(resAndroid.platformKey, 'ANDROID');
  assert.equal(resAndroid.isMobile, true);

  const mockIOS = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    platform: 'iPhone',
  };

  const resIOS = await detectPlatform(mockIOS);
  assert.equal(resIOS.platformKey, 'IOS');
  assert.equal(resIOS.isMobile, true);
});

test('11. Release Manifest: WINDOWS_X64 está AVAILABLE e possui endpoint de download', () => {
  const release = getReleaseForPlatform('WINDOWS_X64');
  assert.equal(release.status, 'AVAILABLE');
  assert.equal(release.fileName, 'witiquetas-agent-windows-x64.exe');
  assert.equal(release.downloadUrl, '/api/agents/download/windows-x64');
  assert.ok(release.recommended);
});

test('12. Release Manifest: Plataformas futuras estão marcadas como COMING_SOON (sem falso download)', () => {
  const linuxArm = getReleaseForPlatform('LINUX_ARM64');
  assert.equal(linuxArm.status, 'COMING_SOON');
  assert.equal(linuxArm.badge, 'Em breve');

  const macArm = getReleaseForPlatform('MACOS_ARM64');
  assert.equal(macArm.status, 'COMING_SOON');

  const winX86 = getReleaseForPlatform('WINDOWS_X86');
  assert.equal(winX86.status, 'COMING_SOON');
});

test('13. Seleção Manual: Grid Desktop lista 8 plataformas organizadas', () => {
  const desktopReleases = getDesktopPlatformReleases();
  assert.equal(desktopReleases.length, 8);
  const keys = desktopReleases.map((r) => r.key);
  assert.ok(keys.includes('WINDOWS_X64'));
  assert.ok(keys.includes('WINDOWS_X86'));
  assert.ok(keys.includes('WINDOWS_ARM64'));
  assert.ok(keys.includes('LINUX_X64'));
  assert.ok(keys.includes('LINUX_ARM64'));
  assert.ok(keys.includes('MACOS_ARM64'));
  assert.ok(keys.includes('MACOS_X64'));
  assert.ok(keys.includes('FREEBSD_X64'));
});

test('14. Backend Endpoint GET /download/windows-x64 entrega arquivo com Content-Disposition', () => {
  const downloadHandler = (agentsRouter as any).routes.find(
    (r: any) => r.method === 'GET' && r.path === '/download/:platform'
  ).handlers[0];

  let statusCode = 200;
  const headers: Record<string, string> = {};
  let sentData: any = null;

  const req: any = {
    params: { platform: 'windows-x64' },
  };

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
      return res;
    },
    sendFile(filePath: string) {
      sentData = { file: filePath };
      return res;
    },
    send(data: any) {
      sentData = data;
      return res;
    },
    json(data: any) {
      sentData = data;
      return res;
    },
  };

  downloadHandler(req, res);

  assert.equal(statusCode, 200);
  assert.ok(headers['content-disposition'].includes('witiquetas-agent-windows-x64.exe'));
  assert.equal(headers['content-type'], 'application/octet-stream');
  assert.ok(sentData !== null);
});

test('15. Backend Endpoint GET /download/linux-arm64 retorna 404 COMING_SOON', () => {
  const downloadHandler = (agentsRouter as any).routes.find(
    (r: any) => r.method === 'GET' && r.path === '/download/:platform'
  ).handlers[0];

  let statusCode = 200;
  let sentData: any = null;

  const req: any = {
    params: { platform: 'linux-arm64' },
  };

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    setHeader() {
      return res;
    },
    json(data: any) {
      sentData = data;
      return res;
    },
  };

  downloadHandler(req, res);

  assert.equal(statusCode, 404);
  assert.equal(sentData.status, 'COMING_SOON');
});
