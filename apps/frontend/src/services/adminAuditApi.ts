import {
  AdminAuditListResponseDTO,
  AdminAuditQueryFilterDTO,
} from '@witiquetas/contracts';

/**
 * Consulta a trilha de auditoria administrativa com filtros e paginação.
 */
export async function fetchAdminAuditLogs(
  filter: AdminAuditQueryFilterDTO = {}
): Promise<AdminAuditListResponseDTO> {
  const params = new URLSearchParams();

  if (filter.page) params.append('page', String(filter.page));
  if (filter.limit) params.append('limit', String(filter.limit));
  if (filter.category) params.append('category', filter.category);
  if (filter.action) params.append('action', filter.action);
  if (filter.userId) params.append('userId', filter.userId);
  if (filter.startDate) params.append('startDate', filter.startDate);
  if (filter.endDate) params.append('endDate', filter.endDate);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/admin/audit-logs${qs}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    let errMsg = `Falha ao carregar logs de auditoria (${response.status})`;
    try {
      const errorData = await response.json();
      if (errorData?.error) errMsg = errorData.error;
    } catch {}
    throw new Error(errMsg);
  }

  return response.json();
}
