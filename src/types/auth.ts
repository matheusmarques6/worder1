export interface UserMetadata {
  name?: string;
  role?: string;
  organization_id?: string;
  is_agent?: boolean;
  agent_id?: string;
  [key: string]: any;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  company_name?: string;
  organization_id?: string;
  role?: string;
  user_metadata?: UserMetadata;
  created_at: string;
  updated_at: string;
}
