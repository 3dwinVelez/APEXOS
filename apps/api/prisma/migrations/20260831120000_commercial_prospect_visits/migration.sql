-- Preserve every existing visit and relation; allow scheduling without a customer.
ALTER TABLE "commercial_visits" ALTER COLUMN "customer_id" DROP NOT NULL;
