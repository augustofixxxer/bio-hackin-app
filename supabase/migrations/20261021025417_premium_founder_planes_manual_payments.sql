-- Founder manual payments: plan duration and bounded proof uploads.
ALTER TABLE public.premium_subscriptions
  ADD COLUMN IF NOT EXISTS plan text,
  ADD COLUMN IF NOT EXISTS duracion_dias integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'premium_subscriptions_plan_check'
      AND conrelid = 'public.premium_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.premium_subscriptions
      ADD CONSTRAINT premium_subscriptions_plan_check
      CHECK (plan IS NULL OR plan IN ('mensual', 'anual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'premium_subscriptions_duracion_dias_check'
      AND conrelid = 'public.premium_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.premium_subscriptions
      ADD CONSTRAINT premium_subscriptions_duracion_dias_check
      CHECK (duracion_dias IS NULL OR duracion_dias IN (30, 365));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS premium_subscriptions_pendientes_created_idx
  ON public.premium_subscriptions (created_at)
  WHERE estado = 'pendiente';

UPDATE storage.buckets
SET file_size_limit = 3145728,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
WHERE id = 'comprobantes-premium';
