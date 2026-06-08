export interface AuthUser {
  id: string;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
  role: 'user' | 'admin';
  admin_level: number;
  authorized_app_count: number;
}

export interface AuthorizedApp {
  client_id: string;
  client_name: string;
  last_authorized_at: string;
  authorization_count: number;
  last_scopes: string[];
}

export interface AuthorizedAppsResponse {
  total: number;
  items: AuthorizedApp[];
}

export const ClientAccessRequestStatus = {
  Pending: 0,
  Approved: 1,
  Rejected: 2,
} as const;

export type ClientAccessRequestStatus =
  (typeof ClientAccessRequestStatus)[keyof typeof ClientAccessRequestStatus];

export const clientAccessRequestStatusMeta: Record<
  ClientAccessRequestStatus,
  { className: string; label: string }
> = {
  [ClientAccessRequestStatus.Pending]: { className: 'pending', label: 'pending' },
  [ClientAccessRequestStatus.Approved]: { className: 'approved', label: 'approved' },
  [ClientAccessRequestStatus.Rejected]: { className: 'rejected', label: 'rejected' },
};

export interface ClientAccessRequestItem {
  id: string;
  site_url: string;
  site_name: string;
  request_description: string;
  status: ClientAccessRequestStatus;
  admin_note?: string | null;
  approved_client_id?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

export interface ClientAccessRequestListResponse {
  total: number;
  pending_count: number;
  items: ClientAccessRequestItem[];
}

export interface ClientCredentialDeliveryResponse {
  request_id: string;
  client_id: string;
  client_name: string;
  client_type: 'public' | 'confidential';
  client_secret?: string | null;
  redirect_uris: string[];
  scopes: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
  expires_at: string;
  read_once_notice: string;
}

export interface CaptchaConfig {
  turnstile_enabled: boolean;
  turnstile_site_key?: string | null;
  registration_enabled: boolean;
}

export interface ConsentView {
  request_id: string;
  client_id: string;
  client_name: string;
  redirect_uri: string;
  scopes: string[];
  csrf_token?: string | null;
}

export interface AdminUserItem {
  id: string;
  email: string;
  display_name?: string | null;
  is_active: boolean;
  role: 'user' | 'admin';
  admin_level: number;
  created_at: string;
}

export interface AdminUserListResponse {
  total: number;
  page: number;
  page_size: number;
  items: AdminUserItem[];
}

export interface AdminClientItem {
  client_id: string;
  client_name: string;
  client_type: 'public' | 'confidential';
  redirect_uris: string[];
  scopes: string[];
  allowed_audiences: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
  is_active: boolean;
  client_secret?: string;
}

export interface AdminClientListResponse {
  total: number;
  page: number;
  page_size: number;
  items: AdminClientItem[];
}

export interface AdminGrantItem {
  user_id: string;
  email: string;
  client_id: string;
  client_name: string;
  last_authorized_at: string;
  authorization_count: number;
  last_scopes: string[];
}

export interface AdminGrantListResponse {
  total: number;
  page: number;
  page_size: number;
  items: AdminGrantItem[];
}

export interface AdminGrantRevokeResponse {
  revoked_refresh_tokens: number;
  removed_grants: number;
}

export interface AdminAccessRequestItem {
  id: string;
  user_id: string;
  user_email: string;
  site_name: string;
  site_url: string;
  request_description: string;
  status: ClientAccessRequestStatus;
  admin_note?: string | null;
  approved_client_id?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

export interface AdminAccessRequestListResponse {
  total: number;
  page: number;
  page_size: number;
  items: AdminAccessRequestItem[];
}
