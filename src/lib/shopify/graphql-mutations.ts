// =============================================
// Shopify GraphQL Mutations
// src/lib/shopify/graphql-mutations.ts
//
// All write mutations for the Shopify Admin GraphQL API v2026-01
// =============================================

// =============================================
// WEBHOOK SUBSCRIPTIONS
// =============================================

export const WEBHOOK_SUBSCRIPTION_CREATE = `
  mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription {
        id
        topic
        endpoint {
          __typename
          ... on WebhookHttpEndpoint {
            callbackUrl
          }
        }
        format
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const WEBHOOK_SUBSCRIPTION_DELETE = `
  mutation WebhookSubscriptionDelete($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors {
        field
        message
      }
    }
  }
`;

export const WEBHOOK_SUBSCRIPTION_UPDATE = `
  mutation WebhookSubscriptionUpdate($id: ID!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionUpdate(id: $id, webhookSubscription: $webhookSubscription) {
      webhookSubscription {
        id
        topic
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// =============================================
// WEB PIXEL
// =============================================

export const WEB_PIXEL_CREATE = `
  mutation WebPixelCreate($webPixel: WebPixelInput!) {
    webPixelCreate(webPixel: $webPixel) {
      webPixel {
        id
        settings
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

export const WEB_PIXEL_UPDATE = `
  mutation WebPixelUpdate($id: ID!, $webPixel: WebPixelInput!) {
    webPixelUpdate(id: $id, webPixel: $webPixel) {
      webPixel {
        id
        settings
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

export const WEB_PIXEL_DELETE = `
  mutation WebPixelDelete($id: ID!) {
    webPixelDelete(id: $id) {
      deletedWebPixelId
      userErrors {
        code
        field
        message
      }
    }
  }
`;

// =============================================
// CUSTOMER MUTATIONS
// =============================================

export const CUSTOMER_UPDATE = `
  mutation CustomerUpdate($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer {
        id
        firstName
        lastName
        email
        phone
        tags
        note
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// =============================================
// HELPER TYPES
// =============================================

/**
 * All webhook topics to register.
 * These map to Shopify's GraphQL WebhookSubscriptionTopic enum.
 */
export const WEBHOOK_TOPICS_TO_REGISTER = [
  'ORDERS_CREATE',
  'ORDERS_UPDATED',
  'ORDERS_FULFILLED',
  'ORDERS_CANCELLED',
  'ORDERS_PAID',
  'CHECKOUTS_CREATE',
  'CHECKOUTS_UPDATE',
  'CUSTOMERS_CREATE',
  'CUSTOMERS_UPDATE',
  'CUSTOMERS_DELETE',
  'CUSTOMERS_EMAIL_MARKETING_CONSENT_UPDATE',
  'PRODUCTS_CREATE',
  'PRODUCTS_UPDATE',
  'PRODUCTS_DELETE',
  'REFUNDS_CREATE',
  'FULFILLMENTS_CREATE',
  'FULFILLMENTS_UPDATE',
  'APP_UNINSTALLED',
] as const;

export type WebhookTopic = typeof WEBHOOK_TOPICS_TO_REGISTER[number];
