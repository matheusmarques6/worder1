// =============================================
// API: WhatsApp Flows — Data Exchange Endpoint
// src/app/api/whatsapp/flows/data-exchange/route.ts
//
// Receives encrypted flow data from Meta, decrypts it,
// routes to the appropriate handler, encrypts the response.
//
// Meta timeout: 10 seconds hard limit.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { decryptFlowRequest, encryptFlowResponse } from '@/lib/whatsapp/flows-encryption';
import { decryptToken } from '@/lib/whatsapp/token-encryption';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

// =============================================
// TYPES
// =============================================

interface FlowAction {
  action: string;
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
  version?: string;
}

interface FlowResponse {
  screen?: string;
  data?: Record<string, unknown>;
  version?: string;
}

// =============================================
// POST — receive encrypted flow data from Meta
// =============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Health-check: Meta sends a request without encrypted data to verify the endpoint
    if (!body.encrypted_aes_key || !body.encrypted_flow_data || !body.initial_vector) {
      return new NextResponse('', { status: 421 });
    }

    // Determine which account this request belongs to.
    // Meta includes the flow_token which we embed with the account ID.
    // We also look at the X-WA-Phone-Number-Id header if available.
    const phoneNumberId = request.headers.get('x-wa-phone-number-id');

    if (!phoneNumberId) {
      console.error('[flows/data-exchange] Missing x-wa-phone-number-id header');
      return new NextResponse('', { status: 421 });
    }

    // Fetch the account and its encrypted private key
    const { data: account, error: accountError } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('id, organization_id, flow_private_key_encrypted')
      .eq('phone_number_id', phoneNumberId)
      .eq('status', 'active')
      .single();

    if (accountError || !account?.flow_private_key_encrypted) {
      console.error('[flows/data-exchange] Account not found or flows not configured:', accountError?.message);
      return new NextResponse('', { status: 421 });
    }

    // Decrypt the private key from DB
    const privateKeyPem = decryptToken(account.flow_private_key_encrypted);

    // Decrypt the flow request from Meta
    const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptFlowRequest(
      body,
      privateKeyPem,
    );

    const flowAction = decryptedBody as unknown as FlowAction;

    // Route to the appropriate handler
    const response = await handleFlowAction(flowAction, account.id, account.organization_id);

    // Encrypt the response
    const encryptedResponse = encryptFlowResponse(response, aesKeyBuffer, initialVectorBuffer);

    // Log the event (non-blocking)
    logFlowEvent(account.id, account.organization_id, flowAction.action, flowAction.screen).catch(
      (err) => console.error('[flows/data-exchange] Failed to log event:', err),
    );

    return new NextResponse(encryptedResponse, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error) {
    console.error('[flows/data-exchange] Error:', error);
    // Meta spec: return 421 on ALL errors — Meta retries on 5xx which could cause
    // duplicate processing. 421 signals "stop, don't retry".
    return new NextResponse('', { status: 421 });
  }
}

// =============================================
// FLOW ACTION ROUTER
// =============================================

async function handleFlowAction(
  action: FlowAction,
  accountId: string,
  organizationId: string,
): Promise<FlowResponse> {
  switch (action.action) {
    case 'ping':
      return handlePing(action);

    case 'INIT':
      return handleInit(action, accountId, organizationId);

    case 'BACK':
      return handleBack(action);

    case 'data_exchange':
      return handleDataExchange(action, accountId, organizationId);

    default:
      console.warn('[flows/data-exchange] Unknown action:', action.action);
      return {
        screen: 'ERROR',
        data: { error_message: 'Unknown action' },
      };
  }
}

// =============================================
// ACTION HANDLERS
// =============================================

/** Health check — Meta pings the endpoint to verify encryption works. */
function handlePing(action: FlowAction): FlowResponse {
  return {
    version: action.version || '3.0',
    data: { status: 'active' },
  };
}

/** INIT — First screen of the flow. Load initial data. */
async function handleInit(
  action: FlowAction,
  accountId: string,
  organizationId: string,
): Promise<FlowResponse> {
  // For now, return a generic init response.
  // Specific flow templates will override this via flow_token routing.
  const flowToken = action.flow_token || '';

  // Try to load flow-specific init data from the database
  const { data: flow } = await supabaseAdmin
    .from('whatsapp_cloud_flows')
    .select('flow_json, name')
    .eq('organization_id', organizationId)
    .eq('meta_flow_id', flowToken)
    .single();

  if (flow?.flow_json) {
    const flowJson = typeof flow.flow_json === 'string' ? JSON.parse(flow.flow_json) : flow.flow_json;
    const firstScreen = flowJson.screens?.[0];
    if (firstScreen) {
      return {
        screen: firstScreen.id,
        data: firstScreen.data || {},
      };
    }
  }

  return {
    screen: 'START',
    data: {},
  };
}

/** BACK — User navigated back. Return previous screen data. */
function handleBack(action: FlowAction): FlowResponse {
  // The screen to go back to should be specified in action.screen
  return {
    screen: action.screen || 'START',
    data: action.data || {},
  };
}

/** data_exchange — Main interaction handler. Process user input. */
async function handleDataExchange(
  action: FlowAction,
  accountId: string,
  organizationId: string,
): Promise<FlowResponse> {
  const screen = action.screen || '';
  const data = action.data || {};

  // Store the flow interaction data
  await supabaseAdmin.from('whatsapp_flow_events').insert({
    account_id: accountId,
    organization_id: organizationId,
    flow_token: action.flow_token,
    event_type: 'screen_completed',
    action: 'data_exchange',
    screen,
    request_data: data,
  }).then(({ error }) => {
    if (error) console.error('[flows/data-exchange] Failed to store event:', error);
  });

  // Default: acknowledge the data and close
  return {
    screen: 'SUCCESS',
    data: {
      extension_message_response: {
        params: { flow_token: action.flow_token, ...data },
      },
    },
  };
}

// =============================================
// EVENT LOGGING (non-blocking)
// =============================================

async function logFlowEvent(
  accountId: string,
  organizationId: string,
  action?: string,
  screen?: string,
): Promise<void> {
  await supabaseAdmin.from('whatsapp_flow_events').insert({
    account_id: accountId,
    organization_id: organizationId,
    event_type: 'started',
    action: action || 'unknown',
    screen: screen || null,
    flow_token: '',
    contact_phone: '',
  });
}
