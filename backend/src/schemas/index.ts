import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().trim().max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const deleteAccountSchema = z.object({ password: z.string().min(1).max(128) });

// Nullability mirrors the Prisma Profile model: columns declared `String?` / `Int?`
// legitimately come back as null from GET /api/profile, and the client echoes that
// payload back on update — so they must accept null, not just undefined.
export const profileUpdateSchema = z.object({
  name: z.string().trim().max(120).nullish(),
  age: z.number().int().min(0).max(130).nullish(),
  category: z.enum(['adult', 'child', 'svo_participant', 'general']).optional(),
  therapyGoals: z.string().max(5_000).nullish(),
  mainConcerns: z.string().max(5_000).nullish(),
  preferredStyle: z.string().max(500).optional(),
  interests: z.array(z.string().trim().max(100)).max(50).optional(),
  preferences: z.string().max(5_000).nullish(),
  additionalInfo: z.string().max(5_000).nullish(),
  sleepHours: z.number().min(0).max(24).nullish(),
  stepsCount: z.number().int().min(0).max(500_000).nullish(),
  heartRateAvg: z.number().int().min(20).max(250).nullish(),
  isSharedWithTherapist: z.boolean().optional(),
});

export const progressSchema = z.object({
  progress: z.number().min(0).max(100),
  lastAccessed: z.string().optional(),
  completedLessons: z.array(z.string().trim().min(1).max(300)).max(500).optional(),
});

export const homeworkSubmissionSchema = z.object({
  homeworkId: z.string().uuid(),
  submittedContent: z.string().min(1),
});

export const gradeSubmissionSchema = z.object({
  userId: z.string().uuid(),
  homeworkId: z.string().uuid(),
  grade: z.string().trim().min(1).max(100),
  analysisText: z.string().trim().max(5_000).optional(),
});

export const challengeActionSchema = z.object({ challengeId: z.string().uuid() });
export const organizationCreateSchema = z.object({ name: z.string().trim().min(2).max(120) });
export const organizationJoinSchema = z.object({
  inviteCode: z.string().trim().min(4).max(40),
});
export const peerSupportSchema = z.object({ content: z.string().trim().min(1).max(1_500) });
export const galleryVisibilitySchema = z.object({
  id: z.string().uuid(),
  isPublic: z.boolean(),
});
export const healthMetricSchema = z
  .object({
    heartRate: z.number().int().min(20).max(250).optional(),
    heartRateAvg: z.number().int().min(20).max(250).optional(),
    sleepHours: z.number().min(0).max(24).optional(),
    stepsCount: z.number().int().min(0).max(500_000).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'At least one health metric is required',
  });
