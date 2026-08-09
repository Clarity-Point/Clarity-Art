export const MIN_ORG_AGGREGATE_RESPONSES = 8;

export interface OrgSignal {
  userId: string;
  date: Date;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface PrivacySafeOrgAnalytics {
  activeMemberCount: number;
  riskStats: Array<{ riskLevel: OrgSignal['riskLevel']; _count: number }>;
  heatmapData: Record<string, { count: number; totalRisk: number }>;
  trends: Array<{ date: string; _count: number }>;
}

const riskWeight = (riskLevel: OrgSignal['riskLevel']) =>
  riskLevel === 'high' ? 3 : riskLevel === 'medium' ? 2 : 1;

const utcDayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Produces only aggregates backed by at least `minimumGroupSize` distinct users.
 * A prolific individual can therefore never satisfy the privacy threshold by
 * creating many sessions. Each person contributes at most once to each bucket.
 */
export function buildPrivacySafeOrgAnalytics(
  signals: OrgSignal[],
  minimumGroupSize = MIN_ORG_AGGREGATE_RESPONSES,
): PrivacySafeOrgAnalytics {
  const activeMemberCount = new Set(signals.map((signal) => signal.userId)).size;

  const riskUsers = new Map<OrgSignal['riskLevel'], Set<string>>();
  const heatmapUsers = new Map<string, Map<string, number>>();
  const trendUsers = new Map<string, Set<string>>();

  for (const signal of signals) {
    const users = riskUsers.get(signal.riskLevel) ?? new Set<string>();
    users.add(signal.userId);
    riskUsers.set(signal.riskLevel, users);

    // Use UTC consistently so deployment timezone cannot move a session between
    // buckets. Keep only the strongest signal per user in a bucket.
    const heatmapKey = `${signal.date.getUTCDay()}-${signal.date.getUTCHours()}`;
    const perUserRisk = heatmapUsers.get(heatmapKey) ?? new Map<string, number>();
    perUserRisk.set(
      signal.userId,
      Math.max(perUserRisk.get(signal.userId) ?? 0, riskWeight(signal.riskLevel)),
    );
    heatmapUsers.set(heatmapKey, perUserRisk);

    const day = utcDayKey(signal.date);
    const dayUsers = trendUsers.get(day) ?? new Set<string>();
    dayUsers.add(signal.userId);
    trendUsers.set(day, dayUsers);
  }

  const riskStats = [...riskUsers.entries()]
    .filter(([, users]) => users.size >= minimumGroupSize)
    .map(([riskLevel, users]) => ({ riskLevel, _count: users.size }));

  const heatmapData: PrivacySafeOrgAnalytics['heatmapData'] = {};
  for (const [key, perUserRisk] of heatmapUsers) {
    if (perUserRisk.size < minimumGroupSize) continue;
    heatmapData[key] = {
      count: perUserRisk.size,
      totalRisk: [...perUserRisk.values()].reduce((sum, risk) => sum + risk, 0),
    };
  }

  const trends = [...trendUsers.entries()]
    .filter(([, users]) => users.size >= minimumGroupSize)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, users]) => ({ date: `${date}T00:00:00.000Z`, _count: users.size }));

  return { activeMemberCount, riskStats, heatmapData, trends };
}
