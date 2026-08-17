import type { LabelDocument } from '@witiquetas/label-schema';

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
// ==========================================
// LOCAL AGENTS & PAIRING (AGENT PROTOCOL V1)
// ==========================================
export type AgentStatus = 'ONLINE' | 'OFFLINE' | 'UNPAIRED' | 'DEGRADED' | 'REVOKED';
export type AgentServiceMode = 'SERVICE' | 'STANDALONE_CLI' | 'DESKTOP_SYSTRAY';
export type AgentOperatingSystem = 'windows' | 'linux' | 'macos' | 'freebsd' | 'unknown';
export type AgentArchitecture = 'x86_64' | 'aarch64' | 'armv7' | 'x86' | 'unknown';

export type AgentMessageType =
  | 'AGENT_HANDSHAKE'
  | 'AGENT_HEARTBEAT'
  | 'JOB_CLAIM_REQUEST'
  | 'JOB_CLAIM_RESPONSE'
  | 'JOB_STATUS_UPDATE'
  | 'PRINTERS_DISCOVERY_REPORT'
  | 'TELEMETRY_LOG';

export interface AgentMessageEnvelope<T = unknown> {
  protocolVersion: 1;
  messageId: string;
  agentId: string;
  installationId: string;
  timestamp: string;
  type: AgentMessageType;
  payload: T;
}

export interface PairAgentRequestDTO {
  pairingCode: string;
  machineName: string;
  os: AgentOperatingSystem;
  osVersion?: string;
  architecture: AgentArchitecture;
  agentVersion: string;
  protocolVersion: 1;
}

export interface PairAgentResponseDTO {
  success: boolean;
  agentId: string;
  installationId: string;
  token: string;
  companyId: string;
  companyName: string;
  serverTime: string;
}

export interface AgentHeartbeatRequestDTO {
  protocolVersion: 1;
  agentId: string;
  installationId: string;
  agentVersion: string;
  status: AgentStatus;
  uptimeSeconds: number;
  memoryUsageMb: number;
  printersCount: number;
  localQueueSize: number;
  activeJobsCount: number;
}

export interface AgentHeartbeatResponseDTO {
  acknowledged: boolean;
  serverTime: string;
  pendingJobsCount: number;
  pollIntervalSeconds: number; // Intervalo sugerido com jitter aplicado pelo servidor
  mustReportCapabilities?: boolean;
}

export interface DiscoveredPrinterDTO {
  printerIdLocal: string;
  name: string;
  transportType: TransportType;
  address: string; // Ex: "192.168.1.150:9100", "COM1", "\\\\localhost\\Argox_OS214"
  driver?: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY' | 'PAPER_OUT' | 'ERROR' | 'UNKNOWN';
  dpi?: 203 | 300 | 600;
  supportedLanguages?: Array<'PPLB' | 'PPLA' | 'ZPL' | 'EPL'>;
  isDefault?: boolean;
}

export interface AgentCapabilitiesReportDTO {
  protocolVersion: 1;
  agentId: string;
  installationId: string;
  agentVersion: string;
  os: AgentOperatingSystem;
  osVersion: string;
  architecture: AgentArchitecture;
  serviceMode: AgentServiceMode;
  transports: TransportType[];
  printers: DiscoveredPrinterDTO[];
  features: {
    canQueryStatus: boolean;
    supportsLocalSpooling: boolean;
    maxPayloadBytes: number;
  };
}

export interface AgentDTO {
  id: string;
  companyId: string;
  installationId: string;
  machineName: string;
  os: AgentOperatingSystem;
  architecture: AgentArchitecture;
  agentVersion: string;
  status: AgentStatus;
  lastSeenAt: string;
  createdAt: string;
  capabilities?: AgentCapabilitiesReportDTO;
}

// ==========================================
// PRINTERS & TRANSPORT TYPES
// ==========================================
export type TransportType = 'RAW_TCP' | 'WINDOWS_SPOOLER' | 'CUPS' | 'SERIAL' | 'USB_DIRECT';
export type PrinterProtocol = TransportType; // Alias retrocompatível
export type PrinterLanguageCode = 'PPLA' | 'PPLB' | 'ZPL' | 'EPL';
export type CopyStrategy = 'EMBEDDED_IN_PAYLOAD' | 'TRANSPORT_REPEAT';

