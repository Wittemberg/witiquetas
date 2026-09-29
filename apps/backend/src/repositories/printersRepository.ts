import { pgPool } from '../db.js';
import type {
  PrinterDTO,
  CreatePrinterDTO,
  UpdatePrinterDTO,
  CanonicalPrinterProtocol,
  PrinterConnectionType,
  SerialFlowControl,
  PrinterStatus,
} from '@witiquetas/contracts';

// MemStore de fallback para testes sem PostgreSQL ativo
export const memPrinters = new Map<string, PrinterDTO>();

function mapRowToDTO(row: any): PrinterDTO {
  const status: PrinterStatus = row.status === 'INACTIVE' ? 'INACTIVE' : (row.status === 'OFFLINE' ? 'OFFLINE' : 'ACTIVE');
  const connectionType: PrinterConnectionType = (row.connection_type || 'RAW_TCP') as PrinterConnectionType;
  const protocol = row.protocol || 'RAW_TEXT';
  const ip = row.ip || undefined;
  const host = ip;

  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    modelId: row.model_id,
    model: row.model_id, // alias
    manufacturer: row.manufacturer || undefined,
    protocol: connectionType, // Transporte (RAW_TCP, etc.) para printJobs e Agent
    connectionType,
    printerProtocol: protocol, // Linguagem canônica (ZPL, etc.)
    language: protocol, // alias retrocompatível para linguagem
    dpi: Number(row.dpi || 203),
    host,
    ip,
    port: row.port !== null && row.port !== undefined ? Number(row.port) : undefined,
    spoolerName: row.spooler_name || undefined,
    serialPort: row.serial_port || undefined,
    baudRate: row.baud_rate !== null && row.baud_rate !== undefined ? Number(row.baud_rate) : undefined,
    serialFlowControl: (row.serial_flow_control as SerialFlowControl) || undefined,
    agentId: row.agent_id || null,
    location: row.location || null,
    isDefault: !!row.is_default,
    status,
    active: status === 'ACTIVE',
    settings: (row.settings && typeof row.settings === 'object') ? row.settings : {},
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at || new Date().toISOString()),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at || new Date().toISOString()),
  };
}

export class PrintersRepository {
  /**
   * Reseta o storage em memória (usado para isolamento de testes)
   */
  static clearMemory(): void {
    memPrinters.clear();
  }

  /**
   * Lista todas as impressoras de um determinado tenant
   */
  static async listByCompany(companyId: string): Promise<PrinterDTO[]> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT * FROM printers WHERE company_id = $1 ORDER BY is_default DESC, name ASC`,
        [companyId]
      );
      return res.rows.map(mapRowToDTO);
    }

    return Array.from(memPrinters.values())
      .filter((p) => p.companyId === companyId)
      .sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }

  /**
   * Busca uma impressora por ID com isolamento multi-tenant estrito
   */
  static async findById(companyId: string, id: string): Promise<PrinterDTO | null> {
    if (pgPool) {
      const res = await pgPool.query(
        `SELECT * FROM printers WHERE company_id = $1 AND id = $2`,
        [companyId, id]
      );
      if (res.rows.length === 0) return null;
      return mapRowToDTO(res.rows[0]);
    }

    const p = memPrinters.get(id);
    if (!p || p.companyId !== companyId) return null;
    return p;
  }

  /**
   * Cadastra uma nova impressora física vinculada à empresa
   */
  static async create(companyId: string, data: CreatePrinterDTO): Promise<PrinterDTO> {
    const id = `prn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const name = data.name.trim();
    const modelId = data.modelId || data.model || 'generic-thermal';
    const manufacturer = data.manufacturer?.trim() || null;
    const protocol = data.protocol || data.language || 'ZPL';
    const dpi = data.dpi || 203;
    const connectionType: PrinterConnectionType = data.connectionType || (data.protocol as any) || 'RAW_TCP';
    const ip = data.ip || data.host || null;
    const port = data.port || (connectionType === 'RAW_TCP' ? 9100 : null);
    const spoolerName = data.spoolerName?.trim() || null;
    const serialPort = data.serialPort?.trim() || null;
    const baudRate = data.baudRate || (connectionType === 'SERIAL' ? 9600 : null);
    const serialFlowControl = data.serialFlowControl || (connectionType === 'SERIAL' ? 'RTS_CTS' : null);
    const agentId = data.agentId || null;
    const location = data.location?.trim() || null;
    const isDefault = !!data.isDefault;
    const status: PrinterStatus = data.status || (data.active === false ? 'INACTIVE' : 'ACTIVE');
    const settings = data.settings || {};

