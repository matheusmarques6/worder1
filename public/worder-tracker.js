/**
 * Worder Tracker - Client-side tracking script
 * Tracks page views, events, and user identification
 */
(function() {
  'use strict';

  var TRACKER_VERSION = '1.0.0';
  var apiBase = '';
  var orgId = '';
  var sessionId = '';
  var visitorId = '';

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function getOrCreateVisitorId() {
    var stored = localStorage.getItem('worder_visitor_id');
    if (stored) return stored;
    var id = generateId();
    localStorage.setItem('worder_visitor_id', id);
    return id;
  }

  function sendEvent(eventType, properties) {
    if (!apiBase || !orgId) return;

    var payload = {
      event_type: eventType,
      organization_id: orgId,
      visitor_id: visitorId,
      session_id: sessionId,
      url: window.location.href,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      properties: properties || {}
    };

    if (navigator.sendBeacon) {
      navigator.sendBeacon(apiBase + '/api/track', JSON.stringify(payload));
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', apiBase + '/api/track', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(payload));
    }
  }

  // Public API
  window.worder = {
    init: function(config) {
      apiBase = config.apiUrl || config.url || '';
      orgId = config.organizationId || config.orgId || '';
      sessionId = generateId();
      visitorId = getOrCreateVisitorId();

      // Auto-track page view
      if (config.trackPageViews !== false) {
        this.trackPageView();
      }
    },

    trackPageView: function(properties) {
      sendEvent('page_view', Object.assign({
        title: document.title,
        path: window.location.pathname
      }, properties || {}));
    },

    trackEvent: function(eventName, properties) {
      sendEvent(eventName, properties || {});
    },

    identify: function(contactId, traits) {
      visitorId = contactId;
      localStorage.setItem('worder_visitor_id', contactId);
      sendEvent('identify', Object.assign({ contact_id: contactId }, traits || {}));
    },

    trackPurchase: function(order) {
      sendEvent('purchase', {
        order_id: order.id || order.order_id,
        total: order.total || order.value,
        currency: order.currency || 'BRL',
        items: order.items || []
      });
    },

    version: TRACKER_VERSION
  };

  // Auto-init from script tag data attributes
  var scripts = document.getElementsByTagName('script');
  var currentScript = scripts[scripts.length - 1];
  var autoOrgId = currentScript.getAttribute('data-org-id');
  var autoApiUrl = currentScript.getAttribute('data-api-url');

  if (autoOrgId) {
    window.worder.init({
      orgId: autoOrgId,
      apiUrl: autoApiUrl || window.location.origin
    });
  }
})();
