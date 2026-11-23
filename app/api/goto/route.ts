import { source } from '@/lib/source';

// Redirect to ?path= if this version has that page, else to the home page.
export function GET(request: Request) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('path') ?? '').split('/').filter(Boolean);
  // Relative Location, so the redirect never takes its host from the request.
  return new Response(null, { status: 302, headers: { Location: source.getPage(slug)?.url ?? '/' } });
}
