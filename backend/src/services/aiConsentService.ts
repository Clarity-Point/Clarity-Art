import prisma from '../config/prisma';
import { AI_REQUIRES_CONSENT } from '../config/ai';

export async function canUseConfiguredAI(userId: string): Promise<boolean> {
  if (!AI_REQUIRES_CONSENT) return true;
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { aiDataConsentAt: true },
  });
  return Boolean(profile?.aiDataConsentAt);
}
