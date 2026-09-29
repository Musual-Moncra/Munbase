import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase/server';

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/vi';
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const supabase = await createSupabaseServerClient();

  if (code && supabase) {
    const {error} = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get('next')), url.origin));
  }

  return NextResponse.redirect(new URL('/vi/login?error=auth', url.origin));
}
