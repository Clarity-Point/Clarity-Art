import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  generateProfileAnalysis,
  getAIStatus,
  updateAIConsent,
  changePassword,
  logoutAll,
  deleteAccount,
  exportAccountData,
} from './controllers/authController';
import {
  getAllCourses,
  getCourseBySlug,
  updateProgress,
  submitHomework,
} from './controllers/courseController';
import {
  chat,
  analyzeImage,
  chatStream,
  getSessions,
  getChatHistory,
  getStoredImage,
} from './controllers/aiController';
import {
  createDiaryEntry,
  getDiaryEntries,
  updateDiaryEntry,
  deleteDiaryEntry,
} from './controllers/diaryController';
import {
  createCourse,
  updateCourse,
  deleteCourse,
  getStats,
  getSubmissions,
  gradeSubmission,
  createModule,
  deleteModule,
  createLesson,
  deleteLesson,
  createHomework,
  deleteHomework,
} from './controllers/adminController';
import {
  getPublicGallery,
  createHealthMetric,
  togglePublic,
  likePost,
} from './controllers/socialController';
import { exportDiaryPDF } from './controllers/exportController';
import { getMoodStats, getCorrelations } from './controllers/analyticsController';
import { getChallenges, joinChallenge, completeChallenge } from './controllers/challengeController';
import {
  createOrg,
  joinOrg,
  getOrgStats,
  getPeerSupport,
  postPeerSupport,
  leaveOrg,
  rotateInviteCode,
} from './controllers/orgController';
import { getNotifications, markAsRead } from './controllers/notificationController';
import {
  getPatients,
  updateTherapistAccess,
  getAvailableTherapists,
} from './controllers/therapistController';
import { getLeaderboard } from './controllers/leaderboardController';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import {
  authenticateToken,
  isAdmin,
  isOrgAdmin,
  isTherapist,
  requireAIConsent,
} from './middleware/auth';
import { updateStreak } from './middleware/gamification';
import { globalErrorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { logger } from './config/logger';
import prisma from './config/prisma';
import { getHealth } from './controllers/healthController';

const app = express();
const port = Number(process.env.PORT) || 3100;

// Only reverse proxies on the local host/Docker networks are trusted. This
// preserves the client IP through the WAF → nginx → backend chain without
// accepting arbitrary internet-supplied X-Forwarded-For headers.
const configuredTrustProxy = process.env.TRUST_PROXY;
app.set(
  'trust proxy',
  configuredTrustProxy == null
    ? ['loopback', 'linklocal', 'uniquelocal', '172.18.0.0/16']
    : /^\d+$/.test(configuredTrustProxy)
      ? Number(configuredTrustProxy)
      : configuredTrustProxy,
);

app.use(
  helmet({
    // This service returns JSON; the browser-facing CSP is owned by nginx.
    contentSecurityPolicy: false,
    // Do not pin the documented localhost HTTP deployment to HTTPS. Public TLS
    // deployments enable this together with secure cookies.
    hsts: process.env.COOKIE_SECURE === 'true' ? undefined : false,
  }),
);

// Must run before the routes so that every request — including rejected ones —
// gets a correlation id and an access-log line.
app.use(requestLogger);

// CORS configuration - specify your frontend URL in production
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Generous in development (SPA fires several calls per page — a live demo or
  // screenshot pass would otherwise trip the limit); tight in production.
  max: process.env.NODE_ENV === 'production' ? 100 : Number(process.env.RATE_LIMIT_MAX || 5000),
  skip: (req) => req.path === '/health',
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  skipSuccessfulRequests: true,
  message: { error: 'Слишком много неудачных попыток. Повторите позже.' },
});

app.use('/api/', limiter);
// API responses can contain private diary, chat, image and profile data. Do not
// permit browsers, intermediaries or service workers to persist them by default.
app.use('/api/', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(bodyParser.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  res.send('Точка Ясности API is running!');
});
app.get('/api/health', getHealth);

// Liveness probe — deliberately dependency-free so it stays up even when the
// database is down, letting the orchestrator distinguish "process is wedged"
// from "a downstream service is unavailable".
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Readiness probe — reports whether this instance can actually serve traffic.
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', database: 'up' });
  } catch {
    res.status(503).json({ status: 'not-ready', database: 'down' });
  }
});

// Swagger Documentation — never expose the API docs in production.
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Auth
app.post('/api/register', authLimiter, register);
app.post('/api/login', authLimiter, login);
app.post('/api/logout', logout);
app.get('/api/profile', authenticateToken, updateStreak, getProfile);
app.put('/api/profile', authenticateToken, updateStreak, updateProfile);
app.put('/api/account/password', authenticateToken, changePassword);
app.post('/api/account/logout-all', authenticateToken, logoutAll);
app.delete('/api/account', authenticateToken, deleteAccount);
app.get('/api/account/export', authenticateToken, exportAccountData);
app.post('/api/profile/analysis', authenticateToken, requireAIConsent, generateProfileAnalysis);
app.get('/api/ai/status', authenticateToken, getAIStatus);
app.put('/api/profile/ai-consent', authenticateToken, updateAIConsent);

