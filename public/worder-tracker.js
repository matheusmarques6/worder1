(function() {
  'use strict';
  var script = document.currentScript;
  if (!script) return;

  var orgId = script.getAttribute('data-org');
  if (!orgId) { console.warn('[Worder] data-org attribute required'); return; }

  var baseUrl = script.src.replace('/worder-tracker.js', '');

  // Visitor ID (persistent)
  var vid = localStorage.getItem('_wdr_vid');
  if (!vid) {
    vid = 'v_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem('_wdr_vid', vid);
  }

  // Session ID (per session)
  var sid = sessionStorage.getItem('_wdr_sid');
  if (!sid) {
    sid = 's_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    sessionStorage.setItem('_wdr_sid', sid);
  }

  function getUTMs() {
    var p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get('utm_source') || undefined,
      utm_medium: p.get('utm_medium') || undefined,
      utm_campaign: p.get('utm_campaign') || undefined,
      utm_term: p.get('utm_term') || undefined,
      utm_content: p.get('utm_content') || undefined,
      fbclid: p.get('fbclid') || undefined,
      gclid: p.get('gclid') || undefined,
      ttclid: p.get('ttclid') || undefined
    };
  }

  function track(eventName, data) {
    var payload = {
      org_id: orgId,
      visitor_id: vid,
      session_id: sid,
      event_name: eventName,
      page_url: window.location.href,
      referrer: document.referrer || undefined,
      user_agent: navigator.userAgent
    };

    var utms = getUTMs();
    for (var k in utms) {
      if (utms[k]) payload[k] = utms[k];
    }

    if (data) payload.custom_data = data;

    if (navigator.sendBeacon) {
      navigator.sendBeacon(baseUrl + '/api/track', JSON.stringify(payload));
    } else {
      fetch(baseUrl + '/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function() {});
    }
  }

  // Auto-track page view
  track('page_view');

  // Expose global function
  window.worderTrack = track;

  // Track identify (when email is known)
  window.worderIdentify = function(email, data) {
    var payload = {
      org_id: orgId,
      visitor_id: vid,
      session_id: sid,
      event_name: 'identify',
      page_url: window.location.href,
      email: email,
      custom_data: data || {}
    };
    fetch(baseUrl + '/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(function() {});
  };
})();
