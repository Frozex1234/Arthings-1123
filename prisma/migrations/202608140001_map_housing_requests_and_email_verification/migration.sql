-- ===========================================================================
-- Arthings — map geocoding, housing module, rent-request lifecycle and
-- email verification.
-- ===========================================================================
-- Hand-written to match the existing migration style. Safe to run against a
-- database that already has the housing/messages migration applied.
--
-- NOTE: the session table used by connect-pg-simple is intentionally NOT
-- created here. The session store creates it on boot; keeping it outside the
-- Prisma schema avoids permanent drift warnings.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "ListingType" AS ENUM ('item', 'housing');
CREATE TYPE "HousingCategory" AS ENUM ('apartment', 'house', 'room', 'hostel', 'commercial', 'garage');
CREATE TYPE "RentalPeriod" AS ENUM ('daily', 'weekly', 'monthly', 'short_term', 'long_term');
CREATE TYPE "VerificationPurpose" AS ENUM ('email_verification', 'password_reset');
CREATE TYPE "NotificationType" AS ENUM (
    'rental_requested',
    'rental_accepted',
    'rental_rejected',
    'rental_cancelled',
    'rental_completed',
    'message_received',
    'rating_received',
    'system'
);

-- ---------------------------------------------------------------------------
-- Users: email confirmation + denormalised rating aggregates
-- ---------------------------------------------------------------------------
ALTER TABLE "users"
    ADD COLUMN "email_verified_at" TIMESTAMP(3),
    ADD COLUMN "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "users_email_verified_at_idx" ON "users"("email_verified_at");

-- Existing accounts predate email confirmation. Grandfather them in so the
-- new gate does not lock out the current user base.
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;

-- Backfill rating aggregates from historical ratings.
UPDATE "users" u
SET "rating_avg" = COALESCE(r.avg_score, 0),
    "rating_count" = COALESCE(r.cnt, 0)
FROM (
    SELECT "to_user_id", ROUND(AVG("score")::numeric, 2) AS avg_score, COUNT(*) AS cnt
    FROM "ratings"
    GROUP BY "to_user_id"
) r
WHERE u."id" = r."to_user_id";

-- ---------------------------------------------------------------------------
-- Items: listing type, structured address, coordinates, housing attributes
-- ---------------------------------------------------------------------------
ALTER TABLE "items"
    ADD COLUMN "listing_type" "ListingType" NOT NULL DEFAULT 'item',
    ADD COLUMN "country" VARCHAR(100) NOT NULL DEFAULT 'Ukraine',
    ADD COLUMN "region" VARCHAR(120),
    ADD COLUMN "district" VARCHAR(120),
    ADD COLUMN "village" VARCHAR(120),
    ADD COLUMN "street" VARCHAR(160),
    ADD COLUMN "house_number" VARCHAR(30),
    ADD COLUMN "postcode" VARCHAR(20),
    ADD COLUMN "latitude" DOUBLE PRECISION,
    ADD COLUMN "longitude" DOUBLE PRECISION,
    ADD COLUMN "geocoded_at" TIMESTAMP(3),
    ADD COLUMN "geocode_accuracy" VARCHAR(30),
    ADD COLUMN "geocode_query" VARCHAR(500),
    ADD COLUMN "housing_category" "HousingCategory",
    ADD COLUMN "rental_period" "RentalPeriod",
    ADD COLUMN "max_guests" INTEGER,
    ADD COLUMN "smoking_allowed" BOOLEAN,
    ADD COLUMN "has_internet" BOOLEAN,
    ADD COLUMN "has_parking" BOOLEAN,
    ADD COLUMN "utilities_included" BOOLEAN;

-- Rows created by the earlier housing migration already carry housing
-- attributes; promote them to the new discriminator.
UPDATE "items"
SET "listing_type" = 'housing'
WHERE "housing_type" IS NOT NULL
   OR "rooms" IS NOT NULL
   OR "area" IS NOT NULL;

