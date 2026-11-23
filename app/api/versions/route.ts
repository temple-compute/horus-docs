import { versions } from '@/lib/versions';

export const revalidate = false;

// Read by old versions so their menu lists versions cut after them.
export function GET() {
  return Response.json(versions, { headers: { 'Access-Control-Allow-Origin': '*' } });
}
