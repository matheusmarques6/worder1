// =============================================
// GET /api/storefront/loader.js
//
// Storefront popup loader for manual (Custom App) Shopify integrations.
//
// The Theme App Embed (worder-theme-ext) auto-injects popups for OAuth
// integrations, but manual integrations don't have access to that
// extension — it's part of the Worder app, not the merchant's Custom App.
// And Shopify Custom Pixels run in a sandboxed iframe, so they can't
// inject DOM into the parent page.
//
// This loader is a regular <script> the merchant pastes in their
// theme.liquid (or just before </body> in any storefront page). It runs
// in the page DOM, detects the shop domain, fetches the list of
// published forms for that store, and injects each form's hosted script.
//
// Usage:
//   <script src="https://app.worder.com.br/api/storefront/loader.js" async></script>
// =============================================

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.worder.com.br';

  const js = `// Worder Popup Loader for manual Shopify integrations
(function () {
  'use strict';
  if (window.__worderLoaded) return;
  window.__worderLoaded = true;

  // One-popup-at-a-time arbitration (R11): every popup script consults this
  // global mutex before opening (embedded forms are exempt — they are page
  // content). Initialized here so it exists before any popup script runs;
  // the popup scripts set it to their form id on open and clear it on close.
  window.__wfOpenPopup = window.__wfOpenPopup || null;

  var APP_URL = ${JSON.stringify(appUrl)};

  // Detect shop domain. Shopify exposes 'Shopify.shop' as a global on every
  // storefront page (e.g. "sourosa.myshopify.com"). Fall back to the host
  // header for non-standard themes.
  function getShopDomain() {
    try {
      if (window.Shopify && window.Shopify.shop) return window.Shopify.shop;
    } catch (e) {}
    return window.location.host;
  }

  var shopDomain = getShopDomain();
  if (!shopDomain) return;

  // Set up window.__worder.config so popup scripts can read it.
  window.__worder = window.__worder || {};
  window.__worder.config = window.__worder.config || {
    shopDomain: shopDomain,
    endpoint: APP_URL + '/api/track',
  };

  // Hydrate logged-in customer identity from Shopify's customer global, when
  // present. The OAuth Theme App Embed reads this from Liquid; here we read
  // it from window.ShopifyAnalytics.meta.page.customerId or window.__st.cid
  // (Shopify exposes both on storefronts that have customers).
  try {
    var meta = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
    if (meta && meta.page && meta.page.customerId) {
      window.__worder.customer = window.__worder.customer || {
        shopifyCustomerId: String(meta.page.customerId),
      };
    }
  } catch (e) {}

  // Activation ping — let the dashboard know the loader is live on this
  // storefront. Same heuristic the Theme App Embed uses. One per session.
  (function pingEmbed() {
    try {
      var pingedKey = '__worder_embed_ping_v1';
      if (sessionStorage.getItem(pingedKey)) return;
      var payload = JSON.stringify({ shopDomain: shopDomain });
      var sent = false;
      if (navigator.sendBeacon) {
        try {
          sent = navigator.sendBeacon(
            APP_URL + '/api/storefront/embed-ping',
            new Blob([payload], { type: 'application/json' })
          );
        } catch (e) {}
      }
      if (!sent) {
        try {
          var x = new XMLHttpRequest();
          x.open('POST', APP_URL + '/api/storefront/embed-ping', true);
          x.setRequestHeader('Content-Type', 'application/json');
          x.send(payload);
        } catch (e) {}
      }
      sessionStorage.setItem(pingedKey, '1');
    } catch (e) {}
  })();

  // Fetch the list of published popups for this shop and inject each one.
  function loadPopups() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', APP_URL + '/api/public/forms?domain=' + encodeURIComponent(shopDomain) + '&status=published', true);
      xhr.onload = function () {
        if (xhr.status !== 200) return;
        try {
          var data = JSON.parse(xhr.responseText);
          var forms = (data && data.forms) || [];
          forms.forEach(function (form) {
            if (!form || !form.id) return;
            var s = document.createElement('script');
            s.src = APP_URL + '/api/public/forms/' + form.id + '/script';
            s.async = true;
            document.head.appendChild(s);
          });
        } catch (e) {}
      };
      xhr.send();
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPopups);
  } else {
    loadPopups();
  }
})();
`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
