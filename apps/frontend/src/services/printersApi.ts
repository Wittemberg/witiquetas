import type { PrinterDTO } from '@witiquetas/contracts';
import { build_api_url } from '../config/api.js';

export const printersApi = {
  async listPrinters(): Promise<PrinterDTO[]> {
    try {
      const res = await fetch(build_api_url('/api/printers'));
      if (!res.ok) {
        return [
          {
            id: 'prt-default-pplb',
            companyId: 'comp-default',
            name: 'Argox OS-214plus (PPLB Local)',
            language: 'PPLB',
            protocol: 'RAW_TCP',
            host: '127.0.0.1',
            port: 9100,
            dpi: 203,
            active: true,
            isDefault: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      }
      const data = await res.json();
      const list = data.printers || [];
      if (list.length === 0) {
        return [
          {
            id: 'prt-default-pplb',
            companyId: 'comp-default',
            name: 'Argox OS-214plus (PPLB Local)',
            language: 'PPLB',
            protocol: 'RAW_TCP',
            host: '127.0.0.1',
            port: 9100,
            dpi: 203,
            active: true,
            isDefault: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      }
      return list;
    } catch {
      return [
        {
          id: 'prt-default-pplb',
          companyId: 'comp-default',
          name: 'Argox OS-214plus (PPLB Local)',
          language: 'PPLB',
          protocol: 'RAW_TCP',
          host: '127.0.0.1',
          port: 9100,
          dpi: 203,
          active: true,
          isDefault: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }
  },
};
