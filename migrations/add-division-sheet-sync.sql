-- Migration: Add division_sheet_sync table for Google Sheets sync feature
-- Run this on the production database

-- Create the table
CREATE TABLE IF NOT EXISTS division_sheet_sync (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  division_id INTEGER NOT NULL UNIQUE REFERENCES divisions(id),
  spreadsheet_id TEXT NOT NULL,
  sync_enabled INTEGER DEFAULT 1,
  last_sync_at TEXT,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_division_sheet_sync_division_id ON division_sheet_sync(division_id);

-- Insert sync configurations for S10 divisions
INSERT OR IGNORE INTO division_sheet_sync (division_id, spreadsheet_id, sync_enabled, created_at, updated_at)
VALUES
  -- Neon (division_id 32)
  (32, '1mNAJ3BwV-4AKveLJVT_T4eYQZU3wkLMEtP8wV-If600', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- Crystal (division_id 31)
  (31, '1-_bylG_u6edDbmNK1OK9sr3Ad41kK4snXCsmkaqRW68', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- Sunset (division_id 30)
  (30, '1gq-w_VfN2HUgmwa1golrmqnF8VUy0iVkhNOBAKoLS6A', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- Stargazer (division_id 29)
  (29, '1uKlv8qQJZ44GsR2lniYFw2nRKPtiDHVHMoAcIBbdZ7Q', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
