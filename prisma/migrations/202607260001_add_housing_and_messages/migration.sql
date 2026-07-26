-- Housing listing attributes and private user conversations
ALTER TABLE "items"
    ADD COLUMN "address" VARCHAR(255),
    ADD COLUMN "housing_type" VARCHAR(30),
    ADD COLUMN "rooms" INTEGER,
    ADD COLUMN "area" DECIMAL(8,2),
    ADD COLUMN "floor" INTEGER,
    ADD COLUMN "total_floors" INTEGER,
    ADD COLUMN "is_furnished" BOOLEAN,
    ADD COLUMN "pets_allowed" BOOLEAN,
    ADD COLUMN "students_allowed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "items_students_allowed_idx" ON "items"("students_allowed");

CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "recipient_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "messages_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "messages_sender_id_recipient_id_created_at_idx" ON "messages"("sender_id", "recipient_id", "created_at");
CREATE INDEX "messages_recipient_id_read_at_idx" ON "messages"("recipient_id", "read_at");
CREATE INDEX "messages_item_id_idx" ON "messages"("item_id");
