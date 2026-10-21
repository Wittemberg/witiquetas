import { getPgPool } from '../db.js';

/**
 * Repositório resiliente para persistência e consulta do reconhecimento de notas de versão ("O que há de novo").
 * Opera no PostgreSQL quando disponível ou com fallback em memória para ambiente de testes.
 */
export class UserReleaseViewRepository {
  // Armazenamento em memória para ambiente de testes quando o banco de dados não estiver configurado
  private static memoryViews = new Map<string, Set<string>>(); // `${companyId}:${userId}` -> Set<version>

  private static getMemoryKey(companyId: string, userId: string): string {
    return `${companyId}:${userId}`;
  }

  /**
   * Obtém o conjunto de versões já reconhecidas por um usuário em uma empresa.
   */
  public static async getReadReleaseVersions(
    companyId: string,
    userId: string
  ): Promise<Set<string>> {
    const pool = getPgPool();

    if (!pool) {
      const key = this.getMemoryKey(companyId, userId);
      const set = this.memoryViews.get(key);
      return new Set(set ? Array.from(set) : []);
    }

    try {
      const res = await pool.query<{ release_version: string }>(
        'SELECT release_version FROM user_release_views WHERE company_id = $1 AND user_id = $2',
        [companyId, userId]
      );
      return new Set(res.rows.map((r) => r.release_version));
    } catch (err: any) {
      console.warn(`[UserReleaseViewRepository] Erro ao consultar user_release_views no PostgreSQL: ${err.message}.`);
      throw err;
    }
  }

  /**
   * Registra o reconhecimento de uma ou mais versões de release por um usuário de forma estritamente idempotente.
   * Garante que falhas na persistência no PostgreSQL não sejam mascaradas como sucessos definitivos.
   */
  public static async markReleasesAsRead(
    companyId: string,
    userId: string,
    versions: string[]
  ): Promise<string[]> {
    const validVersions = Array.from(new Set(versions.filter((v) => typeof v === 'string' && v.trim())));
    if (validVersions.length === 0) return [];

    const pool = getPgPool();

    if (!pool) {
      // Ambiente sem PostgreSQL ativo (testes unitários com storage em memória)
      const key = this.getMemoryKey(companyId, userId);
      let userSet = this.memoryViews.get(key);
      if (!userSet) {
        userSet = new Set<string>();
        this.memoryViews.set(key, userSet);
      }
      for (const v of validVersions) {
        userSet.add(v);
      }
      return validVersions;
    }

    // Persistência transacional no PostgreSQL
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const v of validVersions) {
        await client.query(
          `INSERT INTO user_release_views (company_id, user_id, release_version, viewed_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (company_id, user_id, release_version) DO UPDATE SET viewed_at = NOW()`,
          [companyId, userId, v]
        );
      }
      await client.query('COMMIT');

      // Atualiza o cache em memória somente após o commit bem-sucedido no banco
      const key = this.getMemoryKey(companyId, userId);
      let userSet = this.memoryViews.get(key);
      if (!userSet) {
        userSet = new Set<string>();
        this.memoryViews.set(key, userSet);
      }
      for (const v of validVersions) {
        userSet.add(v);
      }

      return validVersions;
    } catch (err: any) {
      console.error(`[UserReleaseViewRepository] Falha na persistência no PostgreSQL: ${err.message}. Realizando ROLLBACK.`);
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr: any) {
        console.error(`[UserReleaseViewRepository] Erro no ROLLBACK: ${rollbackErr.message}`);
      }
      // Não mascara o erro: relança para impedir falso positivo de persistência definitiva
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Reinicializa o estado em memória para execução de testes automatizados.
   */
  public static resetForTests(): void {
    this.memoryViews.clear();
  }
}
