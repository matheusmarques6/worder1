import { describe, it, expect } from 'vitest'
import {
  buildPopupScript,
  escHtml,
  sv,
  safeUrl,
  safeImgUrl,
  legalConsentHtml,
  parseVisitorEnvelope,
  normalizePhoneValue,
} from '../generator'

const fixtureDesign = {
  formType: 'popup',
  styles: {
    width: 480,
    minHeight: 500,
    backgroundColor: '#FFFFFF',
    fontFamily: 'Inter, sans-serif',
    closeButton: { show: true, color: '#6B7280', size: 32 },
    sideImage: { enabled: false, src: '', position: 'right', width: 50 },
  },
  steps: [
    {
      blocks: [
        { id: 'b1', type: 'text', props: { content: 'Get 10% off', fontSize: 24, tag: 'h2' } },
        { id: 'b2', type: 'email', props: { placeholder: 'you@example.com', required: true, requiredMsg: 'Required field', errorMsg: 'Invalid email', errorColor: '#DC2626' } },
        { id: 'b3', type: 'phone', props: { countryCode: '+55', mapTo: 'phone' } },
        { id: 'b4', type: 'dropdown', props: { label: 'Topic', options: ['A', 'B'], required: true } },
        { id: 'b5', type: 'radio', props: { label: 'Pick one', options: ['Yes', 'No'], required: true, requiredMsg: 'Choose one' } },
        { id: 'b6', type: 'legal-consent', props: { text: 'I agree to the <a href="https://example.com/privacy">privacy policy</a>', required: true } },
        { id: 'b7', type: 'button', props: { text: '<img src=x onerror=alert(1)>', action: 'submit', fullWidth: true } },
        { id: 'b8', type: 'button', props: { text: 'Evil', action: 'url', url: 'javascript:alert(1)' } },
      ],
    },
    {
      blocks: [
        { id: 'c1', type: 'text-input', props: { label: 'Name', mapTo: 'first_name' } },
        { id: 'c2', type: 'button', props: { text: 'Next', action: 'next-step' } },
      ],
    },
  ],
  postSubmit: { action: 'show-success', redirectUrl: '', closeDelay: 4 },
}

const fixtureBehavior = {
  frequency: { showAfterDays: 15, stopAfterSubmission: true },
  display: { timeEnabled: true, delay: 3 },
}

function gen(design: any = fixtureDesign, behavior: any = fixtureBehavior) {
  return buildPopupScript(
    { id: 'test-form-0001', name: 'Fixture Form', success_message: 'Thanks!', design_json: design, behavior },
    'https://app.example.com'
  )
}

describe('buildPopupScript (generated string)', () => {
  const js = gen()

  it('emits syntactically valid JavaScript', () => {
    // new Function parses without executing — catches template-escape regressions.
    expect(() => new Function(js)).not.toThrow()
  })

  it('R1: checks r.ok before running the success path', () => {
    expect(js).toContain('ok:r.ok')
    expect(js).toContain('!out.ok||res.success===false')
    expect(js).toContain('showFormError(submitErrorText(')
  })

  it('R1/R9: neutral English fallback error, merchant-overridable', () => {
    expect(js).toContain('Something went wrong. Please try again.')
    expect(js).toContain('D.errorMessage||B.errorMessage')
  })

  it('R2: next-step validates and harvests the current step', () => {
    expect(js).toContain('act==="next-step"')
    expect(js).toContain('!validateStep(frm)')
    expect(js).toContain('harvest(frm)')
    // final submit merges through the same keyed harvest
    expect(js).toContain('harvest(f)')
  })

  it('R3: unified suppression window, no divergent close default', () => {
    expect(js).toContain('SHOW_AFTER_DAYS')
    expect(js).not.toContain('showAfterDays||1')
    expect(js).toContain('if(!submitted)scx(ck,"1",SHOW_AFTER_DAYS)')
  })

  it('R4: robust visitor id resolution and session id in payload', () => {
    expect(js).toContain('_worder_canonical')
    expect(js).toContain('_worder_vid')
    expect(js).toContain('__worder_id')
    expect(js).toContain('__worder_sid')
    expect(js).toContain('payload.visitor_id=vid')
    expect(js).toContain('payload.session_id=sid')
  })

  it('R5: submit button disabled with loading state during fetch', () => {
    expect(js).toContain('sbtn.disabled=on')
    expect(js).toContain('if(submitting)')
  })

  it('R6: dismissal beacon to /events, once per pageview, not after subscribe', () => {
    expect(js).toContain('/events')
    expect(js).toContain('{type:"dismissed"}')
    expect(js).toContain('navigator.sendBeacon')
    expect(js).toContain('if(byUser&&!submitted)sendDismiss()')
    expect(js).toContain('if(dismissSent)return')
  })

  it('R6: impressions still tracked via submit _track (no double count)', () => {
    expect(js).toContain('{_track:"impression"}')
  })

  it('R7: button label escaped, style-sanitizer applied, URL whitelists in place', () => {
    expect(js).toContain('esc(p.text||"OK")')
    expect(js).toContain('sv(p.bgColor,"#F97316")')
    expect(js).toContain('safeUrl(p.url)')
    expect(js).toContain('safeUrl(btn.dataset.url)')
    expect(js).toContain('safeUrl((res&&res.redirect_url)||postSubmit.redirectUrl||"")')
    expect(js).toContain('legalHtml(')
  })

  it('R8: _wf_pv bumped once per pageview via global guard', () => {
    expect(js).toContain('__wf_pv_bumped')
  })

  it('R8: _wf_seen pre-set value shared across form scripts', () => {
    expect(js).toContain('__wf_seen_prev')
  })

  it('R8/S4: legacy disp.trigger fallback mapped to boolean flags', () => {
    expect(js).toContain('disp.trigger==="exit_intent"')
    expect(js).toContain('disp.trigger==="time_delay"')
    expect(js).toContain('disp.trigger==="scroll"')
    expect(js).toContain('disp.delaySeconds')
  })

  it('R8/S7: cookie gates mirrored into localStorage (ITP)', () => {
    expect(js).toContain('_wfls_')
    expect(js).toContain('function gcx(')
    expect(js).toContain('function scx(')
  })

  it('R8/S13: exit intent requires relatedTarget/toElement null', () => {
    expect(js).toContain('!e.relatedTarget&&!e.toElement')
  })

  it('R9: required radio/checkbox groups produce the validator marker', () => {
    expect(js).toContain('data-wfreq')
    expect(js).toContain('data-wfreqmsg')
    expect(js).toContain('data-wferrcolor')
  })

  it('R9: no hardcoded PT-BR defaults for visitors', () => {
    expect(js).not.toContain('Escolha...')
    expect(js).not.toContain('"Enviar"')
  })

  it('R10: size derived at show time and re-derived on resize', () => {
    expect(js).toContain('function popCss(')
    expect(js).toContain('applySize')
    expect(js).toContain('orientationchange')
    expect(js).toContain('width:100vw!important;height:100vh!important') // fullpage
    expect(js).toContain('margin:auto 0') // vertical centering parity
  })

  it('R11: one-popup-at-a-time mutex', () => {
    expect(js).toContain('__wfOpenPopup')
  })

  it('embeds skip suppression cookies on close', () => {
    expect(js).toContain('if(isEmbed)return')
  })

  it('serializes the design and form id', () => {
    expect(js).toContain('"test-form-0001"')
    expect(js).toContain('Fixture Form')
  })

  it('handles empty design/behavior without throwing', () => {
    const empty = buildPopupScript({ id: 'x', name: null, design_json: null, behavior: null }, 'https://a.b')
    expect(() => new Function(empty)).not.toThrow()
  })
})

