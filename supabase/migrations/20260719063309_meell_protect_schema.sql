/*
# MEELL PROTECT — Core schema

Creates plans, profiles, subscriptions, protected_files, clients, deliveries,
delivery_events, activity_log, chat_messages, storage buckets, and RLS policies.
*/

-- ---------- plans ----------
CREATE TABLE IF NOT EXISTS plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  price_label text NOT NULL,
  tagline text,
  popular boolean NOT NULL DEFAULT false,
  max_files integer NOT NULL DEFAULT 5,
  max_storage_mb integer NOT NULL DEFAULT 100,
  max_deliveries integer NOT NULL DEFAULT 10,
  advanced_tracking boolean NOT NULL DEFAULT false,
  watermark boolean NOT NULL DEFAULT false,
  custom_branding boolean NOT NULL DEFAULT false,
  priority_support boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_public_read" ON plans;
CREATE POLICY "plans_public_read" ON plans FOR SELECT TO anon, authenticated USING (true);

INSERT INTO plans (id, name, price_cents, price_label, tagline, popular, max_files, max_storage_mb, max_deliveries, advanced_tracking, watermark, custom_branding, priority_support, sort_order) VALUES
  ('free', 'Grátis', 0, 'R$ 0', 'Teste o Meell Protect com limite pequeno.', false, 3, 50, 5, false, false, false, false, 0),
  ('start', 'Protect Start', 2900, 'R$ 29/mês', 'Para pequenos criadores que estão começando.', false, 50, 2000, 100, false, true, false, false, 1),
  ('pro', 'Protect Pro', 6900, 'R$ 69/mês', 'Mais arquivos, armazenamento, entregas e rastreamento avançado.', true, 500, 20000, 2000, true, true, true, false, 2),
  ('business', 'Protect Business', 16900, 'R$ 169/mês', 'Alto volume e recursos avançados para negócios estabelecidos.', false, 5000, 200000, 20000, true, true, true, true, 3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, price_cents = EXCLUDED.price_cents, price_label = EXCLUDED.price_label,
  tagline = EXCLUDED.tagline, popular = EXCLUDED.popular, max_files = EXCLUDED.max_files,
  max_storage_mb = EXCLUDED.max_storage_mb, max_deliveries = EXCLUDED.max_deliveries,
  advanced_tracking = EXCLUDED.advanced_tracking, watermark = EXCLUDED.watermark,
  custom_branding = EXCLUDED.custom_branding, priority_support = EXCLUDED.priority_support,
  sort_order = EXCLUDED.sort_order;

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  account_type text NOT NULL DEFAULT 'creator' CHECK (account_type IN ('creator','client')),
  display_name text,
  avatar_url text,
  plan_id text NOT NULL DEFAULT 'free' REFERENCES plans(id),
  trial_ends_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_owner_select" ON profiles;
CREATE POLICY "profiles_owner_select" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_owner_insert" ON profiles;
CREATE POLICY "profiles_owner_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_owner_update" ON profiles;
CREATE POLICY "profiles_owner_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ---------- subscriptions ----------
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES plans(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','canceled','trialing')),
  current_period_end timestamptz,
  provider text,
  provider_subscription_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subs_owner_select" ON subscriptions;
CREATE POLICY "subs_owner_select" ON subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "subs_owner_insert" ON subscriptions;
CREATE POLICY "subs_owner_insert" ON subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "subs_owner_update" ON subscriptions;
CREATE POLICY "subs_owner_update" ON subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- protected_files ----------
CREATE TABLE IF NOT EXISTS protected_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  meell_id text NOT NULL UNIQUE,
  title text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  storage_path text NOT NULL,
  cover_url text,
  watermark boolean NOT NULL DEFAULT false,
  watermark_text text,
  status text NOT NULL DEFAULT 'protected' CHECK (status IN ('protected','revoked','deleted')),
  copy_fingerprint text,
  downloads_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE protected_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "files_owner_select" ON protected_files;
CREATE POLICY "files_owner_select" ON protected_files FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "files_owner_insert" ON protected_files;
CREATE POLICY "files_owner_insert" ON protected_files FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "files_owner_update" ON protected_files;
CREATE POLICY "files_owner_update" ON protected_files FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "files_owner_delete" ON protected_files;
CREATE POLICY "files_owner_delete" ON protected_files FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------- clients ----------
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_owner_select" ON clients;
CREATE POLICY "clients_owner_select" ON clients FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "clients_owner_insert" ON clients;
CREATE POLICY "clients_owner_insert" ON clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "clients_owner_update" ON clients;
CREATE POLICY "clients_owner_update" ON clients FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "clients_owner_delete" ON clients;
CREATE POLICY "clients_owner_delete" ON clients FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------- deliveries ----------
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES protected_files(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  secure_token text NOT NULL UNIQUE,
  download_limit integer NOT NULL DEFAULT 3,
  download_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  last_downloaded_at timestamptz,
  first_viewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deliveries_owner_select" ON deliveries;
CREATE POLICY "deliveries_owner_select" ON deliveries FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM protected_files f WHERE f.id = deliveries.file_id AND f.user_id = auth.uid())
);
DROP POLICY IF EXISTS "deliveries_owner_insert" ON deliveries;
CREATE POLICY "deliveries_owner_insert" ON deliveries FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM protected_files f WHERE f.id = deliveries.file_id AND f.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM clients c WHERE c.id = deliveries.client_id AND c.user_id = auth.uid())
);
DROP POLICY IF EXISTS "deliveries_owner_update" ON deliveries;
CREATE POLICY "deliveries_owner_update" ON deliveries FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM protected_files f WHERE f.id = deliveries.file_id AND f.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM protected_files f WHERE f.id = deliveries.file_id AND f.user_id = auth.uid())
);
DROP POLICY IF EXISTS "deliveries_owner_delete" ON deliveries;
CREATE POLICY "deliveries_owner_delete" ON deliveries FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM protected_files f WHERE f.id = deliveries.file_id AND f.user_id = auth.uid())
);

