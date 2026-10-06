/**
 * Utilitários operacionais e de formatação de estado do Witiquetas Agent
 * (Pacote 5.7.2 — Agent Operational UX Consistency)
 */

export function formatLastSeen(isoStr?: string): string {
  if (!isoStr) return 'Nunca';
  try {
    const date = new Date(isoStr);
    const diffMs = Date.now() - date.getTime();
    if (isNaN(diffMs)) return 'Nunca';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${Math.max(1, diffSec)}s atrás`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min atrás`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d atrás`;
    return date.toLocaleDateString('pt-BR');
  } catch {
    return 'Nunca';
  }
}
