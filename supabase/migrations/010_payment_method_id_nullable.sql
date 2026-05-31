-- Migration 010: Make payment_verifications.payment_method_id nullable
--
-- PayMongo payments are API-based and don't need a manual payment_methods row.
-- Previously, the code incorrectly linked PayMongo bookings to a manual "PayMongo%"
-- payment method entry, causing 409 delete errors and confusion.
--
-- This migration:
-- 1. Makes payment_method_id nullable so PayMongo verifications can exist without a manual method
-- 2. Cleans up existing PayMongo verification records by setting their payment_method_id to NULL
-- 3. Fixes bookings.payment_method for PayMongo bookings (was storing UUID, should store channel key)

-- Step 1: Make payment_method_id nullable
ALTER TABLE payment_verifications
  ALTER COLUMN payment_method_id DROP NOT NULL;

-- Step 2: Clean up existing PayMongo payment_verifications — set payment_method_id to NULL
-- These are identified by having a reference_number starting with 'PayMongo'
UPDATE payment_verifications
SET payment_method_id = NULL
WHERE reference_number ILIKE 'PayMongo%';

-- Step 3: Fix bookings where payment_method stores a UUID instead of the PayMongo channel key
-- For PayMongo bookings, bookings.payment_method should be the channel key (e.g., 'gcash_paymongo'),
-- NOT the UUID of a manual payment method
-- We only fix bookings where payment_type = 'paymongo' and payment_method looks like a UUID
UPDATE bookings
SET payment_method = 'paymongo'
WHERE payment_type = 'paymongo'
  AND payment_method ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
