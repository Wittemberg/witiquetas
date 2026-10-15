import { PrintJobRepository } from '../repositories/printJobRepository.js';

export class LeaseReaperService {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Inicia o serviço periódico de auditoria e expiração de leases de impressão.
   * Regra 2: PROIBIDA reimpressão automática quando houver possibilidade de bytes já enviados.
   * Regra 3: Lease expirado não comprova ausência de envio. Exigir evidência positiva de não envio.
   */
  public static start(intervalMs = 15000): void {
    if (this.timer) return;

    this.timer = setInterval(async () => {
      if (this.isRunning) return;
      this.isRunning = true;

      try {
        const result = await PrintJobRepository.reapExpiredLeases();
        if (result.reaped > 0) {
          console.log(
            `[LeaseReaper] ${result.reaped} leases expirados processados (Ambíguos/UNKNOWN_RESULT: ${result.unknownResultCount}, Sem Confirmação/EXPIRED_LEASE: ${result.expiredCount}).`
          );
        }
      } catch (err: any) {
        console.error(`[LeaseReaper] Erro durante a varredura de leases expirados: ${err.message}`);
      } finally {
        this.isRunning = false;
      }
    }, intervalMs);

    // Garante que o timer não bloqueia o encerramento do processo Node em testes
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Encerra o reaper de forma graciosa
   */
  public static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }
}
