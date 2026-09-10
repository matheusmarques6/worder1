import { NextRequest, NextResponse } from 'next/server';
import { checkAndAlertMessagingLimits } from '@/lib/whatsapp/alerts';
import { wlog } from '@/lib/observability/whatsapp-logger';
import { authorizeCronRequest } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// C3: separado de whatsapp-quality-check (que rodava /30min e fazia este loop
// junto desperdicando ciclo). messaging_limit so muda em escala de dias.
// Rodamos 1x/dia em vercel.json.
//
// [Phase 4] `messaging_limit` (enum string: TIER_250/TIER_1K/...) e A FONTE DE
// VERDADE do tier (ver MESSAGING_LIMIT_STRING_TO_TIER em '@/config/whatsapp-tiers',
// [FIX-C1]). checkAndAlertMessagingLimits() alerta em TIER_250/TIER_1K — strings que
// batem com o mapa canônico. O numérico `messaging_tier` está morto para tiering.
export async function GET(req: NextRequest) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await checkAndAlertMessagingLimits();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    wlog.error('whatsapp.cron.messaging_limit_check_error', { error: error?.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
