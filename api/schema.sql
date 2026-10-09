-- Databasschema för Position-API:t. Kan köras flera gånger (idempotent).
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.users (
  id            SERIAL PRIMARY KEY,
  phone_number  VARCHAR(32) NOT NULL UNIQUE,
  display_name  VARCHAR(100) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.position_requests (
  id              SERIAL PRIMARY KEY,
  sender_id       INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id     INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_phone  VARCHAR(32),
  location        GEOMETRY(Point, 4326),
  accuracy_meters DOUBLE PRECISION,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shared_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_position_requests_receiver_phone ON public.position_requests (receiver_phone);
CREATE INDEX IF NOT EXISTS idx_position_requests_expires_at ON public.position_requests (expires_at);
CREATE INDEX IF NOT EXISTS idx_position_requests_receiver_id ON public.position_requests (receiver_id, expires_at);

-- Förfrågningar: "requester vill se targets position".
-- När target tackar ja delar båda sina positioner med varandra.
CREATE TABLE IF NOT EXISTS public.location_requests (
  id              SERIAL PRIMARY KEY,
  requester_id    INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_id       INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,                   -- sista tid att svara
  responded_at    TIMESTAMPTZ,
  reciprocated_at TIMESTAMPTZ                             -- när frågaren delade tillbaka
);

CREATE INDEX IF NOT EXISTS idx_location_requests_target ON public.location_requests (target_id, status);
CREATE INDEX IF NOT EXISTS idx_location_requests_requester ON public.location_requests (requester_id, created_at);

-- Delningar som skett som svar på en förfrågan pekar på den
ALTER TABLE public.position_requests
  ADD COLUMN IF NOT EXISTS request_id INTEGER REFERENCES public.location_requests(id) ON DELETE SET NULL;

-- Testanvändare (appen använder hårdkodat sender_id = 1 under testning)
INSERT INTO public.users (id, phone_number, display_name)
VALUES (1, '+46700000001', 'Testanvändare')
ON CONFLICT (id) DO NOTHING;
SELECT setval('public.users_id_seq', GREATEST((SELECT MAX(id) FROM public.users), 1));
