import crypto from 'node:crypto';

/**
 * ============================================================================
 * SERVIÇO CANÔNICO DE AUTENTICAÇÃO DO DESENVOLVEDOR — DEVCONTROL CENTER (DCC)
 * ============================================================================
 *
 * NOTA DE SEGURANÇA OBRIGATÓRIA:
 *
 * A fórmula baseada em "DATA_NASCIMENTO + DATA_ATUAL" foi formalmente rejeitada
 * pelas seguintes razões técnicas e criptográficas:
 * 1. A data de nascimento é informação biográfica estática e pública/descobrível;
 * 2. A data atual é pública e trivial de inferir;
 * 3. A regra é determinística e desprovida de entropia/segredo criptográfico compartilhado;
 * 4. Uma vez descoberta a fórmula, qualquer atacante pode derivar qualquer senha futura;
 * 5. O fato de a senha rotacionar diariamente NÃO a torna segura se o gerador for previsível.
 *
 * Portanto, a plataforma adota o padrão industrial RFC 6238 (TOTP — Time-Based One-Time
 * Password), amplamente homologado e compatível com Google Authenticator, Authy e 1Password.
 *
 * Parâmetros RFC 6238:
 * - Algoritmo: HMAC-SHA1
 * - Dígitos: 6
 * - Intervalo de tempo (Time Step): 30 segundos
 * - Tolerância de deriva de relógio: ±1 intervalo (±30 segundos)
 * - Segredo: Fornecido exclusivamente via variável de ambiente `DCC_TOTP_SECRET`
 *   (NUNCA hardcodado, NUNCA commitado, NUNCA exposto ao frontend ou logs).
 */

export const DCC_SESSION_COOKIE_NAME = 'witiquetas_dcc_session';
export const DCC_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas de validade

export const DEVELOPER_IDENTITY = {
  username: 'Marcel',
};

export interface DeveloperSessionData {
  username: string;
  createdAt: Date;
  expiresAt: Date;
}

// Armazenamento em memória das sessões ativas do desenvolvedor (token_hash -> data)
const activeDeveloperSessions = new Map<string, DeveloperSessionData>();

// Controle de taxa (Rate Limiting) e proteção contra força bruta
interface RateLimitEntry {
  attempts: number;
  blockedUntil: number;
}
const loginRateLimitMap = new Map<string, RateLimitEntry>();
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos de bloqueio após 5 falhas

/**
 * Decodifica uma chave Base32 (RFC 4648) para Buffer.
 */