CREATE INDEX "items_listing_type_is_available_idx" ON "items"("listing_type", "is_available");
CREATE INDEX "items_listing_type_category_idx" ON "items"("listing_type", "category");
CREATE INDEX "items_housing_category_idx" ON "items"("housing_category");
CREATE INDEX "items_rental_period_idx" ON "items"("rental_period");
CREATE INDEX "items_latitude_longitude_idx" ON "items"("latitude", "longitude");

-- ---------------------------------------------------------------------------
-- Rentals: lifecycle metadata + overlap-check index
-- ---------------------------------------------------------------------------
ALTER TABLE "rentals"
    ADD COLUMN "owner_response" TEXT,
    ADD COLUMN "responded_at" TIMESTAMP(3),
    ADD COLUMN "cancelled_at" TIMESTAMP(3),
    ADD COLUMN "cancelled_by_id" INTEGER,
    ADD COLUMN "completed_at" TIMESTAMP(3);

CREATE INDEX "rentals_item_id_status_start_date_end_date_idx"
    ON "rentals"("item_id", "status", "start_date", "end_date");

-- ---------------------------------------------------------------------------
-- Verification tokens
-- ---------------------------------------------------------------------------
CREATE TABLE "verification_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "verification_tokens_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "verification_tokens_user_id_purpose_consumed_at_idx"
    ON "verification_tokens"("user_id", "purpose", "consumed_at");
CREATE INDEX "verification_tokens_expires_at_idx" ON "verification_tokens"("expires_at");

-- ---------------------------------------------------------------------------
-- Item availability (owner-declared blocked ranges)
-- ---------------------------------------------------------------------------
CREATE TABLE "item_availability" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "item_availability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "item_availability_item_id_fkey" FOREIGN KEY ("item_id")
        REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "item_availability_item_id_start_date_end_date_idx"
    ON "item_availability"("item_id", "start_date", "end_date");

-- ---------------------------------------------------------------------------
-- Geocode cache
-- ---------------------------------------------------------------------------
CREATE TABLE "geocode_cache" (
    "id" SERIAL NOT NULL,
    "query_key" VARCHAR(500) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "display_name" VARCHAR(500),
    "accuracy" VARCHAR(30),
    "payload" JSONB,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "geocode_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "geocode_cache_query_key_key" ON "geocode_cache"("query_key");
CREATE INDEX "geocode_cache_updated_at_idx" ON "geocode_cache"("updated_at");

-- ---------------------------------------------------------------------------
-- Rental event timeline
-- ---------------------------------------------------------------------------
CREATE TABLE "rental_events" (
    "id" SERIAL NOT NULL,
    "rental_id" INTEGER NOT NULL,
    "actor_id" INTEGER,
    "status" "RentalStatus" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rental_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rental_events_rental_id_fkey" FOREIGN KEY ("rental_id")
        REFERENCES "rentals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rental_events_actor_id_fkey" FOREIGN KEY ("actor_id")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "rental_events_rental_id_created_at_idx" ON "rental_events"("rental_id", "created_at");

-- Seed the timeline for existing rentals so history is not empty on launch.
-- The enum literal is cast explicitly: in INSERT...SELECT, Postgres types the
-- expression as text and will not implicitly coerce it to the enum.
INSERT INTO "rental_events" ("rental_id", "actor_id", "status", "note", "created_at")
SELECT "id", "renter_id", 'pending'::"RentalStatus", 'Request created', "created_at"
FROM "rentals";

INSERT INTO "rental_events" ("rental_id", "actor_id", "status", "note", "created_at")
SELECT "id", NULL::INTEGER, "status", 'Imported from previous status', "updated_at"
FROM "rentals"
WHERE "status" <> 'pending';

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "link" VARCHAR(500),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "notifications_user_id_read_at_created_at_idx"
    ON "notifications"("user_id", "read_at", "created_at");