    if (pgPool) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        if (isDefault) {
          // Desmarca qualquer outra impressora default do mesmo tenant
          await client.query(
            `UPDATE printers SET is_default = FALSE, updated_at = NOW() WHERE company_id = $1 AND is_default = TRUE`,
            [companyId]
          );
        }

        const res = await client.query(
          `INSERT INTO printers (
            id, company_id, name, model_id, manufacturer, protocol, dpi,
            connection_type, ip, port, spooler_name, serial_port, baud_rate,
            serial_flow_control, agent_id, location, is_default, status, settings,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18, $19,
            NOW(), NOW()
          ) RETURNING *`,
          [
            id, companyId, name, modelId, manufacturer, protocol, dpi,
            connectionType, ip, port, spoolerName, serialPort, baudRate,
            serialFlowControl, agentId, location, isDefault, status, settings,
          ]
        );

        await client.query('COMMIT');
        return mapRowToDTO(res.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // Fallback em memória
    if (isDefault) {
      memPrinters.forEach((p) => {
        if (p.companyId === companyId) {
          p.isDefault = false;
        }
      });
    }

    const created: PrinterDTO = {
      id,
      companyId,
      name,
      modelId,
      model: modelId,
      manufacturer: manufacturer || undefined,
      protocol: connectionType,
      connectionType,
      printerProtocol: protocol,
      language: protocol as any,
      dpi,
      ip: ip || undefined,
      host: ip || undefined,
      port: port || undefined,
      spoolerName: spoolerName || undefined,
      serialPort: serialPort || undefined,
      baudRate: baudRate || undefined,
      serialFlowControl: serialFlowControl || undefined,
      agentId,
      location,
      isDefault,
      status,
      active: status === 'ACTIVE',
      settings,
      createdAt: now,
      updatedAt: now,
    };

    memPrinters.set(id, created);
    return created;
  }

