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
} from './controllers/orgController';
import { getNotifications, markAsRead } from './controllers/notificationController';
import { getPatients, updateTherapistAccess } from './controllers/therapistController';
import { getLeaderboard } from './controllers/leaderboardController';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { authenticateToken, isAdmin, isOrgAdmin, isTherapist } from './middleware/auth';
import { updateStreak } from './middleware/gamification';
import { globalErrorHandler } from './middleware/errorHandler';

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());

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
  message: { error: 'Too many requests, please try again later.' },
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

// Swagger Documentation — never expose the API docs in production.
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Auth
app.post('/api/register', register);
app.post('/api/login', login);
app.post('/api/logout', logout);
app.get('/api/profile', authenticateToken, updateStreak, getProfile);
app.put('/api/profile', authenticateToken, updateStreak, updateProfile);
app.post('/api/profile/analysis', authenticateToken, generateProfileAnalysis);

// B2B Org
app.post('/api/org/create', authenticateToken, isAdmin, createOrg);
app.post('/api/org/join', authenticateToken, joinOrg);
app.get('/api/org/stats', authenticateToken, isOrgAdmin, getOrgStats);
app.get('/api/org/peer-support', authenticateToken, getPeerSupport);
app.post('/api/org/peer-support', authenticateToken, postPeerSupport);

// Therapist
app.get('/api/therapist/patients', authenticateToken, isTherapist, getPatients);
app.put('/api/profile/therapist-access', authenticateToken, updateTherapistAccess);

// Courses
app.get('/api/courses', getAllCourses);
app.get('/api/courses/:slug', getCourseBySlug);
app.post('/api/courses/:courseSlug/progress', authenticateToken, updateStreak, updateProgress);
app.post('/api/homework', authenticateToken, updateStreak, submitHomework);

// AI
app.post('/api/chat', authenticateToken, updateStreak, chat);
app.post('/api/chat/stream', authenticateToken, updateStreak, chatStream);
app.get('/api/ai/sessions', authenticateToken, getSessions);
app.get('/api/ai/history/:sessionId', authenticateToken, getChatHistory);
app.post('/api/analyze-image', authenticateToken, updateStreak, analyzeImage);

// Diary
app.post('/api/diary', authenticateToken, updateStreak, createDiaryEntry);
app.get('/api/diary', authenticateToken, getDiaryEntries);
app.put('/api/diary/:id', authenticateToken, updateStreak, updateDiaryEntry);
app.delete('/api/diary/:id', authenticateToken, deleteDiaryEntry);

// Analytics & Social
app.get('/api/leaderboard', getLeaderboard);
app.get('/api/analytics/mood', authenticateToken, getMoodStats);
app.get('/api/analytics/correlations', authenticateToken, getCorrelations);
app.get('/api/challenges', authenticateToken, getChallenges);
app.post('/api/challenges/join', authenticateToken, joinChallenge);
app.post('/api/challenges/complete', authenticateToken, completeChallenge);
app.get('/api/gallery', getPublicGallery);
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
app.get('/api/admin/submissions', authenticateToken, isAdmin, getSubmissions);
app.post('/api/admin/submissions/grade', authenticateToken, isAdmin, gradeSubmission);

app.use(globalErrorHandler);

export default app;

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });
}
