import prisma from '../config/prisma';

export class AnalyticsService {
  static async logSentiment(userId: string, riskLevel: string, tags: string[], _content: string) {
    // An unavailable automated screen must not be converted into a pseudo-clinical
    // score or used to trigger trend notifications.
    if (riskLevel === 'unavailable') return null;

    const riskToScore: Record<string, number> = {
      low: 90,
      medium: 50,
      high: 10,
    };

    const score = riskToScore[riskLevel];
    if (score === undefined) return null;

    // Log the trend
    const trend = await prisma.sentimentTrend.create({
      data: {
        userId,
        riskLevel,
        score,
        tags,
      },
    });

    // Check for sharp drops to create notifications
    await this.checkAndNotify(userId, score);

    // Update profile attention score
    await this.updateAttentionScore(userId);

    return trend;
  }

  static async updateAttentionScore(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        diaryEntries: { take: 5, orderBy: { date: 'desc' } },
        chatSessions: { take: 5, orderBy: { date: 'desc' } },
      },
    });

    if (!user || !user.profile) return;

    let score = 0;

    // 1. High risk interactions
    const highRiskChats = user.chatSessions.filter((s) => s.riskLevel === 'high').length;
    const highRiskDiary = user.diaryEntries.filter((d) => d.riskLevel === 'high').length;
    score += (highRiskChats + highRiskDiary) * 30;

    // 2. Medium risk
    const medRiskChats = user.chatSessions.filter((s) => s.riskLevel === 'medium').length;
    score += medRiskChats * 10;

    // 3. Inactivity (days since last activity)
    const daysSinceLast = Math.floor(
      (Date.now() - new Date(user.lastActivity).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceLast > 3) {
      score += daysSinceLast * 5;
    }

    await prisma.profile.update({
      where: { userId },
      data: { attentionScore: score },
    });
  }

  static async checkAndNotify(userId: string, currentScore: number) {
    const lastTrends = await prisma.sentimentTrend.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 2,
      skip: 1,
    });

    if (lastTrends.length > 0) {
      const prevScore = lastTrends[0].score;
      if (prevScore - currentScore > 40) {
        // Sharp drop detected
        await prisma.notification.create({
          data: {
            userId,
            title: 'Мы заметили перемены',
            message:
              'Твое настроение кажется более тревожным сегодня. Попробуй упражнение "Дыхание 4-7-8" или обратись за поддержкой.',
            type: 'warning',
          },
        });

        // If shared with therapist, they should know too (conceptually, in real app we'd send email/push)
      }
    }
  }
}
