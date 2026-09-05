import bcrypt from 'bcryptjs';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const BCRYPT_SALT_ROUNDS = 12;

export interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}

/**
  * Serviço canônico para validação de política, hashing e verificação de senhas.
  * Utiliza algoritmo bcrypt com fator de custo 12, garantindo proteção contra ataques de dicionário e rainbow tables.
  */
export const PasswordService = {
  /**
   * Valida a senha contra a política mínima da plataforma.
   * Regras: Mínimo 8 caracteres, máximo 128 caracteres (proteção contra DoS de CPU).
   * Não realiza truncamento silencioso.
   */
  validatePolicy(password: unknown): PasswordValidationResult {
    if (typeof password !== 'string') {
      return { valid: false, reason: 'A senha deve ser uma cadeia de caracteres válida.' };
    }

    if (!password || password.trim().length === 0) {
      return { valid: false, reason: 'A senha não pode estar em branco.' };
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return {
        valid: false,
        reason: `A senha deve conter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`,
      };
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return {
        valid: false,
        reason: `A senha não pode exceder ${MAX_PASSWORD_LENGTH} caracteres.`,
      };
    }

    return { valid: true };
  },

  /**
   * Valida a senha contra a política e lança exceção em caso de violação.
   */
  validatePassword(password: unknown): void {
    const result = this.validatePolicy(password);
    if (!result.valid) {
      throw new Error(result.reason || 'Senha inválida.');
    }
  },

  /**
   * Valida sintaxe básica de endereço de e-mail.
   */
  validateEmail(email: unknown): void {
    if (typeof email !== 'string' || !email.includes('@') || !email.includes('.') || email.length < 5) {
      throw new Error('Email inválido.');
    }
  },

  /**
   * Gera hash seguro com salt para a senha fornecida.
   * Valida a política antes de executar o hashing.
   * Nunca loga nem expõe a senha em plaintext.
   */
  async hash(password: string): Promise<string> {
    const policy = this.validatePolicy(password);
    if (!policy.valid) {
      throw new Error(`password_policy_violation: ${policy.reason}`);
    }

    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  },

  /**
   * Verifica se a senha em texto plano corresponde ao hash armazenado.
   * Utiliza comparação em tempo constante para mitigar timing attacks.
   */
  async verify(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) {
      return false;
    }

    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  },

  /**
   * Executa verificação simulada com hash fixo para mitigar timing attacks
   * quando o usuário não for encontrado ou não possuir senha configurada.
   */
  async dummyVerify(): Promise<boolean> {
    try {
      return await bcrypt.compare('dummy_timing_mitigation_pw', '$2a$12$e8rG.60vUjJ5y/O/y9VpKe7e.Z14k2KkHkY8F0Vw5sKk2kHkY8F0V');
    } catch {
      return false;
    }
  },
};
