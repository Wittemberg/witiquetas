import { getCsrfToken } from '../auth/session';

export interface CompanyDTO {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoleDTO {
  id: string;
  companyId: string;
  code: string;
  name: string;
  description?: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  permissions?: string[];
  userCount?: number;
}

export interface UserDTO {
  id: string;
  companyId: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  roles: RoleDTO[];
}

export interface PermissionCatalogItem {
  code: string;
  name: string;
  description: string;
  category: string;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
  }

  const res = await fetch(`/api/admin${endpoint}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData.error || errorData.message || `Erro ${res.status} ao processar requisição.`;
    const err = new Error(message);
    (err as any).code = errorData.code;
    (err as any).status = res.status;
    (err as any).details = errorData;
    throw err;
  }

  return res.json();
}

export const AdminApi = {
  // Empresa
  async fetchCompany(): Promise<CompanyDTO> {
    return request<CompanyDTO>('/company');
  },

  async updateCompany(data: { name: string }): Promise<CompanyDTO> {
    return request<CompanyDTO>('/company', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Permissões
  async fetchPermissions(): Promise<PermissionCatalogItem[]> {
    return request<PermissionCatalogItem[]>('/permissions');
  },

  // Usuários
  async listUsers(): Promise<UserDTO[]> {
    return request<UserDTO[]>('/users');
  },

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    status?: 'ACTIVE' | 'INACTIVE';
    roleIds?: string[];
  }): Promise<UserDTO> {
    return request<UserDTO>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getUser(id: string): Promise<UserDTO> {
    return request<UserDTO>(`/users/${encodeURIComponent(id)}`);
  },

  async updateUser(
    id: string,
    data: {
      name?: string;
      email?: string;
      status?: 'ACTIVE' | 'INACTIVE';
      roleIds?: string[];
    }
  ): Promise<UserDTO> {
    return request<UserDTO>(`/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async resetUserPassword(id: string, newPassword: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/users/${encodeURIComponent(id)}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  },

  async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // Perfis (Roles)
  async listRoles(): Promise<RoleDTO[]> {
    return request<RoleDTO[]>('/roles');
  },

  async createRole(data: {
    code: string;
    name: string;
    description?: string;
    permissions?: string[];
  }): Promise<RoleDTO> {
    return request<RoleDTO>('/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getRole(id: string): Promise<RoleDTO> {
    return request<RoleDTO>(`/roles/${encodeURIComponent(id)}`);
  },

  async updateRole(
    id: string,
    data: { name?: string; description?: string }
  ): Promise<RoleDTO> {
    return request<RoleDTO>(`/roles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async updateRolePermissions(
    id: string,
    permissions: string[]
  ): Promise<{ roleId: string; permissions: string[] }> {
    return request<{ roleId: string; permissions: string[] }>(`/roles/${encodeURIComponent(id)}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    });
  },

  async deleteRole(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/roles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // Nichos
  async fetchNiches(): Promise<NicheAdminItemDTO[]> {
    return request<NicheAdminItemDTO[]>('/niches');
  },

  async updateNiches(
    niches: { nicheId: string; enabled: boolean }[],
    defaultNicheId?: string
  ): Promise<any[]> {
    return request<any[]>('/niches', {
      method: 'PUT',
      body: JSON.stringify({ niches, defaultNicheId }),
    });
  },

  // Elementos Visuais por Nicho
  async fetchNicheElements(nicheId: string): Promise<ElementAdminItemDTO[]> {
    return request<ElementAdminItemDTO[]>(`/niches/${encodeURIComponent(nicheId)}/elements`);
  },

  async updateNicheElements(
    nicheId: string,
    elements: { elementType: string; enabled: boolean }[]
  ): Promise<any[]> {
    return request<any[]>(`/niches/${encodeURIComponent(nicheId)}/elements`, {
      method: 'PUT',
      body: JSON.stringify({ elements }),
    });
  },

  // Campos Canônicos de Dados por Nicho
  async fetchNicheFields(nicheId: string): Promise<FieldAdminItemDTO[]> {
    return request<FieldAdminItemDTO[]>(`/niches/${encodeURIComponent(nicheId)}/fields`);
  },

  async updateNicheFields(
    nicheId: string,
    fields: {
      fieldId: string;
      enabled?: boolean;
      availableForManual?: boolean;
      availableForIntegration?: boolean;
    }[]
  ): Promise<any[]> {
    return request<any[]>(`/niches/${encodeURIComponent(nicheId)}/fields`, {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    });
  },

  // Preview de Configuração Efetiva
  async fetchEffectivePreview(): Promise<any> {
    return request<any>('/niches/effective-preview');
  },

  // Nichos por Papel (Role Niches)
  async fetchRoleNiches(roleId: string): Promise<{ roleId: string; nicheAccess: Record<string, boolean> }> {
    return request<{ roleId: string; nicheAccess: Record<string, boolean> }>(`/roles/${encodeURIComponent(roleId)}/niches`);
  },

  async updateRoleNiches(
    roleId: string,
    nicheAccess: Record<string, boolean>
  ): Promise<{ roleId: string; nicheAccess: Record<string, boolean> }> {
    return request<{ roleId: string; nicheAccess: Record<string, boolean> }>(`/roles/${encodeURIComponent(roleId)}/niches`, {
      method: 'PUT',
      body: JSON.stringify({ nicheAccess }),
    });
  },
};

export interface NicheAdminItemDTO {
  id: string;
  name: string;
  description: string;
  tagline?: string;
  enabled: boolean;
  isDefault: boolean;
}

export interface ElementAdminItemDTO {
  elementType: string;
  name: string;
  enabled: boolean;
}

export interface FieldAdminItemDTO {
  fieldId: string;
  name: string;
  description: string;
  type: string;
  isSystem: boolean;
  enabled: boolean;
  availableForManual: boolean;
  availableForIntegration: boolean;
}
