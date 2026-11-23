import { source } from '@/lib/source';

// Redirect to ?path= if this version has that page, else to the home page.
export function GET(request: Request) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('path') ?? '').split('/').filter(Boolean);
  return Response.redirect(new URL(source.getPage(slug)?.url ?? '/', url), 302);
}
