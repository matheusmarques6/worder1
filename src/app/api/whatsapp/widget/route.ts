// =============================================
// API: WhatsApp Widget for Website
// GET/POST /api/whatsapp/widget
// GET /api/whatsapp/widget?embed=true (returns JS)
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const storeId = searchParams.get('storeId')
    const embed = searchParams.get('embed')

    if (embed) {
      // Return embeddable widget JS
      const widgetId = searchParams.get('id')
      if (!widgetId) {
        return new Response('// Widget ID required', { headers: { 'Content-Type': 'text/javascript' } })
      }

      const { data: config } = await supabaseAdmin
        .from('whatsapp_widget_config')
        .select('*')
        .eq('id', widgetId)
        .eq('is_active', true)
        .single()

      if (!config) {
        return new Response('// Widget not found or inactive', { headers: { 'Content-Type': 'text/javascript' } })
      }

      const widgetJs = generateWidgetScript(config)
      return new Response(widgetJs, {
        headers: {
          'Content-Type': 'text/javascript',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    let query = supabaseAdmin
      .from('whatsapp_widget_config')
      .select('*')
      .eq('organization_id', organizationId)

    if (storeId) query = query.eq('store_id', storeId)

    const { data, error } = await query.maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    const body = await request.json()
    const {
      store_id,
      instance_id,
      phone_number,
      welcome_message,
      position,
      color,
      delay_seconds,
      is_active,
    } = body

    if (!phone_number) {
      return NextResponse.json({ error: 'phone_number required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('whatsapp_widget_config')
      .upsert(
        {
          organization_id: organizationId,
          store_id,
          instance_id,
          phone_number,
          welcome_message: welcome_message || 'Ola! Como posso ajudar?',
          position: position || 'right',
          color: color || '#25D366',
          delay_seconds: delay_seconds ?? 3,
          is_active: is_active ?? true,
        },
        { onConflict: 'organization_id,store_id' }
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Generate embed code
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    const embedCode = `<script src="${baseUrl}/api/whatsapp/widget?embed=true&id=${data.id}" async></script>`

    return NextResponse.json({ data, embedCode })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function generateWidgetScript(config: {
  phone_number: string
  welcome_message: string
  position: string
  color: string
  delay_seconds: number
}): string {
  return `(function(){
  if(document.getElementById('worder-wa-widget'))return;
  var c=${JSON.stringify({
    phone: config.phone_number,
    msg: config.welcome_message,
    pos: config.position,
    color: config.color,
    delay: config.delay_seconds,
  })};
  var s=document.createElement('style');
  s.textContent=\`
    #worder-wa-widget{position:fixed;bottom:20px;\${c.pos==='left'?'left':'right'}:20px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
    #worder-wa-btn{width:60px;height:60px;border-radius:50%;background:\${c.color};border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.15);transition:transform .2s}
    #worder-wa-btn:hover{transform:scale(1.1)}
    #worder-wa-btn svg{width:32px;height:32px;fill:#fff}
    #worder-wa-tooltip{position:absolute;bottom:70px;\${c.pos==='left'?'left':'right'}:0;background:#fff;border-radius:12px;padding:16px;box-shadow:0 4px 20px rgba(0,0,0,.12);max-width:260px;display:none;animation:worderFade .3s}
    #worder-wa-tooltip.show{display:block}
    #worder-wa-tooltip p{margin:0 0 10px;font-size:14px;color:#333;line-height:1.4}
    #worder-wa-tooltip a{display:inline-block;padding:8px 16px;background:\${c.color};color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500}
    @keyframes worderFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  \`;
  document.head.appendChild(s);
  var w=document.createElement('div');
  w.id='worder-wa-widget';
  w.innerHTML=\`
    <div id="worder-wa-tooltip">
      <p>\${c.msg}</p>
      <a href="https://wa.me/\${c.phone.replace(/\\D/g,'')}" target="_blank" rel="noopener">Iniciar conversa</a>
    </div>
    <button id="worder-wa-btn" aria-label="WhatsApp">
      <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    </button>
  \`;
  document.body.appendChild(w);
  var btn=document.getElementById('worder-wa-btn');
  var tip=document.getElementById('worder-wa-tooltip');
  var shown=false;
  setTimeout(function(){if(!shown){tip.classList.add('show');shown=true}},c.delay*1000);
  btn.addEventListener('click',function(){
    if(tip.classList.contains('show')){tip.classList.remove('show')}
    else{window.open('https://wa.me/'+c.phone.replace(/\\D/g,''),'_blank')}
  });
})();`
}
