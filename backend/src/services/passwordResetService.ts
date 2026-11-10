import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import prisma from '../config/prisma';
import { recordAudit } from './auditService';

export const resetTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function issuePasswordReset(email: string) {
  if (!process.env.SMTP_URL || !process.env.MAIL_FROM)
    throw new Error('Password reset mail is not configured');
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, sessionVersion: true },
  });
  if (!user) return;
  const token = randomBytes(32).toString('hex');
  const tokenHash = resetTokenHash(token);
  const data = {
    tokenHash,
    sessionVersion: user.sessionVersion,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60_000),
  };
  const previous = await prisma.passwordReset.findUnique({ where: { userId: user.id } });
  if (previous) {
    const claimed = await prisma.passwordReset.updateMany({
      where: { userId: user.id, createdAt: { lt: new Date(Date.now() - 60_000) } },
      data,
    });
    if (!claimed.count) return;
  } else {
    try {
      await prisma.passwordReset.create({ data: { userId: user.id, ...data } });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') return;
      throw error;
    }
  }
  const link = new URL('/reset-password', process.env.FRONTEND_URL || 'http://localhost:5173');
  // A fragment is never sent to HTTP access logs or referrers.
  link.hash = `token=${token}`;
  const transport = nodemailer.createTransport(process.env.SMTP_URL, {
    from: process.env.MAIL_FROM,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    await transport.sendMail({
      to: user.email,
      subject: 'Восстановление доступа · Точка Ясности',
      text: `Чтобы задать новый пароль, откройте ссылку в течение 30 минут:\n${link.href}\n\nЕсли вы не запрашивали сброс, проигнорируйте письмо.`,
    });
  } catch {
    await prisma.passwordReset.deleteMany({ where: { userId: user.id, tokenHash } });
    throw new Error('Password reset delivery failed');
  } finally {
    transport.close();
  }
}
export async function consumePasswordReset(token: string, password: string): Promise<boolean> {
  const hash = await bcrypt.hash(password, 12);
  const userId = await prisma.$transaction(async (tx) => {
    const reset = await tx.passwordReset.findUnique({
      where: { tokenHash: resetTokenHash(token) },
    });
    if (!reset || reset.expiresAt <= new Date()) return false;
    // Deleting the token inside the transaction makes concurrent use one-shot.
    const claimed = await tx.passwordReset.deleteMany({
      where: { id: reset.id, tokenHash: reset.tokenHash, expiresAt: { gt: new Date() } },
    });
    if (!claimed.count) return false;
    const updated = await tx.user.updateMany({
      where: { id: reset.userId, sessionVersion: reset.sessionVersion },
      data: { password: hash, sessionVersion: { increment: 1 } },
    });
    return updated.count === 1 ? reset.userId : false;
  });
  if (userId) recordAudit({ action: 'auth.password_reset', actorId: userId, outcome: 'success' });
  return Boolean(userId);
}
