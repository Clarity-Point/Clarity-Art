import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Nullability mirrors the Prisma Profile model: columns declared `String?` / `Int?`
// legitimately come back as null from GET /api/profile, and the client echoes that
// payload back on update — so they must accept null, not just undefined.
export const profileUpdateSchema = z.object({
  name: z.string().nullish(),
  age: z.number().int().nullish(),
  category: z.string().optional(),
  therapyGoals: z.string().nullish(),
  mainConcerns: z.string().nullish(),
  preferredStyle: z.string().optional(),
  interests: z.array(z.string()).optional(),
  preferences: z.string().nullish(),
  additionalInfo: z.string().nullish(),
  sleepHours: z.number().nullish(),
  stepsCount: z.number().int().nullish(),
  heartRateAvg: z.number().int().nullish(),
  isSharedWithTherapist: z.boolean().optional(),
});

export const progressSchema = z.object({
  progress: z.number().min(0).max(100),
  lastAccessed: z.string().optional(),
});

export const homeworkSubmissionSchema = z.object({
  homeworkId: z.string().uuid(),
  submittedContent: z.string().min(1),
});

export const gradeSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  grade: z.string().optional(),
  analysisText: z.string().optional(),
});
