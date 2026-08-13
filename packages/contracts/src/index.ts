import { LabelDocument } from '@witiquetas/label-schema';

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