DROP POLICY IF EXISTS "deliveries_client_select" ON deliveries;
CREATE POLICY "deliveries_client_select" ON deliveries FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM clients c WHERE c.id = deliveries.client_id AND c.user_id = auth.uid())
);
DROP POLICY IF EXISTS "deliveries_client_update" ON deliveries;
CREATE POLICY "deliveries_client_update" ON deliveries FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM clients c WHERE c.id = deliveries.client_id AND c.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM clients c WHERE c.id = deliveries.client_id AND c.user_id = auth.uid())
);

-- ---------- delivery_events ----------
CREATE TABLE IF NOT EXISTS delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created','viewed','downloaded','revoked','expired')),
  actor_id uuid,
  meta jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_owner_select" ON delivery_events;
CREATE POLICY "events_owner_select" ON delivery_events FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM deliveries d JOIN protected_files f ON f.id = d.file_id
   WHERE d.id = delivery_events.delivery_id AND f.user_id = auth.uid())
);
DROP POLICY IF EXISTS "events_client_select" ON delivery_events;
CREATE POLICY "events_client_select" ON delivery_events FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM deliveries d JOIN clients c ON c.id = d.client_id
   WHERE d.id = delivery_events.delivery_id AND c.user_id = auth.uid())
);
DROP POLICY IF EXISTS "events_owner_insert" ON delivery_events;
CREATE POLICY "events_owner_insert" ON delivery_events FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM deliveries d JOIN protected_files f ON f.id = d.file_id
   WHERE d.id = delivery_events.delivery_id AND f.user_id = auth.uid())
);
DROP POLICY IF EXISTS "events_client_insert" ON delivery_events;
CREATE POLICY "events_client_insert" ON delivery_events FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM deliveries d JOIN clients c ON c.id = d.client_id
   WHERE d.id = delivery_events.delivery_id AND c.user_id = auth.uid())
);

-- ---------- activity_log ----------
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  description text,
  meta jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_owner_select" ON activity_log;
CREATE POLICY "activity_owner_select" ON activity_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "activity_owner_insert" ON activity_log;
CREATE POLICY "activity_owner_insert" ON activity_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ---------- chat_messages ----------
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_owner_select" ON chat_messages;
CREATE POLICY "chat_owner_select" ON chat_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "chat_owner_insert" ON chat_messages;
CREATE POLICY "chat_owner_insert" ON chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "chat_owner_delete" ON chat_messages;
CREATE POLICY "chat_owner_delete" ON chat_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------- indexes ----------
CREATE INDEX IF NOT EXISTS idx_protected_files_user ON protected_files(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_file ON deliveries(file_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_client ON deliveries(client_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery ON delivery_events(delivery_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id);

-- ---------- storage buckets ----------
INSERT INTO storage.buckets (id, name, public) VALUES ('protected-files', 'protected-files', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('covers', 'covers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "files_storage_owner_insert" ON storage.objects;
CREATE POLICY "files_storage_owner_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'protected-files' AND auth.uid()::text = owner_id);
DROP POLICY IF EXISTS "files_storage_owner_select" ON storage.objects;
CREATE POLICY "files_storage_owner_select" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'protected-files' AND auth.uid()::text = owner_id);

DROP POLICY IF EXISTS "covers_public_read" ON storage.objects;
CREATE POLICY "covers_public_read" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'covers');
DROP POLICY IF EXISTS "covers_owner_insert" ON storage.objects;
CREATE POLICY "covers_owner_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'covers');
DROP POLICY IF EXISTS "covers_owner_update" ON storage.objects;
CREATE POLICY "covers_owner_update" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'covers');
DROP POLICY IF EXISTS "covers_owner_delete" ON storage.objects;
CREATE POLICY "covers_owner_delete" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'covers');
