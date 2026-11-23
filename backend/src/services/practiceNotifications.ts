import type { Prisma } from '@prisma/client';

export const practiceShareNotice = 'practice_share';
export const practiceRecommendationNotice = 'practice_recommendation';

export const activePracticeShare = {
  revokedAt: null,
  items: { some: {} },
} satisfies Prisma.PracticeShareWhereInput;

export function recipientScope(therapistId: string) {
  return {
    ...activePracticeShare,
    therapistId,
    therapist: { role: 'THERAPIST' },
  } satisfies Prisma.PracticeShareWhereInput;
}
export function recommendationScope(ownerId: string) {
  return {
    ...activePracticeShare,
    ownerId,
    therapist: { role: 'THERAPIST' },
    allowRecommendation: true,
    recommendedPracticeId: { not: null },
    recommendationDismissedAt: null,
  } satisfies Prisma.PracticeShareWhereInput;
}

export function notificationVisibility(userId: string): Prisma.NotificationWhereInput {
  return {
    userId,
    OR: [
      { practiceShareId: null },
      { type: practiceShareNotice, practiceShare: recipientScope(userId) },
      { type: practiceRecommendationNotice, practiceShare: recommendationScope(userId) },
    ],
  };
}

export async function notifyPractice(
  tx: Prisma.TransactionClient,
  userId: string,
  practiceShareId: string,
  type: typeof practiceShareNotice | typeof practiceRecommendationNotice,
) {
  if (process.env.PRACTICE_FEEDBACK_NOTIFICATIONS !== 'true') return;
  const incoming = type === practiceShareNotice;
  await tx.notification.createMany({
    data: [
      {
        userId,
        practiceShareId,
        type,
        title: incoming ? 'Новая подборка к встрече' : 'Предложена творческая практика',
        message: incoming
          ? 'Откройте подборки в кабинете специалиста.'
          : 'Откройте отправленные подборки в альбоме.',
      },
    ],
    skipDuplicates: true,
  });
}
