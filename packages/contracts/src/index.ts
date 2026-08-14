import { LabelDocument } from '@witiquetas/label-schema';

// ==========================================
// TEMPLATES
// ==========================================
export interface TemplateDTO {
  id: string;
  name: string;
  scope: 'PLATFORM' | 'CUSTOMER' | 'COMPANY';
  document: LabelDocument;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateDTO {
  name: string;
  scope?: 'PLATFORM' | 'CUSTOMER' | 'COMPANY';
  document: LabelDocument;
}

export interface UpdateTemplateDTO {
  name?: string;
  document?: LabelDocument;
}

// ==========================================
// LOCAL AGENTS & PAIRING
// ==========================================
export type AgentStatus = 'ONLINE' | 'OFFLINE' | 'UNPAIRED' | 'ERROR';

export interface PairAgentRequestDTO {
  pairingCode: string;
  machineName: string;
  os: string;
  architecture: string;
  agentVersion: string;
}

export interface PairAgentResponseDTO {
  success: boolean;
  installationId: string;
  token: string;
  companyId: string;
  companyName: string;
}

export interface AgentHeartbeatRequestDTO {
  installationId: string;
  agentVersion: string;
  printersCount: number;
  localQueueSize: number;
}

export interface AgentHeartbeatResponseDTO {
  acknowledged: boolean;
  serverTime: string;
  pendingJobsCount: number;
}

export interface AgentDTO {
  id: string;
  companyId: string;
  installationId: string;
  machineName: string;
  os: string;
  architecture: string;
  agentVersion: string;
  status: AgentStatus;
  lastSeenAt: string;
  createdAt: string;
}

// ==========================================
// PRINTERS
// ==========================================
export type PrinterProtocol = 'RAW_TCP' | 'SERIAL' | 'USB' | 'SPOOLER';
export type PrinterLanguageCode = 'PPLA' | 'PPLB' | 'ZPL' | 'EPL';

export interface PrinterDTO {
  id: string;
  companyId: string;
  agentId?: string;
  name: string;
  model?: string;
  protocol: PrinterProtocol;
  host?: string;
  port?: number;
  baudRate?: number;
  serialPort?: string;
  language: PrinterLanguageCode;
  dpi: number;
  active: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePrinterDTO {
  name: string;
  model?: string;
  protocol: PrinterProtocol;
  host?: string;
  port?: number;
  baudRate?: number;
  serialPort?: string;
  language: PrinterLanguageCode;
  dpi?: number;
  isDefault?: boolean;
}

// ==========================================
// PRINT JOBS
// ==========================================
export type PrintJobStatus = 'PENDING' | 'DISPATCHED' | 'PRINTING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface CreatePrintJobDTO {
  printerId: string;
  document?: LabelDocument;
  compiledCommand?: string;
  language?: PrinterLanguageCode;
  encoding?: string;
  copies?: number;
  data?: Record<string, string>;
}

export interface PrintJobItemDTO {
  jobId: string;
  printerId: string;
  printerName: string;
  protocol: PrinterProtocol;
  host?: string;
  port?: number;
  serialPort?: string;
  baudRate?: number;
  language: string;
  encoding: string;
  payload: string;
  copies: number;
}

export interface PrintJobDTO {
  id: string;
  companyId: string;
  printerId: string;
  printerName: string;
  status: PrintJobStatus;
  language: string;
  encoding: string;
  copies: number;
  payload: string;
  attempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface UpdatePrintJobStatusDTO {
  status: 'PRINTING' | 'SUCCESS' | 'FAILED';
  error?: string;
  executionTimeMs?: number;
}
