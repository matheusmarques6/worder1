// =============================================
// Import Contacts API
// src/app/api/contacts/import/route.ts
//
// POST: Importar contatos de CSV/Excel
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface ContactRow {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  tags?: string;
  [key: string]: any;
}

// =============================================
// POST - Importar contatos
// =============================================
export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  
  try {
    const body = await request.json();
    const {
      contacts,
      columnMapping,
      options = {},
    } = body;
    
    if (!contacts?.length) {
      return NextResponse.json(
        { error: 'contacts are required' },
        { status: 400 }
      );
    }
    
    const {
      skipDuplicates = true,
      duplicateField = 'email',
      updateExisting = false,
      defaultTags = [],
    } = options;
    
    // Mapear colunas
    const mappedContacts: ContactRow[] = contacts.map((row: any) => {
      const mapped: ContactRow = {};
      
      Object.entries(columnMapping || {}).forEach(([csvColumn, dbColumn]) => {
        if (row[csvColumn] !== undefined && row[csvColumn] !== '') {
          mapped[dbColumn as string] = row[csvColumn];
        }
      });
      
      if (!columnMapping || Object.keys(columnMapping).length === 0) {
        Object.entries(row).forEach(([key, value]) => {
          const normalizedKey = key.toLowerCase().trim();
          
          if (['email', 'e-mail', 'e_mail', 'mail'].includes(normalizedKey)) {
            mapped.email = String(value).trim();
          } else if (['phone', 'telefone', 'tel', 'celular', 'mobile', 'whatsapp'].includes(normalizedKey)) {
            mapped.phone = String(value).trim();
          } else if (['first_name', 'firstname', 'first name', 'nome', 'name', 'primeiro_nome'].includes(normalizedKey)) {
            mapped.first_name = String(value).trim();
          } else if (['last_name', 'lastname', 'last name', 'sobrenome', 'surname'].includes(normalizedKey)) {
            mapped.last_name = String(value).trim();
          } else if (['company', 'empresa', 'organization', 'org'].includes(normalizedKey)) {
            mapped.company = String(value).trim();
          } else if (['tags', 'tag', 'labels'].includes(normalizedKey)) {
            mapped.tags = String(value).trim();
          }
        });
      }
      
      return mapped;
    });
    
    const validContacts = mappedContacts.filter(c => c.email || c.phone);
    const invalidCount = mappedContacts.length - validContacts.length;
    
    if (validContacts.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum contato válido encontrado. Cada contato precisa de email ou telefone.' },
        { status: 400 }
      );
    }
    
    // Buscar contatos existentes - RLS filtra automaticamente
    let existingContacts: any[] = [];
    
    if (skipDuplicates || updateExisting) {
      const emails = validContacts.filter(c => c.email).map(c => c.email!.toLowerCase());
      const phones = validContacts.filter(c => c.phone).map(c => c.phone!.replace(/\D/g, ''));
      
      if (duplicateField === 'email' && emails.length > 0) {
        const { data } = await supabase
          .from('contacts')
          .select('id, email, phone')
          .in('email', emails);
        existingContacts = data || [];
      } else if (duplicateField === 'phone' && phones.length > 0) {
        const { data } = await supabase
          .from('contacts')
          .select('id, email, phone');
        
        existingContacts = (data || []).filter(c => {
          const normalizedPhone = c.phone?.replace(/\D/g, '');
          return phones.includes(normalizedPhone);
        });
      }
    }
    
    const existingMap = new Map<string, any>();
    existingContacts.forEach(c => {
      if (duplicateField === 'email' && c.email) {
        existingMap.set(c.email.toLowerCase(), c);
      } else if (duplicateField === 'phone' && c.phone) {
        existingMap.set(c.phone.replace(/\D/g, ''), c);
      }
    });
    
    const newContacts: any[] = [];
    const duplicateContacts: any[] = [];
    const toUpdate: any[] = [];
    
    validContacts.forEach(contact => {
      const key = duplicateField === 'email' 
        ? contact.email?.toLowerCase()
        : contact.phone?.replace(/\D/g, '');
      
      const existing = key ? existingMap.get(key) : null;
      
      if (existing) {
        if (updateExisting) {
          toUpdate.push({ ...contact, id: existing.id });
        } else {
          duplicateContacts.push(contact);
        }
      } else {
        newContacts.push(contact);
      }
    });
    
    // Preparar para inserção - usa organization_id do usuário autenticado
    const contactsToInsert = newContacts.map(contact => {
      let tags = defaultTags;
      if (contact.tags) {
        const contactTags = contact.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
        tags = [...new Set([...defaultTags, ...contactTags])];
      }
      
      return {
        organization_id: user.organization_id,
        email: contact.email?.toLowerCase() || null,
        phone: contact.phone || null,
        first_name: contact.first_name || null,
        last_name: contact.last_name || null,
        company: contact.company || null,
        tags,
        source: 'import',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });
    
    const BATCH_SIZE = 100;
    let insertedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < contactsToInsert.length; i += BATCH_SIZE) {
      const batch = contactsToInsert.slice(i, i + BATCH_SIZE);
      
      const { data, error } = await supabase
        .from('contacts')
        .insert(batch)
        .select('id');
      
      if (error) {
        console.error(`[Import] Batch ${i / BATCH_SIZE + 1} error:`, error);
        errorCount += batch.length;
        errors.push(`Batch ${i / BATCH_SIZE + 1}: ${error.message}`);
      } else {
        insertedCount += data?.length || 0;
      }
    }
    
    let updatedCount = 0;
    
    if (updateExisting && toUpdate.length > 0) {
      for (const contact of toUpdate) {
        const { error } = await supabase
          .from('contacts')
          .update({
            first_name: contact.first_name || undefined,
            last_name: contact.last_name || undefined,
            company: contact.company || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contact.id);
        
        if (!error) {
          updatedCount++;
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      summary: {
        total: contacts.length,
        valid: validContacts.length,
        invalid: invalidCount,
        inserted: insertedCount,
        duplicates: skipDuplicates ? duplicateContacts.length : 0,
        updated: updatedCount,
        errors: errorCount,
      },
      errors: errors.length > 0 ? errors : undefined,
      message: `${insertedCount} contatos importados com sucesso` + 
        (updatedCount > 0 ? `, ${updatedCount} atualizados` : '') +
        (duplicateContacts.length > 0 ? `, ${duplicateContacts.length} duplicados ignorados` : ''),
    });
    
  } catch (error: any) {
    console.error('[Import Contacts API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// GET - Preview de importação
// =============================================
export async function GET(request: NextRequest) {
  return NextResponse.json({
    supportedFormats: ['csv', 'json'],
    columns: {
      required: ['email ou phone'],
      optional: ['first_name', 'last_name', 'company', 'tags'],
    },
    autoDetectedColumns: {
      email: ['email', 'e-mail', 'e_mail', 'mail'],
      phone: ['phone', 'telefone', 'tel', 'celular', 'mobile', 'whatsapp'],
      first_name: ['first_name', 'firstname', 'first name', 'nome', 'name'],
      last_name: ['last_name', 'lastname', 'last name', 'sobrenome'],
      company: ['company', 'empresa', 'organization'],
      tags: ['tags', 'tag', 'labels'],
    },
    options: {
      skipDuplicates: {
        type: 'boolean',
        default: true,
        description: 'Ignorar contatos que já existem',
      },
      duplicateField: {
        type: 'string',
        default: 'email',
        options: ['email', 'phone'],
        description: 'Campo para detectar duplicados',
      },
      updateExisting: {
        type: 'boolean',
        default: false,
        description: 'Atualizar contatos existentes ao invés de ignorar',
      },
      defaultTags: {
        type: 'array',
        default: [],
        description: 'Tags para adicionar a todos os contatos importados',
      },
    },
    example: {
      contacts: [
        { email: 'joao@exemplo.com', nome: 'João Silva', telefone: '11999999999' },
      ],
      columnMapping: {
        email: 'email',
        nome: 'first_name',
        telefone: 'phone',
      },
      options: {
        skipDuplicates: true,
        defaultTags: ['importado'],
      },
    },
  });
}
