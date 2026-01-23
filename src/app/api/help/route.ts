import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use public client for help (doesn't require auth)
function getPublicSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getPublicSupabase();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all'; // all, categories, articles, faqs
    const categorySlug = searchParams.get('category');
    const articleSlug = searchParams.get('article');
    const search = searchParams.get('search');

    // Get categories
    const { data: categories, error: catError } = await supabase
      .from('help_categories')
      .select('*')
      .eq('is_active', true)
      .order('position');

    if (catError) {
      console.error('Error fetching categories:', catError);
    }

    // Get FAQs
    let faqQuery = supabase
      .from('faq_items')
      .select(`
        *,
        category:help_categories(id, name, slug, icon, color)
      `)
      .eq('is_active', true)
      .order('position');

    if (categorySlug && categories) {
      const category = categories.find(c => c.slug === categorySlug);
      if (category) {
        faqQuery = faqQuery.eq('category_id', category.id);
      }
    }

    const { data: faqs, error: faqError } = await faqQuery;

    if (faqError) {
      console.error('Error fetching FAQs:', faqError);
    }

    // Get articles if requested
    let articles: any[] = [];
    if (type === 'all' || type === 'articles') {
      let articleQuery = supabase
        .from('help_articles')
        .select(`
          id, title, slug, summary, keywords, views, status, published_at,
          category:help_categories(id, name, slug, icon, color)
        `)
        .eq('status', 'published')
        .order('position');

      if (categorySlug && categories) {
        const category = categories.find(c => c.slug === categorySlug);
        if (category) {
          articleQuery = articleQuery.eq('category_id', category.id);
        }
      }

      if (search) {
        articleQuery = articleQuery.or(`title.ilike.%${search}%,summary.ilike.%${search}%`);
      }

      const { data: articleData, error: articleError } = await articleQuery;
      if (articleError) {
        console.error('Error fetching articles:', articleError);
      }
      articles = articleData || [];
    }

    // Get single article with full content
    let article = null;
    if (articleSlug) {
      const { data: articleData, error: articleError } = await supabase
        .from('help_articles')
        .select(`
          *,
          category:help_categories(id, name, slug, icon, color),
          author:profiles(id, first_name, last_name, avatar_url)
        `)
        .eq('slug', articleSlug)
        .eq('status', 'published')
        .single();

      if (!articleError && articleData) {
        article = articleData;

        // Increment view count
        await supabase
          .from('help_articles')
          .update({ views: (articleData.views || 0) + 1 })
          .eq('id', articleData.id);
      }
    }

    // Group FAQs by category for the response
    const faqsByCategory = (categories || []).map(cat => ({
      ...cat,
      faqs: (faqs || []).filter(f => f.category?.id === cat.id),
    })).filter(cat => cat.faqs.length > 0);

    // Get featured FAQs
    const featuredFaqs = (faqs || []).filter(f => f.is_featured);

    return NextResponse.json({
      categories: categories || [],
      faqsByCategory,
      featuredFaqs,
      allFaqs: faqs || [],
      articles,
      article,
    });

  } catch (error) {
    console.error('Error fetching help data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch help data' },
      { status: 500 }
    );
  }
}

// Record feedback (helpful yes/no)
export async function POST(request: NextRequest) {
  try {
    const supabase = getPublicSupabase();
    const body = await request.json();
    const { type, id, helpful } = body; // type: 'faq' | 'article', helpful: boolean

    const table = type === 'faq' ? 'faq_items' : 'help_articles';
    const column = helpful ? 'helpful_yes' : 'helpful_no';

    // Get current count
    const { data: current } = await supabase
      .from(table)
      .select('helpful_yes, helpful_no')
      .eq('id', id)
      .single();

    if (current) {
      const currentValue = helpful ? (current.helpful_yes || 0) : (current.helpful_no || 0);
      await supabase
        .from(table)
        .update({ [column]: currentValue + 1 })
        .eq('id', id);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error recording feedback:', error);
    return NextResponse.json(
      { error: 'Failed to record feedback' },
      { status: 500 }
    );
  }
}
