import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/email/render
 * Receives { html, subject, previewText } and returns inlined HTML ready to send.
 * Also accepts { document } for future custom editor support.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    let html = body.html || ''

    if (!html && body.document) {
      // Future: render EmailDocument JSON to HTML
      return NextResponse.json({ error: 'Document rendering not yet supported. Send html directly.' }, { status: 400 })
    }

    if (!html) {
      return NextResponse.json({ error: 'html is required' }, { status: 400 })
    }

    // Wrap in email boilerplate if not already wrapped
    if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
      const preheader = body.previewText
        ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${body.previewText}</div>`
        : ''

      html = `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${body.subject || ''}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    * { box-sizing: border-box; }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; min-width: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .fluid { max-width: 100% !important; height: auto !important; }
      .stack-column { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  ${preheader}
  <center style="width:100%;background-color:#f3f4f6;">
    <div style="max-width:600px;margin:0 auto;" class="email-container">
      <!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" align="center"><tr><td><![endif]-->
      ${html}
      <!--[if mso]></td></tr></table><![endif]-->
    </div>
  </center>
</body>
</html>`
    }

    return NextResponse.json({ html })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
