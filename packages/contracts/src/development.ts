export type DevelopmentStatus =
  | 'PLANNED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'IMPLEMENTED'
  | 'VALIDATION'
  | 'HOMOLOGATED'
  | 'FROZEN'
  | 'BLOCKED'
  | 'UNMAPPED';

export type ProjectHealthStatus = 'HEALTHY' | 'ATTENTION' | 'BLOCKED' | 'UNKNOWN';

export interface DevelopmentProject {
  projectId: string;
  name: string;
  description: string;
  currentPhase: string;
  mvpTarget: string;
  roadmapVersion: number;
  lastReviewedAt: string;
  environment: string;
}

export interface DevelopmentCapability {
  id: string;
  name: string;
  description: string;
  module: string;
  weight: number;
  mvp: boolean;
  status: DevelopmentStatus;
  manualValidation: boolean;
  physicalValidation: boolean;
  frozen: boolean;
  evidence?: string[];
  dependencies?: string[];
  notes?: string[];
}

export interface DevelopmentPhase {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: DevelopmentStatus;
  capabilities: DevelopmentCapability[];
}

export interface DevelopmentCheckpoint {
  sha: string;
  shortSha: string;
  date: string;
  phase: string;
  patch?: string;
  title: string;
  type: 'FEATURE' | 'FIX' | 'HOTFIX' | 'INFRA' | 'UX';
  capabilities: string[];
  testsPassed: boolean;
  deployed: boolean;
  manualValidation: boolean;
}

export interface DevelopmentModuleProgress {
  id: string;
  name: string;
  description: string;
  totalCapabilities: number;
  implementedCapabilities: number;
  homologatedCapabilities: number;
  totalWeight: number;
  implementedWeight: number;
  homologatedWeight: number;
  implementationPercent: number;
  homologationPercent: number;
  status: DevelopmentStatus;
}

export interface DevelopmentProgressBreakdown {
  implementedWeight: number;
  homologatedWeight: number;
  totalWeight: number;
  implementationPercent: number;
  readinessPercent: number;
}

export interface DevelopmentProgressMetrics {
  mvp: DevelopmentProgressBreakdown;
  fullRoadmap: DevelopmentProgressBreakdown;
  countsByStatus: Record<DevelopmentStatus, number>;
  totalCapabilities: number;
}

export interface ProjectHealthDimension {
  name: string;
  status: ProjectHealthStatus;
  details: string;
}

export interface ProjectHealthOverview {
  overall: ProjectHealthStatus;
  dimensions: {
    code: ProjectHealthDimension;
    tests: ProjectHealthDimension;
    build: ProjectHealthDimension;
    deployment: ProjectHealthDimension;
    documentation: ProjectHealthDimension;
    manualValidation: ProjectHealthDimension;
    physicalValidation: ProjectHealthDimension;
    technicalDebt: ProjectHealthDimension;
  };
}

export interface FrozenComponentInfo {
  id: string;
  name: string;
  description: string;
  frozenSincePatch: string;
  reason: string;
}

export interface DevelopmentOverviewDTO {
  project: DevelopmentProject;
  progress: DevelopmentProgressMetrics;
  currentPhase: {
    code: string;
    name: string;
    status: DevelopmentStatus;
  };
  lastCheckpoint?: DevelopmentCheckpoint;
  modules: DevelopmentModuleProgress[];
  health: ProjectHealthOverview;
  frozenComponents: FrozenComponentInfo[];
  phases?: DevelopmentPhase[];
}
