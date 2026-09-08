import {
  Home,
  LayoutTemplate,
  PlusSquare,
  ListOrdered,
  Printer,
  Cpu,
  Plug,
  Settings,
  Gauge,
  type LucideIcon,
} from 'lucide-react';
import type { SessionContext } from '../auth/session.js';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  path: string;
}

export const BASE_NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'Dashboard',
    icon: Home,
    description: 'Painel principal e visões gerais',
    path: '/',
  },
  {
    id: 'models',
    label: 'Meus Modelos',
    icon: LayoutTemplate,
    description: 'Gerenciador de modelos de etiquetas',
    path: '/models',
  },
  {
    id: 'new',
    label: 'Nova Etiqueta',
    icon: PlusSquare,
    description: 'Criar novo modelo assistido pelo Wizard',
    path: '/new',
  },
  {
    id: 'print-center',
    label: 'Central de Impressão',
    icon: ListOrdered,
    description: 'Central de Impressão de Etiquetas',
    path: '/print-center',
  },
  {
    id: 'printers',
    label: 'Impressoras',
    icon: Printer,
    description: 'Gestão de impressoras térmicas',
    path: '/printers',
  },
  {
    id: 'agents',
    label: 'Agents de Impressão',
    icon: Cpu,
    description: 'Status e gerenciamento de agentes locais',
    path: '/agents',
  },
  {
    id: 'integrations',
    label: 'Integrações',
    icon: Plug,
    description: 'Conectores ERP e integrações',
    path: '/integrations',
  },
  {
    id: 'admin',
    label: 'Administração',
    icon: Settings,
    description: 'Gestão de Empresa, Usuários e Perfis de Acesso',
    path: '/admin',
  },
];

/**
 * Resolver único e canônico da navegação do frontend (Seção 15 do Pacote 5.3.1).
 * Decide quais itens são visíveis tanto no Menu Lateral (Sidebar) quanto no Dashboard.
 */
export function getEffectiveNavigation(sessionContext: SessionContext | null): NavItem[] {
  if (!sessionContext) {
    return [];
  }

  const permissions = sessionContext.permissions || [];
  const hasWildcard = permissions.includes('*');

  const checkPerm = (perm: string) => hasWildcard || permissions.includes(perm);
  const checkAny = (perms: string[]) => hasWildcard || perms.some((p) => permissions.includes(p));

  const items: NavItem[] = [];

  for (const item of BASE_NAV_ITEMS) {
    if (item.id === 'home') {
      items.push(item);
    } else if (item.id === 'models') {
      if (checkPerm('templates.view')) items.push(item);
    } else if (item.id === 'new') {
      if (checkPerm('templates.create')) items.push(item);
    } else if (item.id === 'print-center') {
      if (checkAny(['print.execute', 'print.history'])) items.push(item);
    } else if (item.id === 'printers') {
      if (checkAny(['printers.view', 'printers.manage'])) items.push(item);
    } else if (item.id === 'agents') {
      if (checkAny(['agents.view', 'agents.manage'])) items.push(item);
    } else if (item.id === 'integrations') {
      if (checkAny(['integrations.view', 'integrations.manage'])) items.push(item);
    } else if (item.id === 'admin') {
      if (
        checkAny([
          'company.view',
          'company.manage',
          'users.view',
          'users.manage',
          'roles.view',
          'roles.manage',
        ])
      ) {
        items.push(item);
      }
    }
  }

  // DCC / DESENVOLVIMENTO (Seções 8, 9, 10, 11 e P0.1)
  // Regra efetiva: DCC_ENABLED && is_dcc_master && devcontrol.view
  const isMaster = Boolean(sessionContext.user?.isDccMaster);
  const dccEnabled =
    sessionContext.dccEnabled !== undefined ? sessionContext.dccEnabled : true;
  const canAccessDcc =
    sessionContext.canAccessDcc !== undefined
      ? sessionContext.canAccessDcc
      : dccEnabled && isMaster && checkPerm('devcontrol.view');

  if (canAccessDcc) {
    items.push({
      id: 'development',
      label: 'Desenvolvimento',
      icon: Gauge,
      description: 'Development Control Center (Governança e Homologação)',
      path: '#development',
    });
  }

  return items;
}
