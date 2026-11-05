export type Role = 'owner' | 'manager' | 'staff';

export interface TokenPair {
  token_type: 'Bearer';
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
  tenant_id: string;
  role: Role;
}

export interface User {
  id: string;
  email: string;
  name: string;
  locale: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: 'active' | 'suspended';
}

export interface Membership {
  tenant_id: string;
  tenant_name: string;
  tenant_status: string;
  role: Role;
}

export interface Me {
  user: User;
  tenant: Tenant;
  role: Role;
  memberships: Membership[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
