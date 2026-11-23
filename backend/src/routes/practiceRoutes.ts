import { json, Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  authenticateToken,
  checkRole,
  requireAccountContext,
  type AuthRequest,
} from '../middleware/auth';
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

import {
  finalizePracticeDraft,
  listPracticeDrafts,
  putPracticeDraft,
  readPracticeDraft,
} from '../controllers/practiceDraftController';

import {
  acknowledgePracticeShare,
  disablePracticeRecommendation,
  dismissPracticeRecommendation,
  recommendPractice,
} from '../controllers/practiceFeedbackController';

const draftIpLimiter = rateLimit({ windowMs: 900_000, limit: 300 });
const draftAccountLimiter = rateLimit({
  windowMs: 900_000,
  limit: 60,
  keyGenerator: (req: AuthRequest) => req.user!.id,
});
export const practiceDraftWriteRouter = Router();
practiceDraftWriteRouter.put(
  '/:id',
  draftIpLimiter,
  authenticateToken,
  requireAccountContext,
  draftAccountLimiter,
  json({ limit: '1450kb' }),
  putPracticeDraft,
);

export const practiceRouter = Router();
practiceRouter.get('/catalog', (_req, res) => res.json(practiceCatalog));
practiceRouter.use(authenticateToken, requireAccountContext);
practiceRouter.get('/drafts', listPracticeDrafts);
practiceRouter.get('/drafts/:id', readPracticeDraft);
practiceRouter.post('/drafts/:id/finalize', finalizePracticeDraft);
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
practiceRouter.put('/shares/:id/recommendation-permission', disablePracticeRecommendation);
practiceRouter.put('/shares/:id/recommendation/dismissal', dismissPracticeRecommendation);

export const therapistPracticeRouter = Router();
therapistPracticeRouter.use(authenticateToken, requireAccountContext, checkRole(['THERAPIST']));
therapistPracticeRouter.get('/', listIncomingShares);
therapistPracticeRouter.get('/session', (_req, res) => res.sendStatus(204));
therapistPracticeRouter.get('/:id', readIncomingShare);
therapistPracticeRouter.get('/:id/works/:workId/image', readSharedImage);

therapistPracticeRouter.put('/:id/acknowledgement', acknowledgePracticeShare);
therapistPracticeRouter.put('/:id/recommendation', recommendPractice);
