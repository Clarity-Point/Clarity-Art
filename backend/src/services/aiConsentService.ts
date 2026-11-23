import prisma from '../config/prisma';
import { AI_CONSENT_POLICY, AI_REQUIRES_CONSENT } from '../config/ai';

export function hasCurrentAIConsent(
  profile?: {
    aiDataConsentAt?: Date | null;
    aiDataConsentPolicyId?: string | null;
  } | null,
): boolean {
  return Boolean(
    AI_CONSENT_POLICY &&
    profile?.aiDataConsentAt &&
    profile.aiDataConsentPolicyId === AI_CONSENT_POLICY.id,
  );
}

export async function canUseConfiguredAI(userId: string): Promise<boolean> {
  if (!AI_REQUIRES_CONSENT) return true;
  if (!AI_CONSENT_POLICY) return false;
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { aiDataConsentAt: true, aiDataConsentPolicyId: true },
  });
  return hasCurrentAIConsent(profile);
}
