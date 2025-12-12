import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Singleton Supabase client for API routes
let supabaseClient: SupabaseClient | null = null;

/**
 * Get or create Supabase admin client for API routes.
 * Returns null if environment variables are not configured.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (url && key && !url.includes('placeholder') && url.includes('supabase')) {
      supabaseClient = createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }
  return supabaseClient;
}

/**
 * Higher-order function that wraps API handlers with Supabase client check.
 * Returns 503 if Supabase is not configured.
 */
export function withSupabase<T extends any[]>(
  handler: (supabase: SupabaseClient, ...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    const client = getSupabaseClient();
    
    if (!client) {
      return NextResponse.json(
        { 
          error: 'Database not configured',
          message: 'Please configure Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)'
        },
        { status: 503 }
      );
    }
    
    return handler(client, ...args);
  };
}

/**
 * Standard error response helper
 */
export function errorResponse(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Standard success response helper
 */
export function successResponse<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Validates required query parameters
 */
export function validateParams(
  params: URLSearchParams,
  required: string[]
): { valid: boolean; missing?: string } {
  for (const param of required) {
    if (!params.get(param)) {
      return { valid: false, missing: param };
    }
  }
  return { valid: true };
}

/**
 * Parse date range from query params
 */
export function parseDateRange(
  startDate: string | null,
  endDate: string | null,
  period: string = '30d'
): { start: Date; end: Date } {
  const end = endDate ? new Date(endDate) : new Date();
  let start: Date;

  if (startDate) {
    start = new Date(startDate);
  } else {
    start = new Date(end);
    switch (period) {
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      case '12m':
        start.setFullYear(start.getFullYear() - 1);
        break;
      default:
        start.setDate(start.getDate() - 30);
    }
  }

  return { start, end };
}

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && key && !url.includes('placeholder') && url.includes('supabase'));
}
