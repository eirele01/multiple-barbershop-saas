-- Migration 011: Add background_color column to shops table
-- This allows shop owners to control the page background color of their shop page
-- Default is #0D0D0D (dark charcoal) matching the current "Dark Luxury Lounge" theme

ALTER TABLE shops
ADD COLUMN IF NOT EXISTS background_color TEXT DEFAULT '#0D0D0D';

-- Add check constraint for valid hex color format
ALTER TABLE shops
ADD CONSTRAINT shops_background_color_format CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$');
