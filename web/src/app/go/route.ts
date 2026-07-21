export const runtime = 'nodejs';

export const GET = (req: Request): Response => {
  const url = new URL(req.url);
  const raw = (url.searchParams.get('repo') ?? '').trim().replace(/^https?:\/\/github\.com\//u, '').replace(/\.git$/u, '').replace(/\/$/u, '');
  const match = /^([\w.-]+)\/([\w.-]+)$/u.exec(raw);
  if (!match) return Response.redirect(new URL('/', url), 302);
  return Response.redirect(new URL(`/gh/${match[1]}/${match[2]}`, url), 302);
};
