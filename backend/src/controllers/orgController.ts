import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { organizationCreateSchema, organizationJoinSchema, peerSupportSchema } from '../schemas';

/** One row of the anonymized risk-level breakdown produced by Prisma groupBy. */
interface RiskStat {
  riskLevel: string;
  _count: number;
}

/** Aggregated risk activity keyed by `${dayOfWeek}-${hour}`. */
type HeatmapData = Record<string, { count: number; totalRisk: number }>;

export const createOrg = async (req: AuthRequest, res: Response) => {
  // Authorization is enforced by the `isAdmin` middleware (fresh DB role check).
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const validation = organizationCreateSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: 'Invalid organization name' });
  const { name } = validation.data;

  try {
    const org = await prisma.organization.create({
      data: {
        name,
        inviteCode: uuidv4().substring(0, 8).toUpperCase(),
      },
    });
    res.status(201).json(org);
  } catch {
    res.status(500).json({ error: 'Error creating organization' });
  }
};

export const joinOrg = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const validation = organizationJoinSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: 'Invalid invite code' });
  const inviteCode = validation.data.inviteCode.toUpperCase();

  try {
    const org = await prisma.organization.findUnique({ where: { inviteCode } });
    if (!org) return res.status(404).json({ error: 'Invalid invite code' });

    await prisma.user.update({
      where: { id: req.user.id },
      data: { organizationId: org.id },
    });

    res.json({ message: `Successfully joined ${org.name}` });
  } catch {
    res.status(500).json({ error: 'Error joining organization' });
  }
};

export const leaveOrg = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
  if (user?.role === 'ORG_ADMIN') {
    return res.status(409).json({ error: 'Сначала передайте права администратора организации' });
  }
  await prisma.user.update({ where: { id: req.user.id }, data: { organizationId: null } });
  res.status(204).end();
};

export const rotateInviteCode = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return res.status(404).json({ error: 'Organization not found' });
  const organization = await prisma.organization.update({
    where: { id: user.organizationId },
    data: { inviteCode: uuidv4().substring(0, 8).toUpperCase() },
    select: { inviteCode: true },
  });
  res.json(organization);
};

const MIN_ORG_AGGREGATE_RESPONSES = 8;

export const getOrgStats = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { organization: true },
    });

    if (!user?.organizationId)
      return res.status(403).json({ error: 'User not in an organization' });

    const memberCount = await prisma.user.count({ where: { organizationId: user.organizationId } });

    // Never expose mental-health-like aggregates for a group small enough to
    // permit inference about individuals. The organisation sees only a neutral
    // privacy-protected response until both the group and signal count reach k.
    if (memberCount < MIN_ORG_AGGREGATE_RESPONSES) {
      return res.json({
        orgName: user.organization?.name,
        inviteCode: user.organization?.inviteCode,
        memberCount,
        privacyProtected: true,
        minimumGroupSize: MIN_ORG_AGGREGATE_RESPONSES,
        message: 'Недостаточно участников для отображения групповых агрегатов.',
      });
    }

    const signalWhere = {
      user: { organizationId: user.organizationId },
      riskLevel: { in: ['low', 'medium', 'high'] },
    };
    const chatStats = await prisma.chatSession.groupBy({
      by: ['riskLevel'],
      where: signalWhere,
      _count: true,
    });
    const signalCount = chatStats.reduce((total, stat) => total + stat._count, 0);

    if (signalCount < MIN_ORG_AGGREGATE_RESPONSES) {
      return res.json({
        orgName: user.organization?.name,
        inviteCode: user.organization?.inviteCode,
        memberCount,
        privacyProtected: true,
        minimumGroupSize: MIN_ORG_AGGREGATE_RESPONSES,
        message: 'Недостаточно агрегированных сигналов для отображения статистики.',
      });
    }

    const sessions = await prisma.chatSession.findMany({
      where: signalWhere,
      select: { date: true, riskLevel: true },
    });

    const heatmapData = sessions.reduce<HeatmapData>((acc, s) => {
      const day = new Date(s.date).getDay();
      const hour = new Date(s.date).getHours();
      const key = `${day}-${hour}`;
      if (!acc[key]) acc[key] = { count: 0, totalRisk: 0 };
      acc[key].count++;
      acc[key].totalRisk += s.riskLevel === 'high' ? 3 : s.riskLevel === 'medium' ? 2 : 1;
      return acc;
    }, {});

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const trends = await prisma.chatSession.groupBy({
      by: ['date'],
      where: { ...signalWhere, date: { gte: sevenDaysAgo } },
      _count: true,
    });

    res.json({
      orgName: user.organization?.name,
      inviteCode: user.organization?.inviteCode,
      memberCount,
      privacyProtected: false,
      minimumGroupSize: MIN_ORG_AGGREGATE_RESPONSES,
      riskStats: chatStats,
      heatmapData,
      trends,
      hrRecommendations: generateHRRecommendations(chatStats),
      executiveSummary: generateExecutiveSummary(chatStats),
    });
  } catch {
    res.status(500).json({ error: 'Error fetching organization aggregates' });
  }
};

const generateExecutiveSummary = (riskStats: RiskStat[]) => {
  const total = riskStats.reduce((a, b) => a + (b._count || 0), 0);
  if (total === 0) return 'Данных пока недостаточно для групповой сводки.';

  const highSignalPercent = Math.round(
    ((riskStats.find((s) => s.riskLevel === 'high')?._count || 0) / total) * 100,
  );

  if (highSignalPercent > 20) {
    return 'В агрегированных данных заметна повышенная доля сигналов, требующих бережного внимания. Не используйте это как оценку отдельных людей; предложите всем участникам доступ к добровольным ресурсам поддержки.';
  }
  return 'Агрегированные данные доступны только на уровне группы. Они не являются оценкой состояния отдельных участников.';
};

const generateHRRecommendations = (riskStats: RiskStat[]) => {
  const highRisk = riskStats.find((s) => s.riskLevel === 'high')?._count || 0;
  const mediumRisk = riskStats.find((s) => s.riskLevel === 'medium')?._count || 0;

  const recommendations = [];
  if (highRisk > 0) {
    recommendations.push(
      'В агрегированных данных есть сигналы, требующие бережного внимания. Не идентифицируйте отдельных людей; предложите всем добровольный доступ к ресурсам поддержки и понятный канал обращения к человеку.',
    );
  }
  if (mediumRisk > 5) {
    recommendations.push(
      'Предложите группе добровольные короткие практики восстановления и напомните, что участие и передача данных не являются обязательными.',
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Показываются только групповые агрегаты. Не используйте их для оценки, ранжирования или дисциплинарных решений в отношении отдельных людей.',
    );
  }
  return recommendations;
};

export const getPeerSupport = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.organizationId) return res.status(403).json({ error: 'Not in org' });

    const messages = await prisma.peerSupportMessage.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(messages);
  } catch {
    res.status(500).json({ error: 'Error fetching peer support' });
  }
};

export const postPeerSupport = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const validation = peerSupportSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: 'Invalid message' });
  const { content } = validation.data;
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.organizationId) return res.status(403).json({ error: 'Not in org' });

    const titles = ['Анонимный Листок', 'Тихий Росток', 'Мудрое Древо', 'Яркий Цветок'];
    const authorTitle = titles[Math.floor(Math.random() * titles.length)];

    const msg = await prisma.peerSupportMessage.create({
      data: {
        organizationId: user.organizationId,
        content,
        authorTitle,
      },
    });
    res.status(201).json(msg);
  } catch {
    res.status(500).json({ error: 'Error posting peer support' });
  }
};
