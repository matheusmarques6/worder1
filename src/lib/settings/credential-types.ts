// Tipos de credenciais (Configurações → Credenciais). Espelha a lista aceita
// pelo servidor em /api/credentials — só tipos que o backend sabe guardar e testar.

export interface CredentialField { name: string; label: string; type: 'text' | 'password' | 'url' | 'email' | 'number'; required: boolean; placeholder?: string; help?: string }
export interface CredentialType { type: string; name: string; icon: string; description: string; fields: CredentialField[]; testable: boolean }

export const CREDENTIAL_TYPES: CredentialType[] = [
  { type: 'whatsappBusiness', name: 'WhatsApp Business Cloud', icon: 'wa', description: 'API oficial do WhatsApp Business via Meta', testable: true, fields: [
    { name: 'phoneNumberId', label: 'Phone Number ID', type: 'text', required: true, placeholder: 'Ex: 123456789012345' },
    { name: 'accessToken', label: 'Access Token', type: 'password', required: true, placeholder: 'Token de acesso permanente' },
    { name: 'businessAccountId', label: 'Business Account ID', type: 'text', required: false, placeholder: 'WABA ID (opcional)' },
    { name: 'webhookVerifyToken', label: 'Token de verificação do webhook', type: 'text', required: false, placeholder: 'Opcional' },
  ] },
  { type: 'emailResend', name: 'E-mail (Resend)', icon: 'mail', description: 'Envio de e-mails via Resend', testable: true, fields: [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 're_xxx…' },
    { name: 'defaultFrom', label: 'E-mail padrão', type: 'email', required: true, placeholder: 'noreply@seudominio.com' },
  ] },
  { type: 'emailSendgrid', name: 'E-mail (SendGrid)', icon: 'mail', description: 'Envio de e-mails via SendGrid', testable: true, fields: [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'SG.xxx…' },
    { name: 'defaultFrom', label: 'E-mail padrão', type: 'email', required: true, placeholder: 'noreply@seudominio.com' },
  ] },
  { type: 'emailSmtp', name: 'E-mail (SMTP)', icon: 'mail', description: 'Servidor SMTP próprio', testable: false, fields: [
    { name: 'host', label: 'Servidor', type: 'text', required: true, placeholder: 'smtp.seudominio.com' },
    { name: 'port', label: 'Porta', type: 'number', required: true, placeholder: '587' },
    { name: 'username', label: 'Usuário', type: 'text', required: true },
    { name: 'password', label: 'Senha', type: 'password', required: true },
    { name: 'secure', label: 'TLS (true/false)', type: 'text', required: false, placeholder: 'true' },
  ] },
  { type: 'shopifyOAuth2', name: 'Shopify', icon: 'store', description: 'Integração com lojas Shopify', testable: true, fields: [
    { name: 'shopDomain', label: 'Domínio da loja', type: 'text', required: true, placeholder: 'sua-loja.myshopify.com' },
    { name: 'accessToken', label: 'Access Token', type: 'password', required: true, placeholder: 'shpat_xxx…' },
  ] },
  { type: 'klaviyo', name: 'Klaviyo', icon: 'send', description: 'Chave privada da conta Klaviyo (migração)', testable: false, fields: [
    { name: 'apiKey', label: 'Chave privada', type: 'password', required: true, placeholder: 'pk_xxx…' },
    { name: 'publicKey', label: 'Chave pública', type: 'text', required: false },
  ] },
  { type: 'httpBasicAuth', name: 'HTTP Basic Auth', icon: 'globe', description: 'Autenticação básica para APIs REST', testable: true, fields: [
    { name: 'username', label: 'Usuário', type: 'text', required: true },
    { name: 'password', label: 'Senha', type: 'password', required: true },
  ] },
  { type: 'httpBearerToken', name: 'HTTP Bearer Token', icon: 'key', description: 'Token no header Authorization', testable: false, fields: [
    { name: 'token', label: 'Token', type: 'password', required: true },
  ] },
  { type: 'httpApiKey', name: 'HTTP API Key', icon: 'key', description: 'Autenticação via header ou query param', testable: true, fields: [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'headerName', label: 'Nome do header', type: 'text', required: false, placeholder: 'X-API-Key (padrão)' },
  ] },
]

export const credentialType = (t: string) => CREDENTIAL_TYPES.find((c) => c.type === t)
