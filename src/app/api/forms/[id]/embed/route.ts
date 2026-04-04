import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { data: form } = await supabaseAdmin
      .from('forms')
      .select('id, name, config, status')
      .eq('id', params.id)
      .single()

    if (!form || form.status !== 'published') {
      return new Response('// Form not found or not published', { headers: { 'Content-Type': 'application/javascript' } })
    }

    const config = form.config || {}
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'
    const submitUrl = `${baseUrl}/api/public/forms/${params.id}/submit`

    const script = `
(function(){
  var FORM_ID = ${JSON.stringify(params.id)};
  var CONFIG = ${JSON.stringify(config)};
  var SUBMIT_URL = ${JSON.stringify(submitUrl)};
  var shown = false;
  var freq = CONFIG.display?.frequency || 'once';
  var storageKey = 'worder_popup_' + FORM_ID;

  // Check frequency
  if (freq === 'once' && localStorage.getItem(storageKey)) return;
  if (freq === 'session' && sessionStorage.getItem(storageKey)) return;

  // Check device
  var isMobile = window.innerWidth < 768;
  if (isMobile && !CONFIG.display?.showOnMobile) return;
  if (!isMobile && !CONFIG.display?.showOnDesktop) return;

  function showPopup() {
    if (shown) return;
    shown = true;

    var overlay = document.createElement('div');
    overlay.id = 'worder-popup-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,' + ((CONFIG.style?.overlayOpacity || 50) / 100) + ');animation:worderFadeIn 0.3s ease';

    var popup = document.createElement('div');
    popup.style.cssText = 'position:relative;background:' + (CONFIG.style?.bgColor || '#fff') + ';border-radius:' + (CONFIG.style?.borderRadius || 16) + 'px;max-width:' + (isMobile ? '340' : (CONFIG.style?.maxWidth || 480)) + 'px;width:calc(100% - 32px);padding:' + (CONFIG.style?.padding || 32) + 'px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);animation:worderSlideIn 0.3s ease';

    var html = '';
    if (CONFIG.showCloseButton !== false) {
      html += '<button onclick="document.getElementById(\\'worder-popup-overlay\\').remove()" style="position:absolute;top:12px;right:12px;width:28px;height:28px;border-radius:50%;background:#f3f4f6;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;color:#9ca3af">&times;</button>';
    }
    if (CONFIG.image?.show && CONFIG.image?.src && CONFIG.image?.position === 'top') {
      html += '<img src="' + CONFIG.image.src + '" style="width:100%;border-radius:' + Math.max(0, (CONFIG.style?.borderRadius || 16) - 4) + 'px;margin-bottom:16px;display:block" />';
    }
    html += '<h2 style="font-size:' + (CONFIG.headline?.fontSize || 28) + 'px;color:' + (CONFIG.headline?.color || '#111827') + ';font-weight:' + (CONFIG.headline?.fontWeight || 'bold') + ';text-align:' + (CONFIG.headline?.align || 'center') + ';margin:0 0 8px;line-height:1.2">' + (CONFIG.headline?.text || '') + '</h2>';
    if (CONFIG.subtitle?.show) {
      html += '<p style="font-size:' + (CONFIG.subtitle?.fontSize || 15) + 'px;color:' + (CONFIG.subtitle?.color || '#6B7280') + ';text-align:center;margin:0 0 20px;line-height:1.5">' + (CONFIG.subtitle?.text || '') + '</p>';
    }
    html += '<form id="worder-popup-form" style="display:flex;flex-direction:column;gap:10px">';
    if (CONFIG.nameField?.show) html += '<input name="name" placeholder="' + (CONFIG.nameField?.placeholder || 'Seu nome') + '" style="width:100%;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box" />';
    if (CONFIG.emailField?.show) html += '<input name="email" type="email" placeholder="' + (CONFIG.emailField?.placeholder || 'Seu email') + '" required style="width:100%;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box" />';
    if (CONFIG.phoneField?.show) html += '<input name="phone" placeholder="' + (CONFIG.phoneField?.placeholder || 'WhatsApp') + '" style="width:100%;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box" />';
    html += '<button type="submit" style="width:' + (CONFIG.button?.fullWidth ? '100%' : 'auto') + ';padding:14px 28px;background:' + (CONFIG.button?.bgColor || '#F97316') + ';color:' + (CONFIG.button?.textColor || '#fff') + ';font-size:' + (CONFIG.button?.fontSize || 15) + 'px;font-weight:700;border-radius:' + (CONFIG.button?.borderRadius || 8) + 'px;border:none;cursor:pointer">' + (CONFIG.button?.text || 'Inscrever') + '</button>';
    html += '</form>';
    if (CONFIG.disclaimer?.show) {
      html += '<p style="font-size:' + (CONFIG.disclaimer?.fontSize || 11) + 'px;color:' + (CONFIG.disclaimer?.color || '#9ca3af') + ';text-align:center;margin:12px 0 0;line-height:1.4">' + (CONFIG.disclaimer?.text || '') + '</p>';
    }

    popup.innerHTML = html;
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    // Form submit
    var form = document.getElementById('worder-popup-form');
    if (form) form.addEventListener('submit', function(e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var data = {};
      fd.forEach(function(v, k) { data[k] = v; });
      fetch(SUBMIT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function() {
          popup.innerHTML = '<div style="text-align:center;padding:20px"><h2 style="font-size:24px;color:#111827;margin:0 0 8px">' + (CONFIG.successMessage?.headline || 'Pronto!') + '</h2><p style="font-size:15px;color:#6b7280;margin:0">' + (CONFIG.successMessage?.text || 'Obrigado!') + '</p></div>';
          if (freq === 'once') localStorage.setItem(storageKey, '1');
          if (freq === 'session') sessionStorage.setItem(storageKey, '1');
          setTimeout(function() { overlay.remove(); }, 3000);
        });
    });
  }

  // Trigger logic
  var trigger = CONFIG.trigger?.type || 'time_delay';
  if (trigger === 'time_delay') {
    setTimeout(showPopup, (CONFIG.trigger?.delay || 5) * 1000);
  } else if (trigger === 'scroll') {
    var pct = CONFIG.trigger?.scrollPercent || 50;
    window.addEventListener('scroll', function() {
      var scrolled = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
      if (scrolled >= pct) showPopup();
    });
  } else if (trigger === 'exit_intent') {
    document.addEventListener('mouseout', function(e) {
      if (e.clientY < 5) showPopup();
    });
  }

  // CSS animation
  var style = document.createElement('style');
  style.textContent = '@keyframes worderFadeIn{from{opacity:0}to{opacity:1}}@keyframes worderSlideIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}';
  document.head.appendChild(style);
})();`

    return new Response(script, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (error) {
    return new Response('// Error loading form', { headers: { 'Content-Type': 'application/javascript' } })
  }
}