  /**
   * Atualiza uma impressora existente respeitando o isolamento por tenant
   */
  static async update(companyId: string, id: string, data: UpdatePrinterDTO): Promise<PrinterDTO | null> {
    const existing = await this.findById(companyId, id);
    if (!existing) return null;

    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const modelId = data.modelId !== undefined ? data.modelId : (data.model !== undefined ? data.model : existing.modelId);
    const manufacturer = data.manufacturer !== undefined ? (data.manufacturer?.trim() || null) : (existing.manufacturer || null);
    const protocol = data.protocol !== undefined ? data.protocol : (data.language !== undefined ? data.language : existing.protocol);
    const dpi = data.dpi !== undefined ? data.dpi : existing.dpi;
    const connectionType = data.connectionType !== undefined ? data.connectionType : existing.connectionType;
    const ip = data.ip !== undefined ? data.ip : (data.host !== undefined ? data.host : (existing.ip || null));
    const port = data.port !== undefined ? data.port : (existing.port || null);
    const spoolerName = data.spoolerName !== undefined ? (data.spoolerName?.trim() || null) : (existing.spoolerName || null);
    const serialPort = data.serialPort !== undefined ? (data.serialPort?.trim() || null) : (existing.serialPort || null);
    const baudRate = data.baudRate !== undefined ? data.baudRate : (existing.baudRate || null);
    const serialFlowControl = data.serialFlowControl !== undefined ? data.serialFlowControl : (existing.serialFlowControl || null);
    const agentId = data.agentId !== undefined ? data.agentId : existing.agentId;
    const location = data.location !== undefined ? (data.location?.trim() || null) : existing.location;
    const isDefault = data.isDefault !== undefined ? !!data.isDefault : existing.isDefault;
    const status: PrinterStatus = data.status !== undefined ? data.status : (data.active !== undefined ? (data.active ? 'ACTIVE' : 'INACTIVE') : existing.status);
    const settings = data.settings !== undefined ? data.settings : existing.settings;

    if (pgPool) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        if (isDefault) {
          await client.query(
            `UPDATE printers SET is_default = FALSE, updated_at = NOW() WHERE company_id = $1 AND id != $2 AND is_default = TRUE`,
            [companyId, id]
          );
        }

        const res = await client.query(
          `UPDATE printers SET
            name = $3,
            model_id = $4,
            manufacturer = $5,
            protocol = $6,
            dpi = $7,
            connection_type = $8,
            ip = $9,
            port = $10,
            spooler_name = $11,
            serial_port = $12,
            baud_rate = $13,
            serial_flow_control = $14,
            agent_id = $15,
            location = $16,
            is_default = $17,
            status = $18,
            settings = $19,
            updated_at = NOW()
          WHERE company_id = $1 AND id = $2
          RETURNING *`,
          [
            companyId, id, name, modelId, manufacturer, protocol, dpi,
            connectionType, ip, port, spoolerName, serialPort, baudRate,
            serialFlowControl, agentId, location, isDefault, status, settings,
          ]
        );

        await client.query('COMMIT');
        return mapRowToDTO(res.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // Fallback em memória
    if (isDefault) {
      memPrinters.forEach((p) => {
        if (p.companyId === companyId && p.id !== id) {
          p.isDefault = false;
        }
      });
    }

    const updated: PrinterDTO = {
      ...existing,
      name,
      modelId,
      model: modelId,
      manufacturer: manufacturer || undefined,
      protocol: connectionType,
      connectionType,
      printerProtocol: protocol,
      language: protocol as any,
      dpi,
      ip: ip || undefined,
      host: ip || undefined,
      port: port || undefined,
      spoolerName: spoolerName || undefined,
      serialPort: serialPort || undefined,
      baudRate: baudRate || undefined,
      serialFlowControl: serialFlowControl || undefined,
      agentId,
      location,
      isDefault,
      status,
      active: status === 'ACTIVE',
      settings,
      updatedAt: new Date().toISOString(),
    };

    memPrinters.set(id, updated);
    return updated;
  }

  /**
   * Remove uma impressora física de um tenant
   */
  static async delete(companyId: string, id: string): Promise<boolean> {
    if (pgPool) {
      const res = await pgPool.query(
        `DELETE FROM printers WHERE company_id = $1 AND id = $2`,
        [companyId, id]
      );
      return (res.rowCount ?? 0) > 0;
    }

    const p = memPrinters.get(id);
    if (!p || p.companyId !== companyId) return false;
    return memPrinters.delete(id);
  }

  /**
   * Define uma impressora como default para a empresa (desmarcando outras)
   */
  static async setDefault(companyId: string, id: string): Promise<boolean> {
    const existing = await this.findById(companyId, id);
    if (!existing) return false;

    if (pgPool) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE printers SET is_default = FALSE, updated_at = NOW() WHERE company_id = $1 AND is_default = TRUE`,
          [companyId]
        );
        const res = await client.query(
          `UPDATE printers SET is_default = TRUE, updated_at = NOW() WHERE company_id = $1 AND id = $2`,
          [companyId, id]
        );
        await client.query('COMMIT');
        return (res.rowCount ?? 0) > 0;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    memPrinters.forEach((p) => {
      if (p.companyId === companyId) {
        p.isDefault = (p.id === id);
      }
    });
    return true;
  }
}
