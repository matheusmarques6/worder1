// GET /api/segments/templates — returns the curated segment template
// gallery. Static data; cached at the edge for 1h.

import { NextResponse } from 'next/server';
import { SEGMENT_TEMPLATES, TEMPLATE_CATEGORY_LABELS } from '@/lib/segments/templates';

export const dynamic = 'force-static';
export const revalidate = 3600;

export async function GET() {
  return NextResponse.json({
    templates: SEGMENT_TEMPLATES,
    categories: TEMPLATE_CATEGORY_LABELS,
  });
}
