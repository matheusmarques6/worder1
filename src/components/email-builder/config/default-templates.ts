export interface PrebuiltTemplate {
  id: string
  name: string
  category: string
  description: string
  icon: string
  html: string
}

export const DEFAULT_TEMPLATES: PrebuiltTemplate[] = [
  {
    id: 'welcome',
    name: 'Boas-vindas',
    category: 'marketing',
    description: 'Email de boas-vindas com cupom de primeira compra',
    icon: '👋',
    html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="padding:40px 30px;text-align:center;">
    <img src="https://placehold.co/180x50/FFFFFF/F97316?text=LOGO" alt="Logo" width="180" style="display:block;margin:0 auto 20px;" />
  </td></tr>
  <tr><td style="padding:0 30px 20px;text-align:center;">
    <h1 style="margin:0;font-size:28px;font-weight:bold;color:#111827;">Bem-vindo(a), {{first_name}}! 🎉</h1>
  </td></tr>
  <tr><td style="padding:0 30px 20px;text-align:center;font-size:16px;color:#4B5563;line-height:1.6;">
    Estamos muito felizes em ter você conosco! Como presente de boas-vindas, preparamos um cupom especial para sua primeira compra.
  </td></tr>
  <tr><td style="padding:0 30px 30px;text-align:center;">
    <div style="background-color:#FFF7ED;border:2px dashed #EA580C;border-radius:12px;padding:24px;display:inline-block;">
      <p style="margin:0 0 8px;font-size:14px;color:#9A3412;">Use o cupom abaixo:</p>
      <p style="margin:0;font-size:32px;font-weight:bold;color:#EA580C;letter-spacing:4px;">BEMVINDO10</p>
      <p style="margin:8px 0 0;font-size:12px;color:#9CA3AF;">10% de desconto · Válido por 7 dias</p>
    </div>
  </td></tr>
  <tr><td style="padding:0 30px 40px;text-align:center;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
      <tr><td style="background-color:#F97316;border-radius:8px;padding:14px 32px;">
        <a href="{{store_url}}" style="color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;display:block;">Explorar a Loja</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 30px;text-align:center;font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB;">
    {{store_name}} · <a href="{{unsubscribe_url}}" style="color:#9CA3AF;">Descadastrar-se</a>
  </td></tr>
</table>`,
  },
  {
    id: 'abandoned-cart',
    name: 'Carrinho Abandonado',
    category: 'transactional',
    description: 'Recuperação de carrinho com produtos e botão de finalizar',
    icon: '🛒',
    html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="padding:30px;text-align:center;">
    <img src="https://placehold.co/180x50/FFFFFF/F97316?text=LOGO" alt="Logo" width="180" style="display:block;margin:0 auto 20px;" />
  </td></tr>
  <tr><td style="padding:0 30px 10px;text-align:center;">
    <h1 style="margin:0;font-size:24px;font-weight:bold;color:#111827;">Esqueceu algo? 🛒</h1>
  </td></tr>
  <tr><td style="padding:0 30px 24px;text-align:center;font-size:15px;color:#6B7280;line-height:1.5;">
    Olá {{first_name}}, seus itens ainda estão esperando por você!
  </td></tr>
  <tr><td style="padding:0 30px 24px;text-align:center;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
      <tr>
        <td width="120" style="padding:16px;"><img src="{{cart_first_item_image}}" alt="" width="100" style="display:block;border-radius:8px;" /></td>
        <td style="padding:16px;text-align:left;">
          <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">{{cart_first_item}}</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#F97316;">{{cart_first_item_price}}</p>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 30px 30px;text-align:center;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
      <tr><td style="background-color:#F97316;border-radius:8px;padding:14px 32px;">
        <a href="{{cart_url}}" style="color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;display:block;">Finalizar Compra</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 30px;text-align:center;font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB;">
    {{store_name}} · <a href="{{unsubscribe_url}}" style="color:#9CA3AF;">Descadastrar-se</a>
  </td></tr>
</table>`,
  },
  {
    id: 'promotion',
    name: 'Promoção / Flash Sale',
    category: 'marketing',
    description: 'Email promocional com destaque de oferta e produtos',
    icon: '🔥',
    html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background-color:#F97316;padding:40px 30px;text-align:center;">
    <h1 style="margin:0;font-size:32px;font-weight:bold;color:#ffffff;">🔥 PROMOÇÃO RELÂMPAGO</h1>
    <p style="margin:10px 0 0;font-size:18px;color:#FED7AA;">Até 50% OFF em produtos selecionados</p>
  </td></tr>
  <tr><td style="padding:30px;text-align:center;">
    <p style="font-size:16px;color:#4B5563;line-height:1.6;">Olá {{first_name}}, não perca essa oportunidade!</p>
  </td></tr>
  <tr><td style="padding:0 20px 20px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td width="50%" style="padding:8px;text-align:center;vertical-align:top;">
          <div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;background:#fff;">
            <img src="https://placehold.co/260x260/F3F4F6/9CA3AF?text=Produto+1" alt="" width="100%" style="display:block;" />
            <div style="padding:12px;"><p style="margin:0;font-weight:600;color:#111827;font-size:14px;">Produto 1</p><p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#F97316;">R$ 89,90</p></div>
          </div>
        </td>
        <td width="50%" style="padding:8px;text-align:center;vertical-align:top;">
          <div style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;background:#fff;">
            <img src="https://placehold.co/260x260/F3F4F6/9CA3AF?text=Produto+2" alt="" width="100%" style="display:block;" />
            <div style="padding:12px;"><p style="margin:0;font-weight:600;color:#111827;font-size:14px;">Produto 2</p><p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#F97316;">R$ 79,90</p></div>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 30px 30px;text-align:center;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
      <tr><td style="background-color:#F97316;border-radius:8px;padding:14px 32px;">
        <a href="{{store_url}}" style="color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;display:block;">Ver Todas as Ofertas</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 30px;text-align:center;font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB;">
    {{store_name}} · <a href="{{unsubscribe_url}}" style="color:#9CA3AF;">Descadastrar-se</a>
  </td></tr>
</table>`,
  },
  {
    id: 'order-confirmation',
    name: 'Confirmação de Pedido',
    category: 'transactional',
    description: 'Email transacional de confirmação de pedido',
    icon: '✅',
    html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="padding:30px;text-align:center;">
    <img src="https://placehold.co/180x50/FFFFFF/F97316?text=LOGO" alt="Logo" width="180" style="display:block;margin:0 auto 20px;" />
  </td></tr>
  <tr><td style="padding:0 30px 10px;text-align:center;">
    <div style="width:64px;height:64px;background-color:#D1FAE5;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:32px;">✅</div>
    <h1 style="margin:0;font-size:24px;font-weight:bold;color:#111827;">Pedido Confirmado!</h1>
  </td></tr>
  <tr><td style="padding:10px 30px 24px;text-align:center;font-size:15px;color:#6B7280;line-height:1.5;">
    Olá {{first_name}}, recebemos seu pedido <strong>{{order_number}}</strong>.
  </td></tr>
  <tr><td style="padding:0 30px 24px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F9FAFB;border-radius:8px;padding:20px;">
      <tr><td style="padding:12px 20px;border-bottom:1px solid #E5E7EB;">
        <span style="font-size:13px;color:#6B7280;">Número do Pedido</span><br/>
        <span style="font-size:15px;font-weight:600;color:#111827;">{{order_number}}</span>
      </td></tr>
      <tr><td style="padding:12px 20px;border-bottom:1px solid #E5E7EB;">
        <span style="font-size:13px;color:#6B7280;">Data</span><br/>
        <span style="font-size:15px;font-weight:600;color:#111827;">{{order_date}}</span>
      </td></tr>
      <tr><td style="padding:12px 20px;">
        <span style="font-size:13px;color:#6B7280;">Total</span><br/>
        <span style="font-size:20px;font-weight:700;color:#F97316;">{{order_total}}</span>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 30px 30px;text-align:center;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
      <tr><td style="background-color:#F97316;border-radius:8px;padding:14px 32px;">
        <a href="{{tracking_url}}" style="color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;display:block;">Rastrear Pedido</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 30px;text-align:center;font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB;">
    {{store_name}} · <a href="{{unsubscribe_url}}" style="color:#9CA3AF;">Descadastrar-se</a>
  </td></tr>
</table>`,
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    category: 'marketing',
    description: 'Newsletter com conteúdo editorial e produtos',
    icon: '📰',
    html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="padding:24px 30px;text-align:center;border-bottom:1px solid #E5E7EB;">
    <img src="https://placehold.co/180x50/FFFFFF/F97316?text=LOGO" alt="Logo" width="180" style="display:block;margin:0 auto;" />
  </td></tr>
  <tr><td style="padding:30px;">
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:bold;color:#111827;">Novidades da Semana 📰</h1>
    <p style="margin:0;font-size:15px;color:#4B5563;line-height:1.7;">
      Olá {{first_name}}! Confira o que preparamos para você esta semana. Temos novidades incríveis na loja e dicas exclusivas.
    </p>
  </td></tr>
  <tr><td style="padding:0 30px 24px;">
    <img src="https://placehold.co/540x280/F3F4F6/9CA3AF?text=Imagem+Destaque" alt="" width="100%" style="display:block;border-radius:8px;" />
  </td></tr>
  <tr><td style="padding:0 30px 24px;">
    <h2 style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#111827;">Destaque da Semana</h2>
    <p style="margin:0;font-size:15px;color:#4B5563;line-height:1.7;">
      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
    </p>
  </td></tr>
  <tr><td style="padding:0 30px 24px;text-align:center;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
      <tr><td style="background-color:#F97316;border-radius:8px;padding:12px 28px;">
        <a href="{{store_url}}" style="color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;display:block;">Ler Mais</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:16px 30px;text-align:center;border-top:1px solid #E5E7EB;">
    <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">Siga-nos nas redes</p>
    <a href="#" style="text-decoration:none;margin:0 6px;font-size:20px;">📸</a>
    <a href="#" style="text-decoration:none;margin:0 6px;font-size:20px;">📘</a>
    <a href="#" style="text-decoration:none;margin:0 6px;font-size:20px;">🎵</a>
  </td></tr>
  <tr><td style="padding:16px 30px;text-align:center;font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB;">
    {{store_name}} · <a href="{{unsubscribe_url}}" style="color:#9CA3AF;">Descadastrar-se</a> · <a href="{{preferences_url}}" style="color:#9CA3AF;">Preferências</a>
  </td></tr>
</table>`,
  },
]
