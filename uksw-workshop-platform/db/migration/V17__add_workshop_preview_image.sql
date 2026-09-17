-- V17: Add preview_image column to workshops table
-- Stores a base64-encoded data URI or URL for workshop card preview images

ALTER TABLE workshops ADD COLUMN IF NOT EXISTS preview_image TEXT;

COMMENT ON COLUMN workshops.preview_image IS 'Base64-encoded data URI or URL for the workshop preview image shown on the selection page';
