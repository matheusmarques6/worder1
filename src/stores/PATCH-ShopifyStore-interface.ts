// ===============================
// PATCH PARA: src/stores/index.ts
// ===============================
// 
// Encontrar a interface ShopifyStore e ADICIONAR os campos:
//   organization_id: string
//   organization_name?: string
//
// ===============================

// ANTES (interface atual):
/*
export interface ShopifyStore {
  id: string
  name: string
  domain: string
  email?: string
  currency?: string
  isActive: boolean
  totalOrders?: number
  totalRevenue?: number
  lastSyncAt?: string
}
*/

// DEPOIS (interface corrigida):
export interface ShopifyStore {
  id: string
  name: string
  domain: string
  email?: string
  currency?: string
  isActive: boolean
  totalOrders?: number
  totalRevenue?: number
  lastSyncAt?: string
  // ✅ ADICIONAR ESTES CAMPOS:
  organization_id: string
  organization_name?: string
  connectionStatus?: string
  statusMessage?: string
  healthCheckedAt?: string
  consecutiveFailures?: number
}
