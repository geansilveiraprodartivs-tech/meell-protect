export type AccountType = 'creator' | 'client';

export interface Plan {
  id: string;
  name: string;
  price_cents: number;
  price_label: string;
  tagline: string | null;
  popular: boolean;
  max_files: number;
  max_storage_mb: number;
  max_deliveries: number;
  advanced_tracking: boolean;
  watermark: boolean;
  custom_branding: boolean;
  priority_support: boolean;
  sort_order: number;
  checkout_url: string | null;
}

export interface Profile {
  id: string;
  email: string;
  account_type: AccountType;
  display_name: string | null;
  avatar_url: string | null;
  plan_id: string;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  current_period_end: string | null;
  provider: string | null;
  provider_subscription_id: string | null;
  created_at: string;
}

export interface ProtectedFile {
  id: string;
  user_id: string;
  meell_id: string;
  title: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  cover_url: string | null;
  watermark: boolean;
  watermark_text: string | null;
  status: 'protected' | 'revoked' | 'deleted';
  copy_fingerprint: string | null;
  downloads_count: number;
  original_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientRow {
  id: string;
  user_id: string;
  name: string;
  email: string;
  notes: string | null;
  created_at: string;
}

export interface Delivery {
  id: string;
  file_id: string;
  client_id: string;
  secure_token: string;
  download_limit: number;
  download_count: number;
  expires_at: string | null;
  revoked: boolean;
  last_downloaded_at: string | null;
  first_viewed_at: string | null;
  created_at: string;
  copy_id: string | null;
  protection_mode: 'default' | 'watermark' | 'none' | null;
  watermark_config: WatermarkConfig | null;
  allow_resharing?: boolean | null;
  parent_delivery_id?: string | null;
}

export interface WatermarkConfig {
  show_client_name?: boolean;
  show_email?: boolean;
  show_copy_id?: boolean;
  email_mask?: boolean;
}

export interface DeliveryCopy {
  id: string;
  copy_id: string;
  delivery_id: string;
  protected_file_id: string;
  client_id: string;
  user_id: string;
  original_hash: string | null;
  copy_hash: string | null;
  copy_storage_path: string;
  copy_mime_type: string;
  copy_file_name: string;
  copy_size: number;
  protection_mode: string;
  watermark_config: WatermarkConfig | null;
  status: string;
  created_at: string;
  updated_at: string;
  /** copy_id of the parent (source) copy when this was created via resharing */
  parent_copy_id?: string | null;
  /** client who reshared the source delivery that generated this copy */
  shared_by_client_id?: string | null;
}

export interface DeliveryEvent {
  id: string;
  delivery_id: string;
  event_type: 'created' | 'viewed' | 'downloaded' | 'revoked' | 'expired' | 'shared' | 'blocked';
  actor_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  event: string;
  description: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface DeliveryWithRelations extends Delivery {
  file?: ProtectedFile;
  client?: ClientRow;
  copy?: DeliveryCopy;
}

export interface FileWithCounts extends ProtectedFile {
  deliveries?: Delivery[];
}
