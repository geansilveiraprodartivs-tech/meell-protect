/*
# Meell Protect — Sharing Chain: cadeia de custódia para recompartilhamentos

1. Objetivo
   - Permite rastrear a cadeia completa de compartilhamentos autorizados (A→B→C).
   - Cada recompartilhamento via "Compartilhar com proteção" gera uma nova cópia
     protegida com fingerprint único vinculada à cópia de origem via parent_copy_id.

2. Alterações em delivery_copies (aditivas, sem perda de dados)
   - parent_copy_id text → link da cópia filha para a cópia pai (auto-referência)
   - shared_by_client_id uuid → cliente que disparou o recompartilhamento (nullable)

3. Alterações em delivery_events
   - Constraint event_type estendida para incluir 'shared'

4. Índices
   - Índice em parent_copy_id para travessia eficiente da cadeia

5. Segurança
   - Nenhuma política RLS alterada. Policies existentes preservadas.
   - Nenhum dado existente é modificado ou excluído.
*/

-- Colunas de cadeia de compartilhamento em delivery_copies
ALTER TABLE delivery_copies
  ADD COLUMN IF NOT EXISTS parent_copy_id text REFERENCES delivery_copies(copy_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shared_by_client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

-- Índice para travessia da cadeia
CREATE INDEX IF NOT EXISTS delivery_copies_parent_copy_id_idx ON delivery_copies(parent_copy_id);

-- Estender delivery_events.event_type para incluir 'shared'
ALTER TABLE delivery_events DROP CONSTRAINT IF EXISTS delivery_events_event_type_check;
ALTER TABLE delivery_events ADD CONSTRAINT delivery_events_event_type_check
  CHECK (event_type IN ('created','viewed','downloaded','revoked','expired','shared'));
