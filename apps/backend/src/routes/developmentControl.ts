import { Router, Request, Response, NextFunction } from 'express';
import { DevelopmentControlService } from '../services/developmentControlService.js';

const router = Router();
const service = new DevelopmentControlService();

// Middleware de proteção de ambiente (Seção 3 e 35 das regras)
const devControlGuard = (_req: Request, res: Response, next: NextFunction) => {
  const isDev = process.env.NODE_ENV !== 'production';
  const isExplicitlyEnabled = process.env.ENABLE_DEV_CONTROL_CENTER === 'true' || process.env.VITE_ENABLE_DEV_CONTROL_CENTER === 'true';

  if (!isDev && !isExplicitlyEnabled) {
    res.status(404).json({
      error: 'Módulo indisponível.',
      message: 'O Development Control Center está restrito aos ambientes de desenvolvimento e homologação.',
    });
    return;
  }
  next();
};

import { requireAuthenticatedUser, requirePermission } from '../middleware/authMiddleware.js';

router.use(devControlGuard);
router.use(requireAuthenticatedUser);
router.use(requirePermission('devcontrol.view'));

// GET /api/development-control/overview
router.get('/overview', (_req: Request, res: Response) => {
  try {
    const overview = service.getOverview();
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao gerar visão geral do desenvolvimento.', details: err.message });
  }
});

// GET /api/development-control/roadmap
router.get('/roadmap', (_req: Request, res: Response) => {
  try {
    const phases = service.getPhases();
    res.json({ phases });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar roadmap.', details: err.message });
  }
});

// GET /api/development-control/checkpoints
router.get('/checkpoints', (_req: Request, res: Response) => {
  try {
    const checkpoints = service.getCheckpoints();
    res.json({ checkpoints });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar histórico de checkpoints.', details: err.message });
  }
});

// GET /api/development-control/modules
router.get('/modules', (_req: Request, res: Response) => {
  try {
    const modules = service.getModuleProgressList();
    res.json({ modules });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar progresso dos módulos.', details: err.message });
  }
});

// GET /api/development-control/health
router.get('/health', (_req: Request, res: Response) => {
  try {
    const health = service.getHealth();
    res.json(health);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar visão de saúde do projeto.', details: err.message });
  }
});

export default router;
