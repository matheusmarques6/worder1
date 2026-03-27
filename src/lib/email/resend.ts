import { Resend } from 'resend'

let resendInstance: Resend | null = null

function getResend(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY not configured')
    resendInstance = new Resend(apiKey)
  }
  return resendInstance
}

export async function sendEmail(params: {
  to: string
  from: string
  senderName: string
  subject: string
  html: string
  replyTo?: string
  tags?: { name: string; value: string }[]
}) {
  try {
    const resend = getResend()
    const { data, error } = await resend.emails.send({
      from: `${params.senderName} <${params.from}>`,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
      tags: params.tags,
    })
    if (error) return { success: false, error: error.message }
    return { success: true, id: data?.id }
  } catch (err: any) {
    return { success: false, error: err.message || 'Send failed' }
  }
}

export async function createDomain(domain: string) {
  try {
    const resend = getResend()
    const { data, error } = await resend.domains.create({ name: domain })
    if (error) return { success: false, error: error.message }
    return { success: true, domain: data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function verifyDomain(domainId: string) {
  try {
    const resend = getResend()
    const { data, error } = await resend.domains.verify(domainId)
    if (error) return { success: false, error: error.message }
    return { success: true, domain: data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function getDomain(domainId: string) {
  try {
    const resend = getResend()
    const { data, error } = await resend.domains.get(domainId)
    if (error) return { success: false, error: error.message }
    return { success: true, domain: data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
