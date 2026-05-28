-- Add the fields needed by the Libretos page for imports, editing and trash.

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS raw_text TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'seed'
    CHECK (source_type IN ('seed', 'manual', 'imported', 'duplicated')),
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS scripts_deleted_at_idx
  ON public.scripts(deleted_at);

CREATE INDEX IF NOT EXISTS scripts_source_type_idx
  ON public.scripts(source_type);

UPDATE public.scripts
SET source_type = 'seed'
WHERE user_id IS NULL
  AND source_type IS NULL;

UPDATE public.scripts
SET source_type = 'manual'
WHERE user_id IS NOT NULL
  AND source_type = 'seed';