describe('runtime helpers (inlined into the script)', () => {
  it('escHtml escapes markup — <img becomes &lt;img', () => {
    expect(escHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
    expect(escHtml('a"b&c')).toBe('a&quot;b&amp;c')
    expect(escHtml(null)).toBe('')
  })

  it('safeUrl drops javascript:/data:/vbscript: and keeps http(s) + relative', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('JaVaScRiPt:alert(1)')).toBe('')
    expect(safeUrl('data:text/html,<script>x</script>')).toBe('')
    expect(safeUrl('vbscript:x')).toBe('')
    expect(safeUrl('//evil.com')).toBe('')
    expect(safeUrl('https://example.com/x?y=1')).toBe('https://example.com/x?y=1')
    expect(safeUrl('http://example.com')).toBe('http://example.com')
    expect(safeUrl('/pages/promo')).toBe('/pages/promo')
    expect(safeUrl('')).toBe('')
  })

  it('safeImgUrl additionally allows protocol-relative and data:image', () => {
    expect(safeImgUrl('//cdn.shopify.com/img.png')).toBe('//cdn.shopify.com/img.png')
    expect(safeImgUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(safeImgUrl('javascript:alert(1)')).toBe('')
    expect(safeImgUrl('data:text/html,x')).toBe('')
  })

  it('sv strips style-breaking characters and caps length', () => {
    expect(sv('red;}</style><script>', 'blue')).toBe('red/stylescript')
    expect(sv('#FF0000')).toBe('#FF0000')
    expect(sv('', '#111827')).toBe('#111827')
    expect(sv(null, 16)).toBe('16')
    expect(sv('a'.repeat(500)).length).toBe(120)
    expect(sv('Open Sans, sans-serif')).toBe('Open Sans, sans-serif')
  })

  it('legalConsentHtml keeps whitelisted anchors, escapes everything else', () => {
    const out = legalConsentHtml(
      'Click <a href="javascript:evil()">here</a> and read the <a href="https://x.com/privacy">policy</a> <b>now</b>',
      '#F97316'
    )
    expect(out).not.toContain('javascript:')
    expect(out).toContain('href="https://x.com/privacy"')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).toContain('&lt;b&gt;now&lt;/b&gt;')
    // anchor with disallowed scheme keeps its inner text, drops the tag
    expect(out).toContain('here')
    expect(legalConsentHtml('mail us at <a href="mailto:a@b.c">a@b.c</a>', '')).toContain('href="mailto:a@b.c"')
  })

  it('parseVisitorEnvelope handles raw ids and JSON envelopes', () => {
    expect(parseVisitorEnvelope('{"v":"abc-123","e":1712345678}')).toBe('abc-123')
    expect(parseVisitorEnvelope('raw-visitor-id')).toBe('raw-visitor-id')
    expect(parseVisitorEnvelope('{broken json')).toBe(null)
    expect(parseVisitorEnvelope('')).toBe(null)
    expect(parseVisitorEnvelope(null)).toBe(null)
  })

  it('normalizePhoneValue prepends the country code (full E.164-ish value)', () => {
    expect(normalizePhoneValue('31 99999-9999', '+55')).toBe('+5531999999999')
    expect(normalizePhoneValue('(31) 99999 9999', '55')).toBe('+5531999999999')
    expect(normalizePhoneValue('+5531999999999', '+55')).toBe('+5531999999999')
    expect(normalizePhoneValue('0123456', '+44')).toBe('+44123456')
    expect(normalizePhoneValue('123456', '')).toBe('123456')
    expect(normalizePhoneValue('', '+55')).toBe('')
  })
})
