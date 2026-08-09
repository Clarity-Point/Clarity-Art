import { Response } from 'express';
import PDFDocument from 'pdfkit';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth';
import { createLogger } from '../config/logger';
import fs from 'node:fs';

const log = createLogger('exportController');

const CYRILLIC_FONT_PATHS = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
];

export const exportDiaryPDF = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        profile: true,
        courseProgress: { include: { course: true } },
        submissions: { include: { homework: true } },
        diaryEntries: { orderBy: { date: 'desc' } },
        imageAnalyses: { orderBy: { date: 'desc' } },
      },
    });

    if (!user || !user.profile) return res.status(404).json({ error: 'User data not found' });

    const doc = new PDFDocument({ margin: 50 });
    const fontPath = CYRILLIC_FONT_PATHS.find((path) => fs.existsSync(path));
    if (!fontPath) {
      return res.status(503).json({ error: 'PDF font is not installed on the server' });
    }
    doc.registerFont('AppFont', fontPath).font('AppFont');
    res.setHeader('Content-Type', 'application/pdf');
    const displayName = user.profile.name || 'user';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="healing-diary.pdf"; filename*=UTF-8''${encodeURIComponent(`Дневник-${displayName}.pdf`)}`,
    );
    doc.pipe(res);

    // Cover Page
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f0f4ff');
    doc
      .fillColor('#3f51b5')
      .fontSize(30)
      .text('КНИГА ИСЦЕЛЕНИЯ', 50, 200, { align: 'center', characterSpacing: 2 });
    doc
      .fontSize(15)
      .fillColor('#666')
      .text('Ваш путь к внутренней гармонии через арт-терапию', { align: 'center' });
    doc.moveDown(2);
    doc
      .fontSize(18)
      .fillColor('#333')
      .text(user.profile.name || user.email, { align: 'center', underline: true });
    doc.addPage();

    // Stats & Avatar
    doc.fillColor('#333').fontSize(20).text('Ваш прогресс и Аватар', { underline: true });
    doc.moveDown();
    const avatarNames = ['Росток надежды', 'Лист познания', 'Цветок гармонии', 'Древо мудрости'];
    const avatarLevel = user.points >= 500 ? 4 : user.points >= 200 ? 3 : user.points >= 50 ? 2 : 1;
    doc.fontSize(14).text(`Текущий уровень: ${avatarNames[avatarLevel - 1]}`);
    doc.text(`Серия активности: ${user.streak} дней`);
    doc.text(`Набрано очков: ${user.points}`);
    doc.moveDown();

    // Image Analysis History
    if (user.imageAnalyses.length > 0) {
      doc.fontSize(20).text('Галерея ваших инсайтов', { underline: true });
      doc.moveDown();
      user.imageAnalyses.forEach((img, index) => {
        doc
          .fontSize(12)
          .fillColor('#3f51b5')
          .text(
            `Работа №${user.imageAnalyses.length - index} (${new Date(img.date).toLocaleDateString()})`,
          );
        doc.fontSize(10).fillColor('#333').text(`Запрос: ${img.prompt}`, { oblique: true });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#444').text(`Анализ ИИ: ${img.result}`);
        doc.moveDown();
        if (doc.y > 650) doc.addPage();
      });
    }

    // Homework & Courses
    if (user.courseProgress.length > 0) {
      doc.addPage();
      doc.fontSize(20).text('Учебные достижения', { underline: true });
      doc.moveDown();
      user.courseProgress.forEach((cp) => {
        doc.fontSize(14).text(`${cp.course.title}: ${cp.progress}% заполнено`);
        const relatedHw = user.submissions.filter((s) => s.homework.courseId === cp.courseId);
        relatedHw.forEach((sub) => {
          doc.fontSize(10).text(`- ${sub.homework.title}: Сдано`, { indent: 20 });
        });
        doc.moveDown();
      });
    }

    doc.end();
  } catch (error) {
    log.error({ err: error }, 'PDF Export Error');
    if (!res.headersSent) return res.status(500).json({ error: 'Error generating PDF' });
    return res.end();
  }
};