export interface PrinterDTO {
  id: string;
  companyId: string;
  agentId?: string;
  name: string;
  model?: string;
  protocol: TransportType;
  host?: string;
  port?: number;
  baudRate?: number;
  serialPort?: string;
  spoolerName?: string;
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
  protocol: TransportType;
  host?: string;
  port?: number;
  baudRate?: number;
  serialPort?: string;
  spoolerName?: string;
  language: PrinterLanguageCode;
  dpi?: number;
  isDefault?: boolean;
}

// ==========================================
// PRINT JOBS & SEMÂNTICA FÍSICA DE ENTREGA
// ==========================================
export type PrintJobDeliveryStatus =
  | 'PENDING'
  | 'CLAIMED'
  | 'DOWNLOADED'
  | 'DELIVERING'
  | 'DELIVERED_TO_TRANSPORT'
  | 'PRINTED'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNKNOWN_RESULT'
  | 'EXPIRED_LEASE';

export type PrintJobStatus = PrintJobDeliveryStatus; // Alias compatível

export interface CreatePrintJobDTO {
  printerId: string;
  document?: LabelDocument;
  compiledCommand?: string;
  language?: PrinterLanguageCode;
  encoding?: string;
  copies?: number;
  data?: Record<string, string>;
}

export interface PrintJobClaimRequestDTO {
  protocolVersion: 1;
  agentId: string;
  installationId: string;
  maxJobs?: number;
  availableTransports?: TransportType[];
}

export interface PrintJobClaimResponseDTO {
  hasJob: boolean;
  job?: PrintJobDTO;
  serverTime: string;
}

export interface PrintJobLeaseDTO {
  leaseId: string;
  jobId: string;
  claimedByAgentId: string;
  leaseExpiresAt: string;
  attemptId: string;
}

export interface PrintJobItemDTO {
  jobId: string;
  leaseId?: string;
  attemptId?: string;
  printerId: string;
  printerName: string;
  protocol: TransportType;
  host?: string;
  port?: number;
  serialPort?: string;
  baudRate?: number;
  spoolerName?: string;
  language: string;
  encoding: string;
  payload: string; // Para backwards compatibility
  payloadBase64?: string;
  payloadBytesLength?: number;
  checksumSha256?: string;
  copyStrategy?: CopyStrategy;
  copies: number;
}

export interface PrintJobDTO {
  id: string;
  companyId: string;
  printerId: string;
  printerName: string;
  status: PrintJobDeliveryStatus;
  language: string;
  encoding: string;
  copies: number;
  copyStrategy: CopyStrategy;
  payload: string; // String para compatibilidade legada
  payloadBase64: string; // Representação Base64 oficial dos bytes finais compilados
  payloadBytesLength: number;
  checksumSha256: string; // Hash SHA-256 de integridade
  attempts: number;
  maxAttempts: number;
  leaseId?: string;
  claimedByAgentId?: string;
  claimedAt?: string;
  leaseExpiresAt?: string;
  attemptId?: string;
  error?: string;
  executionTimeMs?: number;
  deliveredToTransportAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface UpdatePrintJobStatusDTO {
  protocolVersion?: 1;
  agentId?: string;
  leaseId?: string;
  attemptId?: string;
  status: PrintJobDeliveryStatus;
  error?: string;
  bytesSent?: number;
  totalBytes?: number;
  executionTimeMs?: number;
  hardwareTelemetry?: {
    rawStatusResponse?: string;
    paperStatus?: 'OK' | 'PAPER_OUT' | 'JAM' | 'UNKNOWN';
    headStatus?: 'OK' | 'OPEN' | 'OVERHEAT' | 'UNKNOWN';
  };
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
  copyStrategy: CopyStrategy;
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

// ==========================================
// UTILITÁRIOS DE CODIFICAÇÃO TÉRMICA (WINDOWS-1252 / UTF-8 / ASCII)
// ==========================================
export * from './encoding.js';


