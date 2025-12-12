import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Placeholder URL for build time (never used for actual requests)
const PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const PLACEHOLDER_KEY = 'placeholder-key'

// Check if we have valid Supabase configuration
const hasValidConfig = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return url && key && !url.includes('placeholder') && url.includes('supabase')
}

// Client-side Supabase client (for use in components)
export const createBrowserClient = () => {
  if (!hasValidConfig()) {
    // Return a mock client during build or when not configured
    console.warn('Supabase not configured. Using mock client.')
  }
  return createClientComponentClient()
}

// Server-side Supabase client (for use in Server Components and API routes)
export const createServerClient = (): SupabaseClient | null => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
    console.warn('Supabase server client: Missing or invalid configuration')
    return null
  }
  
  return createClient(supabaseUrl, supabaseAnonKey)
}

// Admin client (for server-side operations that need full access)
export const createAdminClient = (): SupabaseClient | null => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.includes('placeholder')) {
    console.warn('Supabase admin client: Missing or invalid configuration')
    return null
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Check if Supabase is properly configured
export const isSupabaseConfigured = hasValidConfig

// Type for database schema
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string
          avatar_url: string | null
          company_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          name: string
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          avatar_url?: string | null
          company_name?: string | null
          updated_at?: string
        }
      }
      shopify_stores: {
        Row: {
          id: string
          user_id: string
          shop_domain: string
          access_token: string
          shop_name: string
          currency: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          shop_domain: string
          access_token: string
          shop_name: string
          currency?: string
          created_at?: string
        }
        Update: {
          shop_domain?: string
          access_token?: string
          shop_name?: string
          currency?: string
        }
      }
      klaviyo_integrations: {
        Row: {
          id: string
          user_id: string
          api_key: string
          public_api_key: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          api_key: string
          public_api_key?: string | null
          created_at?: string
        }
        Update: {
          api_key?: string
          public_api_key?: string | null
        }
      }
      pipelines: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          color: string
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          color?: string
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          color?: string
          position?: number
          updated_at?: string
        }
      }
      pipeline_columns: {
        Row: {
          id: string
          pipeline_id: string
          name: string
          color: string
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          pipeline_id: string
          name: string
          color?: string
          position?: number
          created_at?: string
        }
        Update: {
          name?: string
          color?: string
          position?: number
        }
      }
      contacts: {
        Row: {
          id: string
          user_id: string
          name: string
          email: string | null
          phone: string | null
          whatsapp: string | null
          company: string | null
          position: string | null
          avatar_url: string | null
          tags: string[]
          custom_fields: Record<string, any>
          shopify_customer_id: string | null
          total_revenue: number
          total_orders: number
          last_order_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          email?: string | null
          phone?: string | null
          whatsapp?: string | null
          company?: string | null
          position?: string | null
          avatar_url?: string | null
          tags?: string[]
          custom_fields?: Record<string, any>
          shopify_customer_id?: string | null
          total_revenue?: number
          total_orders?: number
          last_order_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          email?: string | null
          phone?: string | null
          whatsapp?: string | null
          company?: string | null
          position?: string | null
          avatar_url?: string | null
          tags?: string[]
          custom_fields?: Record<string, any>
          shopify_customer_id?: string | null
          total_revenue?: number
          total_orders?: number
          last_order_date?: string | null
          updated_at?: string
        }
      }
      deals: {
        Row: {
          id: string
          pipeline_id: string
          column_id: string
          contact_id: string
          user_id: string
          title: string
          value: number
          currency: string
          probability: number
          expected_close_date: string | null
          notes: string | null
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          pipeline_id: string
          column_id: string
          contact_id: string
          user_id: string
          title: string
          value?: number
          currency?: string
          probability?: number
          expected_close_date?: string | null
          notes?: string | null
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          pipeline_id?: string
          column_id?: string
          contact_id?: string
          title?: string
          value?: number
          currency?: string
          probability?: number
          expected_close_date?: string | null
          notes?: string | null
          position?: number
          updated_at?: string
        }
      }
      whatsapp_conversations: {
        Row: {
          id: string
          user_id: string
          contact_id: string | null
          phone_number: string
          contact_name: string | null
          last_message: string | null
          last_message_at: string | null
          unread_count: number
          status: string
          assigned_to: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          contact_id?: string | null
          phone_number: string
          contact_name?: string | null
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number
          status?: string
          assigned_to?: string | null
          created_at?: string
        }
        Update: {
          contact_id?: string | null
          contact_name?: string | null
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number
          status?: string
          assigned_to?: string | null
        }
      }
      whatsapp_messages: {
        Row: {
          id: string
          conversation_id: string
          from_number: string
          to_number: string
          type: string
          content: string
          media_url: string | null
          status: string
          is_outgoing: boolean
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          from_number: string
          to_number: string
          type?: string
          content: string
          media_url?: string | null
          status?: string
          is_outgoing?: boolean
          created_at?: string
        }
        Update: {
          status?: string
        }
      }
      automations: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          status: string
          trigger: Record<string, any>
          nodes: Record<string, any>[]
          edges: Record<string, any>[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          status?: string
          trigger: Record<string, any>
          nodes?: Record<string, any>[]
          edges?: Record<string, any>[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          status?: string
          trigger?: Record<string, any>
          nodes?: Record<string, any>[]
          edges?: Record<string, any>[]
          updated_at?: string
        }
      }
    }
  }
}
