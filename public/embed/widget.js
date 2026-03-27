/**
 * Worder Form Widget
 * Captura UTMs da página pai e injeta o formulário via iframe
 */
(function() {
  'use strict';

  // Encontrar o script atual
  var currentScript = document.currentScript || (function() {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var formId = currentScript.getAttribute('data-form-id');
  if (!formId) {
    console.error('[Worder] data-form-id não encontrado no script');
    return;
  }

  // Configurações opcionais
  var width = currentScript.getAttribute('data-width') || '100%';
  var height = currentScript.getAttribute('data-height') || '600';
  var containerId = currentScript.getAttribute('data-container');

  // Capturar UTMs da URL atual
  function getUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var utmParams = {};

    // UTMs padrão
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function(param) {
      var value = params.get(param);
      if (value) {
        utmParams[param] = value;
      }
    });

    // fbclid e gclid para tracking
    ['fbclid', 'gclid', 'ttclid', 'ref'].forEach(function(param) {
      var value = params.get(param);
      if (value) {
        utmParams[param] = value;
      }
    });

    // Inferir utm_source do fbclid/gclid se não existir
    if (!utmParams.utm_source) {
      if (params.get('fbclid')) {
        utmParams.utm_source = 'facebook';
        utmParams.utm_medium = utmParams.utm_medium || 'cpc';
      } else if (params.get('gclid')) {
        utmParams.utm_source = 'google';
        utmParams.utm_medium = utmParams.utm_medium || 'cpc';
      } else if (params.get('ttclid')) {
        utmParams.utm_source = 'tiktok';
        utmParams.utm_medium = utmParams.utm_medium || 'cpc';
      }
    }

    return utmParams;
  }

  // Construir URL do iframe com UTMs
  function buildIframeUrl() {
    var baseUrl = currentScript.src.replace('/embed/widget.js', '');
    var iframeUrl = baseUrl + '/embed/' + formId;

    var utmParams = getUrlParams();
    var queryString = Object.keys(utmParams).map(function(key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(utmParams[key]);
    }).join('&');

    if (queryString) {
      iframeUrl += '?' + queryString;
    }

    // Adicionar referrer
    if (document.referrer) {
      iframeUrl += (queryString ? '&' : '?') + 'referrer=' + encodeURIComponent(document.referrer);
    }

    return iframeUrl;
  }

  // Criar iframe
  function createIframe() {
    var iframe = document.createElement('iframe');
    iframe.src = buildIframeUrl();
    iframe.style.width = width;
    iframe.style.height = typeof height === 'number' ? height + 'px' : height;
    iframe.style.border = 'none';
    iframe.style.overflow = 'hidden';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('allowtransparency', 'true');
    iframe.setAttribute('allow', 'clipboard-write');
    iframe.id = 'worder-form-' + formId;

    return iframe;
  }

  // Escutar mensagens do iframe para auto-redimensionar
  window.addEventListener('message', function(event) {
    try {
      var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data.type === 'worder-resize' && data.formId === formId) {
        var iframe = document.getElementById('worder-form-' + formId);
        if (iframe && data.height) {
          iframe.style.height = data.height + 'px';
        }
      }
    } catch (e) {
      // Ignorar mensagens inválidas
    }
  });

  // Inserir iframe na página
  function insertIframe() {
    var iframe = createIframe();

    if (containerId) {
      var container = document.getElementById(containerId);
      if (container) {
        container.appendChild(iframe);
        return;
      }
    }

    // Inserir onde o script está
    if (currentScript.parentNode) {
      currentScript.parentNode.insertBefore(iframe, currentScript.nextSibling);
    }
  }

  // Executar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertIframe);
  } else {
    insertIframe();
  }

  // Log para debug
  console.log('[Worder] Form widget carregado:', formId, 'UTMs:', getUrlParams());
})();
