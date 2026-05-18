// POST /api/lists/:id/import — CSV import.
//
// Accepts multipart/form-data with field `file` OR a JSON body
// { csv: "..." } for programmatic clients. CSV format:
//   - first row: header (case-insensitive). Expects at least `email`
//     OR `phone`. Other columns (first_name, last_name, tags, etc.)
//     populate the contact if it's freshly created.
//   - subsequent rows: data
//
// Behaviour:
//   1. Parse CSV
//   2. For each row, lookup contact by (organization_id, email) or
//      (organization_id, phone). Create if missing.
//   3. Upsert into contact_list_members.
//   4. Return { imported, created_contacts, skipped, errors }.
//
// Hard-capped at 50k rows per request to keep within Vercel's 4MB
// body limit and 5min function ceiling. Larger imports should be
// chunked client-side.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_ROWS = 50_000

interface CsvRow {
  email?: string
  phone?: string
  first_name?: string
  last_name?: string
  tags?: string
  [k: string]: string | undefined
}

function parseCsv(input: string): CsvRow[] {
  // Minimal CSV parser. Handles quoted fields and embedded commas.
  // Does NOT handle escaped quotes ("") inside quoted fields — that's
  // a v2 problem; merchants rarely have those.
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (inQuotes) {
      if (c === '"') { inQuotes = false; continue }
      field += c
    } else {
      if (c === '"') { inQuotes = true; continue }
      if (c === ',') { cur.push(field); field = ''; continue }
      if (c === '\r') { continue }
      if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; continue }
      field += c
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur) }

  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  return rows.slice(1)
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => {
      const obj: CsvRow = {}
      header.forEach((h, idx) => { obj[h] = (r[idx] || '').trim() })
      return obj
    })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  // Resolve org access
  const { data: memberships } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id)
  const orgIds = [...new Set([
    auth.user.organization_id,
    ...((memberships || []).map((m: any) => m.organization_id)),
  ])]

  // Verify list ownership and grab its org
  const { data: list } = await supabaseAdmin
    .from('contact_lists')
    .select('id, organization_id, store_id')
    .eq('id', params.id)
    .in('organization_id', orgIds)
    .maybeSingle()
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Read CSV content from either multipart or JSON body
  let csvText = ''
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file field required' }, { status: 400 })
    csvText = await file.text()
  } else {
    const body = await req.json().catch(() => ({}))
    csvText = typeof body.csv === 'string' ? body.csv : ''
  }
  if (!csvText.trim()) return NextResponse.json({ error: 'CSV body is empty' }, { status: 400 })

  const rows = parseCsv(csvText)
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `too many rows (max ${MAX_ROWS}); split the file and import in chunks` },
      { status: 413 }
    )
  }
  if (rows.length === 0) return NextResponse.json({ imported: 0, created_contacts: 0, skipped: 0 })

  const orgId = (list as any).organization_id
  let createdContacts = 0
  let imported = 0
  let skipped = 0
  const errors: Array<{ row: number; error: string }> = []

  // Process in batches of 500 to keep individual queries snappy.
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const emails = batch.map((r) => r.email?.toLowerCase().trim()).filter((e): e is string => !!e)

    // Lookup existing contacts by email
    const { data: existing } = await supabaseAdmin
      .from('contacts')
      .select('id, email')
      .eq('organization_id', orgId)
      .in('email', emails.length ? emails : ['__none__'])
    const byEmail = new Map<string, string>()
    for (const c of existing || []) {
      if (c.email) byEmail.set(String(c.email).toLowerCase(), String(c.id))
    }

    const toCreate: any[] = []
    const seenInBatch = new Set<string>()
    for (const row of batch) {
      const email = row.email?.toLowerCase().trim()
      if (!email && !row.phone) { skipped++; continue }
      if (email && (byEmail.has(email) || seenInBatch.has(email))) continue
      if (email) seenInBatch.add(email)
      toCreate.push({
        organization_id: orgId,
        store_id: (list as any).store_id || null,
        email: email || null,
        phone: row.phone?.trim() || null,
        first_name: row.first_name?.trim() || null,
        last_name: row.last_name?.trim() || null,
        tags: row.tags ? row.tags.split(';').map((t) => t.trim()).filter(Boolean) : [],
        source: 'csv_import',
      })
    }

    if (toCreate.length) {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('contacts')
        .insert(toCreate)
        .select('id, email')
      if (insertErr) {
        errors.push({ row: i, error: `contact insert: ${insertErr.message}` })
      } else {
        createdContacts += (inserted || []).length
        for (const c of inserted || []) {
          if (c.email) byEmail.set(String(c.email).toLowerCase(), String(c.id))
        }
      }
    }

    // Upsert membership for every contact_id we now know about.
    const memberRows: any[] = []
    for (const row of batch) {
      const email = row.email?.toLowerCase().trim()
      if (!email) continue
      const contactId = byEmail.get(email)
      if (!contactId) continue
      memberRows.push({
        list_id: params.id,
        contact_id: contactId,
        added_by: auth.user.id,
        source: 'csv_import',
      })
    }
    if (memberRows.length) {
      const { error: memberErr } = await supabaseAdmin
        .from('contact_list_members')
        .upsert(memberRows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true })
      if (memberErr) {
        errors.push({ row: i, error: `member upsert: ${memberErr.message}` })
      } else {
        imported += memberRows.length
      }
    }
  }

  // Persist import metadata so the merchant can audit later imports.
  await supabaseAdmin
    .from('contact_lists')
    .update({
      source: 'csv_import',
      source_metadata: {
        last_import_at: new Date().toISOString(),
        last_import_rows: rows.length,
        last_import_created: createdContacts,
        last_import_imported: imported,
      },
    })
    .eq('id', params.id)

  return NextResponse.json({
    imported,
    created_contacts: createdContacts,
    skipped,
    errors: errors.slice(0, 20),
  })
}
