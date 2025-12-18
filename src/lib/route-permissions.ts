// =====================================================
// ROUTE PERMISSIONS CONFIGURATION
// Define quais rotas são acessíveis por cada tipo de usuário
// =====================================================

// Rotas que não precisam de autenticação
export const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/change-password',
  '/_next',
  '/api/auth',
  '/api/webhooks',
  '/api/public',
]

// Rotas permitidas para agentes
export const AGENT_ALLOWED_ROUTES = [
  '/inbox',
  '/agent',
  '/profile',
  '/api/whatsapp/conversations',
  '/api/whatsapp/messages',
  '/api/profile',
  '/api/whatsapp/agents/status', // Para mudar próprio status
]

// Rotas exclusivas de owner/admin (bloqueadas para agentes)
export const ADMIN_ONLY_ROUTES = [
  '/dashboard',
  '/crm',
  '/whatsapp',
  '/automations',
  '/integrations',
  '/settings',
  '/api-keys',
  '/analytics',
  '/shopify',
  '/email-marketing',
  '/facebook-ads',
  '/google-ads',
  '/tiktok-ads',
]

// APIs bloqueadas para agentes
export const ADMIN_ONLY_APIS = [
  '/api/whatsapp/agents',
  '/api/whatsapp/numbers',
  '/api/api-keys',
  '/api/automations',
  '/api/integrations',
  '/api/settings',
  '/api/ai/models',
]

// Verificar se rota é pública
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route))
}

// Verificar se rota é permitida para agentes
export function isAgentAllowedRoute(pathname: string): boolean {
  return AGENT_ALLOWED_ROUTES.some(route => pathname.startsWith(route))
}

// Verificar se rota é exclusiva de admin
export function isAdminOnlyRoute(pathname: string): boolean {
  return ADMIN_ONLY_ROUTES.some(route => pathname.startsWith(route)) ||
         ADMIN_ONLY_APIS.some(route => pathname.startsWith(route))
}

// Obter rota de redirecionamento baseado no role
export function getRedirectRoute(isAgent: boolean): string {
  return isAgent ? '/inbox' : '/dashboard'
}
