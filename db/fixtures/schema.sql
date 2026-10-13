-- Structure-only snapshot of the source DB core tables (generated from the schema export, 2026-10-13).
-- Used by tests to validate SQL against the real column names/types. NOT NULL constraints are intentionally omitted. Contains no data.

CREATE TYPE user_type AS ENUM ('investor', 'internal-staff', 'superadmin');
CREATE TYPE order_status AS ENUM ('closed', 'cancelled', 'invested', 'booked', 'verifying');
CREATE TYPE deposit_status AS ENUM ('approved', 'pending', 'rejected');
CREATE TYPE deposit_method AS ENUM ('bank_deposit', 'cash', 'reinvest', 'cheque');
CREATE TYPE return_status AS ENUM ('completed', 'initiated');
CREATE TYPE product_duration AS ENUM ('1 Month', '2 Months', '3 Months', '4 Months', '5 Months', '6 Months', '7 Months', '8 Months', '9 Months', '10 Months', '11 Months', '12 Months', '15 Months', '18 Months', '24 Months', '36 Months');
CREATE TYPE product_return_type AS ENUM ('percentage-range', 'percentage', 'fixed');
CREATE TYPE product_risk AS ENUM ('Low Risk');

CREATE TABLE "user" (
  "id" integer,
  "uuid" uuid,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "deletedAt" timestamp,
  "avatar" varchar,
  "dateOfBirth" timestamp,
  "nidNumber" varchar,
  "email" varchar,
  "phone" varchar,
  "password" varchar,
  "encodedRefreshToken" varchar,
  "roleId" integer,
  "isEmailVerified" boolean,
  "isPhoneVerified" boolean,
  "code" varchar,
  "codeExpiredAt" numeric,
  "fcmToken" varchar,
  "userType" user_type,
  "name" varchar,
  "isBiometricEnabled" boolean,
  "biometricDeviceId" varchar,
  "biometricPublicKey" text,
  "biometricChallenge" varchar,
  "biometricChallengeExpiresAt" timestamp,
  "tinNumber" varchar,
  "gender" varchar
);

CREATE TABLE "order" (
  "id" integer,
  "uuid" uuid,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "deletedAt" timestamp,
  "status" order_status,
  "quantity" integer,
  "totalAmount" double precision,
  "investmentDate" timestamp,
  "userId" integer,
  "productId" integer
);

CREATE TABLE "deposits" (
  "id" integer,
  "uuid" uuid,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "deletedAt" timestamp,
  "date" timestamp,
  "amount" double precision,
  "paymentMethod" deposit_method,
  "status" deposit_status,
  "attachment" varchar,
  "remarks" varchar,
  "createdById" integer,
  "updatedById" integer,
  "orderId" integer,
  "bankReferenceNumber" varchar,
  "depositDate" timestamp,
  "fromBankName" varchar,
  "toBankName" varchar,
  "remarksFromAccounts" varchar
);

CREATE TABLE "returns" (
  "id" integer,
  "uuid" uuid,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "deletedAt" timestamp,
  "date" timestamp,
  "amount" double precision,
  "paymentMethod" text,
  "remarks" varchar,
  "createdById" integer,
  "updatedById" integer,
  "orderId" integer,
  "fromBankName" varchar,
  "toBankName" varchar,
  "bankReferenceNumber" varchar,
  "remarksFromAccounts" varchar,
  "status" return_status
);

CREATE TABLE "return_schedules" (
  "id" integer,
  "uuid" uuid,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "deletedAt" timestamp,
  "installmentNumber" integer,
  "totalInstallments" integer,
  "paymentDate" timestamp,
  "profitAmount" double precision,
  "principalAmount" double precision,
  "totalAmount" double precision,
  "orderId" integer
);

CREATE TABLE "products" (
  "id" integer,
  "uuid" uuid,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "deletedAt" timestamp,
  "name" varchar,
  "sku" varchar,
  "isActive" boolean,
  "isFeatured" boolean,
  "description" text,
  "price" double precision,
  "isInsuranceApplicable" boolean,
  "location" varchar,
  "productDuration" product_duration,
  "installment" integer,
  "productReturnType" product_return_type,
  "returnAmountIfFixedAmount" double precision,
  "returnAmountMinimumPercentage" double precision,
  "returnAmountMaximumPercentage" double precision,
  "stock" integer,
  "thumbnailImage" varchar,
  "images" text,
  "createdById" integer,
  "updatedById" integer,
  "riskLevel" product_risk,
  "riskAndProtection" text,
  "preferredReturnPercentage" double precision,
  "isShariah" boolean
);

CREATE TABLE "categories" (
  "id" integer,
  "uuid" uuid,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "deletedAt" timestamp,
  "name" varchar,
  "isActive" boolean,
  "image" varchar,
  "order" integer,
  "createdById" integer,
  "updatedById" integer
);

CREATE TABLE "category_products" (
  "categoriesId" integer,
  "productsId" integer
);

CREATE TABLE "investor_bank" (
  "id" integer,
  "uuid" uuid,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "deletedAt" timestamp,
  "bankName" varchar,
  "branchName" varchar,
  "routingNumber" varchar,
  "accountName" varchar,
  "accountNumber" varchar,
  "userId" integer,
  "districtName" varchar
);

CREATE TABLE "nominee" (
  "id" integer,
  "uuid" uuid,
  "createdAt" timestamp,
  "updatedAt" timestamp,
  "deletedAt" timestamp,
  "name" varchar,
  "phone" varchar,
  "nidNumber" varchar,
  "relationship" varchar,
  "userId" integer
);
