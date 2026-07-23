-- AlterTable
ALTER TABLE "ImageAnalysis" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "likes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "avatarLevel" INTEGER NOT NULL DEFAULT 1;
