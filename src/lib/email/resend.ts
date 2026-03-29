import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendEmail(params: {
  to: string;
  from: string;
  senderName: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: `${params.senderName} <${params.from}>`,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    });
    if (error) return { error: error.message };
    return { id: data?.id };
  } catch (e: any) {
    return { error: e.message };
  }
}
