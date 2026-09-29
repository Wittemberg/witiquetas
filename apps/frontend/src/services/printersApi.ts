import type { PrinterDTO, CreatePrinterDTO, UpdatePrinterDTO } from '@witiquetas/contracts';
import { getCsrfToken } from '../auth/session.js';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let errMsg = `Erro ${res.status}: ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) errMsg = body.error;
    } catch {}
    throw new Error(errMsg);
  }

  return res.json() as Promise<T>;
}

export const printersApi = {
  async listPrinters(): Promise<PrinterDTO[]> {
    const data = await request<{ total: number; printers: PrinterDTO[] }>('/api/printers');
    return data.printers || [];
  },

  async getPrinter(id: string): Promise<PrinterDTO> {
    return request<PrinterDTO>(`/api/printers/${encodeURIComponent(id)}`);
  },

  async createPrinter(dto: CreatePrinterDTO): Promise<PrinterDTO> {
    return request<PrinterDTO>('/api/printers', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async updatePrinter(id: string, dto: UpdatePrinterDTO): Promise<PrinterDTO> {
    return request<PrinterDTO>(`/api/printers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async deletePrinter(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/printers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async setDefaultPrinter(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/printers/${encodeURIComponent(id)}/default`, {
      method: 'POST',
    });
  },
};
