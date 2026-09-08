import {
  Home,
  LayoutTemplate,
  PlusSquare,
  ListOrdered,
  Printer,
  Cpu,
  Plug,
  Settings,
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
 * Resolver único e canônico da navegação do frontend comercial do tenant (Hotfix 5.3.2).
 * Exibe EXCLUSIVAMENTE os módulos disponíveis para o tenant conforme suas permissões.
 *
 * DCC é ferramenta interna da PLATAFORMA e NUNCA aparece na navegação de tenant (nem mesmo para ADMIN).
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

  return items;
}