export function base32ToBuffer(base32: string): Buffer {
  const cleanBase32 = base32.toUpperCase().replace(/[\s=-]/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanBase32.length; i++) {
    const idx = alphabet.indexOf(cleanBase32[i]);
    if (idx === -1) {
      continue;
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Gera o código TOTP de 6 dígitos para um dado contador de tempo (RFC 6238 / RFC 4226)
 */
export function generateTotpCode(secretBuffer: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;

  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Helper para testes: gera código TOTP dado uma chave base32 e delta opcional de steps
 */
export function generateTotpCodeForTesting(base32Secret: string, stepDelta = 0): string {
  const buf = base32ToBuffer(base32Secret);
  const currentCounter = Math.floor(Date.now() / 1000 / 30);
  return generateTotpCode(buf, currentCounter + stepDelta);
}

export class DeveloperAuthService {
  /**
   * Obtém o nome de usuário lógico do desenvolvedor de plataforma (padrão: Marcel)
   */
  getDeveloperUsername(): string {
    return (process.env.DCC_DEVELOPER_USERNAME || DEVELOPER_IDENTITY.username).trim();
  }

  /**
   * Retorna o segredo configurado no ambiente, sem expô-lo publicamente.
   */
  getSecretBuffer(): Buffer | null {
    const rawSecret = process.env.DCC_TOTP_SECRET?.trim();
    if (!rawSecret) {
      return null;
    }
    const buf = base32ToBuffer(rawSecret);
    return buf.length > 0 ? buf : Buffer.from(rawSecret, 'utf8');
  }

  /**
   * Verifica se o código TOTP fornecido é válido no intervalo atual (±1 intervalo de tolerância)
   */
  verifyTotpCode(code: string, customSecretBuffer?: Buffer): boolean {
    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
      return false;
    }

    const secretBuffer = customSecretBuffer || this.getSecretBuffer();
    if (!secretBuffer || secretBuffer.length === 0) {
      return false;
    }

    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    const normalizedCode = code.trim();

    // Janela de ±1 intervalo de 30s para acomodar deriva de relógio (RFC 6238 recomendação)
    for (let delta = -1; delta <= 1; delta++) {
      const expected = generateTotpCode(secretBuffer, currentCounter + delta);
      if (
        expected.length === normalizedCode.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalizedCode))
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Executa tentativa de autenticação com proteção de taxa e força bruta
   */
  async authenticate(
    username: unknown,
    code: unknown,
    clientIp: string
  ): Promise<{
    success: boolean;
    sessionToken?: string;
    expiresAt?: string;
    error?: string;
    code?: string;
    rateLimited?: boolean;
  }> {
    const now = Date.now();

    // 1. Verificação de bloqueio por rate limit
    const rateEntry = loginRateLimitMap.get(clientIp) || { attempts: 0, blockedUntil: 0 };
    if (rateEntry.blockedUntil > now) {
      const waitSeconds = Math.ceil((rateEntry.blockedUntil - now) / 1000);
      return {
        success: false,
        error: `Muitas tentativas incorretas. Acesso bloqueado temporariamente por mais ${waitSeconds} segundos.`,
        code: 'DEVELOPER_AUTH_RATE_LIMITED',
        rateLimited: true,
      };
    }

    // 2. Validação básica de campos
    if (typeof username !== 'string' || typeof code !== 'string') {
      return {
        success: false,
        error: 'Credenciais de desenvolvedor inválidas.',
        code: 'INVALID_DEVELOPER_CREDENTIALS',
      };
    }

    const secretBuffer = this.getSecretBuffer();
    if (!secretBuffer) {
      return {
        success: false,
        error: 'Segredo de autenticação do desenvolvedor não configurado no ambiente.',
        code: 'DEVELOPER_SECRET_NOT_CONFIGURED',
      };
    }

    const expectedUsername = this.getDeveloperUsername();
    const isUsernameMatch = username.trim().toLowerCase() === expectedUsername.toLowerCase();
    const isCodeValid = this.verifyTotpCode(code, secretBuffer);

    if (!isUsernameMatch || !isCodeValid) {
      rateEntry.attempts += 1;
      if (rateEntry.attempts >= MAX_ATTEMPTS) {
        rateEntry.blockedUntil = now + BLOCK_DURATION_MS;
      }
      loginRateLimitMap.set(clientIp, rateEntry);

      return {
        success: false,
        error: 'Usuário ou código de segurança inválido.',
        code: 'INVALID_DEVELOPER_CREDENTIALS',
      };
    }

    // 3. Sucesso: limpar taxa para o IP
    loginRateLimitMap.delete(clientIp);

    // 4. Criar sessão
    const session = this.createSession(expectedUsername);

    return {
      success: true,
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * Cria uma nova sessão segura de 256 bits
   */
  createSession(username = DEVELOPER_IDENTITY.username): { token: string; rawToken: string; expiresAt: Date } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + DCC_SESSION_TTL_MS);

    const sessionData: DeveloperSessionData = {
      username,
      createdAt: new Date(),
      expiresAt,
    };

    activeDeveloperSessions.set(tokenHash, sessionData);
    return { token: rawToken, rawToken, expiresAt };
  }

  /**
   * Valida um token de sessão de desenvolvedor ativo
   */
  validateSession(rawToken?: string | null): DeveloperSessionData | null {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 32) {
      return null;
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const session = activeDeveloperSessions.get(tokenHash);

    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() < Date.now()) {
      activeDeveloperSessions.delete(tokenHash);
      return null;
    }

    return session;
  }

  /**
   * Encerra e revoga a sessão de desenvolvedor
   */
  revokeSession(rawToken?: string | null): void {
    if (!rawToken || typeof rawToken !== 'string') return;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    activeDeveloperSessions.delete(tokenHash);
  }

  /**
   * Limpa todas as sessões e limites (utilizado em testes automatizados)
   */
  clearAllSessionsForTesting(): void {
    activeDeveloperSessions.clear();
    loginRateLimitMap.clear();
  }
}

export const developerAuthService = new DeveloperAuthService();
