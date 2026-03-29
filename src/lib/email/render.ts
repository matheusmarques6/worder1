export function renderMergeTags(html: string, data: Record<string, string>): string {
  return html.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (_, tag, fallback) => {
    return data[tag] || fallback || '';
  });
}

export function prepareEmailHtml(
  html: string,
  contact: any,
  org: any,
  emailSendId: string,
  baseUrl?: string
): string {
  const url = baseUrl || process.env.NEXT_PUBLIC_APP_URL || '';

  let result = renderMergeTags(html, {
    first_name: contact.first_name || contact.name?.split(' ')[0] || '',
    last_name: contact.last_name || '',
    email: contact.email || '',
    phone: contact.phone || '',
    store_name: org.name || 'Worder',
  });

  // Replace links with click tracking
  result = result.replace(/href="(https?:\/\/[^"]+)"/gi, (match, linkUrl) => {
    if (linkUrl.includes('unsubscribe') || linkUrl.startsWith('mailto:')) return match;
    return `href="${url}/api/t/c/${emailSendId}?url=${encodeURIComponent(linkUrl)}"`;
  });

  // Add open tracking pixel
  const pixel = `<img src="${url}/api/t/o/${emailSendId}" width="1" height="1" style="display:none" alt="" />`;
  if (result.includes('</body>')) {
    result = result.replace('</body>', `${pixel}</body>`);
  } else {
    result += pixel;
  }

  // Add unsubscribe link if missing
  if (!result.toLowerCase().includes('descadastrar') && !result.toLowerCase().includes('unsubscribe')) {
    const unsub = `<div style="text-align:center;padding:20px;font-size:12px;color:#6B7280;font-family:sans-serif;"><a href="${url}/api/unsubscribe/${emailSendId}" style="color:#6B7280;text-decoration:underline;">Descadastrar-se</a></div>`;
    if (result.includes('</body>')) {
      result = result.replace('</body>', `${unsub}</body>`);
    } else {
      result += unsub;
    }
  }

  return result;
}
