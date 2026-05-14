-- AlterTable
ALTER TABLE "Content" ADD COLUMN     "sponsorBrand" TEXT,
ADD COLUMN     "sponsorFee" DOUBLE PRECISION,
ADD COLUMN     "sponsored" BOOLEAN NOT NULL DEFAULT false;
