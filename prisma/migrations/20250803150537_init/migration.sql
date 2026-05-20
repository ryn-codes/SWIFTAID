-- CreateEnum
CREATE TYPE "public"."RequestStatus" AS ENUM ('PENDING', 'ASSIGNED', 'EN_ROUTE', 'COMPLETED');

-- CreateTable
CREATE TABLE "public"."Ambulance" (
    "id" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Ambulance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Request" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" "public"."RequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ambulanceId" TEXT,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Request" ADD CONSTRAINT "Request_ambulanceId_fkey" FOREIGN KEY ("ambulanceId") REFERENCES "public"."Ambulance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
