import { Router, type RequestHandler } from 'express';
import { authenticateToken, checkRole, requireExpectedUser } from '../middleware/auth';
import {
  appendReflection,
  completePractice,
  createShare,
  createWork,
  deleteWork,
  listIncomingShares,
  listOutgoingShares,
  listProgress,
  listWorks,
  readIncomingShare,
  readSharedImage,
  readWorkImage,
  revokeShare,
} from '../controllers/practiceController';
import { practiceCatalog } from '../services/practiceCatalog';

const requireAccountContext: RequestHandler = (req, res, next) => {
  if (!req.get('X-Expected-User-Id')) {
    return res.status(400).json({ error: 'Требуется идентификатор открытого аккаунта.' });
  }
  return requireExpectedUser(req, res, next);
};

export const practiceRouter = Router();
practiceRouter.get('/catalog', (_req, res) => res.json(practiceCatalog));
practiceRouter.use(authenticateToken, requireAccountContext);
practiceRouter.get('/session', (_req, res) => res.sendStatus(204));
practiceRouter.get('/progress', listProgress);
practiceRouter.put('/progress/:id', completePractice);
practiceRouter.get('/works', listWorks);
practiceRouter.post('/works', createWork);
practiceRouter.delete('/works/:id', deleteWork);
practiceRouter.post('/works/:id/reflections', appendReflection);
practiceRouter.get('/works/:id/image', readWorkImage);
practiceRouter.get('/shares', listOutgoingShares);
practiceRouter.post('/shares', createShare);
practiceRouter.delete('/shares/:id', revokeShare);

export const therapistPracticeRouter = Router();
therapistPracticeRouter.use(authenticateToken, requireAccountContext, checkRole(['THERAPIST']));
therapistPracticeRouter.get('/', listIncomingShares);
therapistPracticeRouter.get('/session', (_req, res) => res.sendStatus(204));
therapistPracticeRouter.get('/:id', readIncomingShare);
therapistPracticeRouter.get('/:id/works/:workId/image', readSharedImage);
