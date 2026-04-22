// =============================================
// Shopify GraphQL Queries
// src/lib/shopify/graphql-queries.ts
//
// All read queries for the Shopify Admin GraphQL API v2024-10
// =============================================

// =============================================
// SHOP
// =============================================

export const SHOP_QUERY = `
  query ShopInfo {
    shop {
      id
      name
      email
      url
      myshopifyDomain
      plan {
        displayName
        partnerDevelopment
        shopifyPlus
      }
      currencyCode
      primaryDomain {
        url
        host
      }
      billingAddress {
        country
        countryCodeV2
        province
      }
      timezoneAbbreviation
      ianaTimezone
      createdAt
    }
  }
`;

// =============================================
// CUSTOMERS
// =============================================

export const CUSTOMERS_QUERY = `
  query Customers($first: Int!, $after: String, $query: String, $sortKey: CustomerSortKeys) {
    customers(first: $first, after: $after, query: $query, sortKey: $sortKey) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        firstName
        lastName
        email
        phone
        createdAt
        updatedAt
        state
        tags
        note
        verifiedEmail
        taxExempt
        locale
        numberOfOrders
        amountSpent {
          amount
          currencyCode
        }
        defaultAddress {
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
          phone
        }
        addresses {
          address1
          city
          province
          country
          countryCodeV2
          zip
        }
        emailMarketingConsent {
          marketingState
          consentUpdatedAt
          marketingOptInLevel
        }
        smsMarketingConsent {
          marketingState
          consentUpdatedAt
          marketingOptInLevel
        }
        metafields(first: 10) {
          nodes {
            namespace
            key
            value
            type
          }
        }
      }
    }
  }
`;

export const CUSTOMER_BY_ID_QUERY = `
  query CustomerById($id: ID!) {
    customer(id: $id) {
      id
      firstName
      lastName
      email
      phone
      createdAt
      updatedAt
      state
      tags
      note
      numberOfOrders
      amountSpent {
        amount
        currencyCode
      }
      defaultAddress {
        address1
        address2
        city
        province
        provinceCode
        country
        countryCodeV2
        zip
        phone
      }
      emailMarketingConsent {
        marketingState
        consentUpdatedAt
        marketingOptInLevel
      }
      smsMarketingConsent {
        marketingState
        consentUpdatedAt
        marketingOptInLevel
      }
      orders(first: 10, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          name
          createdAt
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          financialStatus
          fulfillmentStatus
        }
      }
    }
  }
`;

// =============================================
// ORDERS
// =============================================

export const ORDERS_QUERY = `
  query Orders($first: Int!, $after: String, $query: String, $sortKey: OrderSortKeys) {
    orders(first: $first, after: $after, query: $query, sortKey: $sortKey) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        email
        phone
        createdAt
        updatedAt
        processedAt
        closedAt
        cancelledAt
        cancelReason
        financialStatus
        fulfillmentStatus
        confirmed
        paymentGatewayNames
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalShippingPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalDiscountsSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalRefundedSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        customer {
          id
          firstName
          lastName
          email
          phone
        }
        lineItems(first: 50) {
          nodes {
            id
            title
            quantity
            sku
            variantTitle
            originalUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            product {
              id
            }
            variant {
              id
            }
          }
        }
        shippingAddress {
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
          phone
          firstName
          lastName
        }
        billingAddress {
          address1
          address2
          city
          province
          country
          countryCodeV2
          zip
        }
        discountCodes
        tags
        note
        fulfillments {
          id
          status
          createdAt
          trackingInfo {
            number
            url
            company
          }
        }
        refunds {
          id
          createdAt
          totalRefundedSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          refundLineItems(first: 20) {
            nodes {
              quantity
              lineItem {
                title
              }
            }
          }
        }
        transactions(first: 10) {
          gateway
          kind
          status
          amountSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

export const ORDER_BY_ID_QUERY = `
  query OrderById($id: ID!) {
    order(id: $id) {
      id
      name
      email
      phone
      createdAt
      updatedAt
      financialStatus
      fulfillmentStatus
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      customer {
        id
        firstName
        lastName
        email
        phone
      }
      lineItems(first: 50) {
        nodes {
          id
          title
          quantity
          sku
          variantTitle
          originalUnitPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          product {
            id
          }
        }
      }
      shippingAddress {
        address1
        city
        province
        country
        zip
      }
      fulfillments {
        id
        status
        trackingInfo {
          number
          url
          company
        }
      }
      refunds {
        id
        totalRefundedSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

// =============================================
// ABANDONED CHECKOUTS
// =============================================

export const ABANDONED_CHECKOUTS_QUERY = `
  query AbandonedCheckouts($first: Int!, $after: String, $query: String) {
    abandonedCheckouts(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        createdAt
        updatedAt
        completedAt
        abandonedCheckoutUrl
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        email
        phone
        customer {
          id
          firstName
          lastName
          email
          phone
        }
        lineItems(first: 50) {
          nodes {
            title
            quantity
            sku
            variantTitle
            variant {
              id
              price
              product {
                id
                title
                featuredImage {
                  url
                }
              }
            }
          }
        }
        shippingAddress {
          address1
          city
          province
          country
          countryCodeV2
          zip
          phone
          firstName
          lastName
        }
        billingAddress {
          address1
          city
          province
          country
          zip
        }
      }
    }
  }
`;

// =============================================
// PRODUCTS
// =============================================

export const PRODUCTS_QUERY = `
  query Products($first: Int!, $after: String, $query: String, $sortKey: ProductSortKeys) {
    products(first: $first, after: $after, query: $query, sortKey: $sortKey) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        descriptionHtml
        vendor
        productType
        tags
        status
        createdAt
        updatedAt
        publishedAt
        totalInventory
        tracksInventory
        featuredImage {
          url
          altText
        }
        images(first: 5) {
          nodes {
            url
            altText
          }
        }
        variants(first: 50) {
          nodes {
            id
            title
            sku
            price
            compareAtPrice
            inventoryQuantity
            barcode
            selectedOptions {
              name
              value
            }
          }
        }
        options {
          name
          values
        }
      }
    }
  }
`;

export const PRODUCT_BY_ID_QUERY = `
  query ProductById($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      vendor
      productType
      tags
      status
      totalInventory
      variants(first: 50) {
        nodes {
          id
          title
          sku
          price
          compareAtPrice
          inventoryQuantity
        }
      }
      featuredImage {
        url
      }
    }
  }
`;

// =============================================
// WEBHOOKS
// =============================================

export const WEBHOOK_SUBSCRIPTIONS_QUERY = `
  query WebhookSubscriptions($first: Int!, $after: String) {
    webhookSubscriptions(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        topic
        endpoint {
          __typename
          ... on WebhookHttpEndpoint {
            callbackUrl
          }
        }
        format
        createdAt
        updatedAt
      }
    }
  }
`;

// =============================================
// WEB PIXELS
// =============================================

export const WEB_PIXEL_QUERY = `
  query WebPixel {
    webPixel {
      id
      settings
    }
  }
`;
