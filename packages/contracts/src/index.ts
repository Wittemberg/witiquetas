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
// BIBLIOTECA DE QR CODES REUTILIZÁVEIS
// ==========================================
export interface QRCodeLibraryItemDTO {
  id: string;
  companyId: string;
  name: string;
  url: string;
  favorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQRCodeDTO {
  name: string;
  url: string;
  favorite?: boolean;
}

export interface UpdateQRCodeDTO {
  name?: string;
  url?: string;
  favorite?: boolean;
}

// ==========================================
// MATRIZ DE CAPACIDADES E FONTES DE IMPRESSORAS
// ==========================================
export type FontCompatibilityStatus = 'NATIVE' | 'COMPATIBLE' | 'LIMITED' | 'INCOMPATIBLE';

export interface PrinterCapabilitiesDTO {
  nativeFonts: string[];
  supportedFonts: string[];
  maxWidthMm: number;
  maxDpi: number;
  supportsQrCode: boolean;
  supportsEan13: boolean;
  supportsCode128: boolean;
  supportsImages: boolean;
  notes?: string;
}

export interface PrinterProfileDTO {
  id: string;
  manufacturer: string;
  model: string;
  dpi: number;
  language: 'PPLA' | 'PPLB' | 'ZPL';
  capabilities: PrinterCapabilitiesDTO;
  isHomologated: boolean;
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
  capabilities?: PrinterCapabilitiesDTO;
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

// ==========================================
// PAYLOADS COMPILADOS FINAIS (FASE 3 AGENT LOCAL)
// ==========================================
export interface CompiledPrintPayload {
  language: 'PPLB' | 'PPLA' | 'ZPL' | 'EPL';
  encoding: 'windows-1252' | 'utf-8' | 'ascii' | 'binary';
  payloadBase64: string; // Representação segura em Base64 dos bytes finais compilados
  payloadBytesLength: number; // Quantidade exata de bytes binários
  checksumSha256: string; // Hash SHA-256 dos bytes finais para integridade e idempotência
  copies: number;
  dpi: 203 | 300 | 600;
  metadata: {
    templateTitle?: string;
    hasBinaryGraphics?: boolean;
    dimensionsMm: {
      width: number;
      height: number;
      gap?: number;
    };
  };
}

// ==========================================
// BIBLIOTECA DE IMAGENS & RECURSOS GRÁFICOS MULTINICHO
// ==========================================
export type ImageAssetCategory = 'LOGO' | 'SEAL' | 'PICTOGRAM' | 'CERTIFICATION' | 'ICON' | 'OTHER';

export interface ImageLibraryItemDTO {
  id: string;
  companyId: string;
  name: string; // Nome obrigatório (ex: "Logo Hospital", "Selo Orgânico")
  category: ImageAssetCategory;
  url: string;
  originalFilename?: string;
  mimeType: string;
  fileSizeBytes: number;
  widthPx: number;
  heightPx: number;
  hashSha256: string; // Deduplicação por hash
  createdAt: string;
  updatedAt: string;
}

export interface CreateImageLibraryItemDTO {
  name: string;
  category?: ImageAssetCategory;
  url: string;
  originalFilename?: string;
  mimeType: string;
  fileSizeBytes: number;
  widthPx: number;
  heightPx: number;
  hashSha256: string;
}