// B2B Org
app.post('/api/org/create', authenticateToken, isAdmin, createOrg);
app.post('/api/org/join', authenticateToken, joinOrg);
app.delete('/api/org/leave', authenticateToken, leaveOrg);
app.post('/api/org/rotate-invite', authenticateToken, isOrgAdmin, rotateInviteCode);
app.get('/api/org/stats', authenticateToken, isOrgAdmin, getOrgStats);
app.get('/api/org/peer-support', authenticateToken, getPeerSupport);
app.post('/api/org/peer-support', authenticateToken, postPeerSupport);

// Therapist
app.get('/api/therapist/patients', authenticateToken, isTherapist, getPatients);
app.get('/api/therapists', authenticateToken, getAvailableTherapists);
app.put('/api/profile/therapist-access', authenticateToken, updateTherapistAccess);

// Courses
app.get('/api/courses', getAllCourses);
app.get('/api/courses/:slug', getCourseBySlug);
app.post('/api/courses/:courseSlug/progress', authenticateToken, updateStreak, updateProgress);
app.post('/api/homework', authenticateToken, updateStreak, submitHomework);

// AI
app.post('/api/chat', authenticateToken, requireAIConsent, updateStreak, chat);
app.post('/api/chat/stream', authenticateToken, requireAIConsent, updateStreak, chatStream);
app.get('/api/ai/sessions', authenticateToken, getSessions);
app.get('/api/ai/history/:sessionId', authenticateToken, getChatHistory);
app.post('/api/analyze-image', authenticateToken, requireAIConsent, updateStreak, analyzeImage);

// Diary
app.post('/api/diary', authenticateToken, updateStreak, createDiaryEntry);
app.get('/api/diary', authenticateToken, getDiaryEntries);
app.put('/api/diary/:id', authenticateToken, updateStreak, updateDiaryEntry);
app.delete('/api/diary/:id', authenticateToken, deleteDiaryEntry);

// Analytics & Social
app.get('/api/leaderboard', authenticateToken, getLeaderboard);
app.get('/api/analytics/mood', authenticateToken, getMoodStats);
app.get('/api/analytics/correlations', authenticateToken, getCorrelations);
app.get('/api/challenges', authenticateToken, getChallenges);
app.post('/api/challenges/join', authenticateToken, joinChallenge);
app.post('/api/challenges/complete', authenticateToken, completeChallenge);
app.get('/api/gallery', authenticateToken, getPublicGallery);
app.get('/api/images/:id', authenticateToken, getStoredImage);
app.post('/api/gallery/like/:id', authenticateToken, likePost);
app.put('/api/gallery/toggle-public', authenticateToken, togglePublic);
app.post('/api/profile/health', authenticateToken, createHealthMetric);
app.get('/api/profile/export-pdf', authenticateToken, exportDiaryPDF);

// Notifications
app.get('/api/notifications', authenticateToken, getNotifications);
app.put('/api/notifications/:id/read', authenticateToken, markAsRead);

// Admin Routes
app.get('/api/admin/stats', authenticateToken, isAdmin, getStats);
app.post('/api/admin/courses', authenticateToken, isAdmin, createCourse);
app.put('/api/admin/courses/:id', authenticateToken, isAdmin, updateCourse);
app.delete('/api/admin/courses/:id', authenticateToken, isAdmin, deleteCourse);
app.post('/api/admin/courses/:courseId/modules', authenticateToken, isAdmin, createModule);
app.delete('/api/admin/modules/:id', authenticateToken, isAdmin, deleteModule);
app.post('/api/admin/modules/:moduleId/lessons', authenticateToken, isAdmin, createLesson);
app.delete('/api/admin/lessons/:id', authenticateToken, isAdmin, deleteLesson);
app.post('/api/admin/courses/:courseId/homework', authenticateToken, isAdmin, createHomework);
app.delete('/api/admin/homework/:id', authenticateToken, isAdmin, deleteHomework);
app.get('/api/admin/submissions', authenticateToken, isAdmin, getSubmissions);
app.post('/api/admin/submissions/grade', authenticateToken, isAdmin, gradeSubmission);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.use(globalErrorHandler);

export default app;

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => {
    logger.info({ port, logLevel: logger.level }, `Backend listening on port ${port}`);
  });

  // Containers are stopped with SIGTERM. Without this the process is killed
  // mid-request and Postgres connections are left dangling.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await prisma.$disconnect().catch(() => {});
      process.exit(0);
    });
    // Never hang a deploy on a stuck keep-alive connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled rejection'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });
}
