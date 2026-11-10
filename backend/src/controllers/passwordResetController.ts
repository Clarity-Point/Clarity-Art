import { Request, Response } from 'express';
import { z } from 'zod';
import { issuePasswordReset, consumePasswordReset } from '../services/passwordResetService';
import { createLogger } from '../config/logger';
import { newPasswordSchema } from '../schemas';
const log = createLogger('passwordReset');
const requestSchema = z.object({ email: z.string().trim().email().max(254) });
const resetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: newPasswordSchema,
});
export const requestPasswordReset = (req: Request, res: Response) => {
  const body = requestSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Введите корректный email' });
  // Identical response and timing regardless of account existence or SMTP latency.
  res.status(202).json({
    message: 'Если аккаунт с таким email существует, мы отправим ссылку для смены пароля.',
  });
  void issuePasswordReset(body.data.email.toLowerCase()).catch(() =>
    log.error('Password reset request could not be delivered'),
  );
};
export const resetPassword = async (req: Request, res: Response) => {
  const body = resetSchema.safeParse(req.body);
  if (!body.success)
    return res.status(400).json({
      error: 'Проверьте ссылку и пароль: минимум 8 символов, без чрезмерно длинной фразы.',
    });
  if (!(await consumePasswordReset(body.data.token, body.data.password)))
    return res.status(400).json({ error: 'Ссылка недействительна или устарела. Запросите новую.' });
  res.clearCookie('ty_session', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
  });
  res.json({ message: 'Пароль изменён. Войдите с новым паролем.' });
};
