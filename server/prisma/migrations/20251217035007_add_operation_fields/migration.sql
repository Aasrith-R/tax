-- AlterTable
ALTER TABLE "operations" ADD COLUMN     "additionalInfo" JSONB,
ADD COLUMN     "company" TEXT,
ADD COLUMN     "paymentName" TEXT;
