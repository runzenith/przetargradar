import { sleep } from './utils.js';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
export function publicIpv4(ip: string) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a! >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
let nextRequest = 0;
const pauses = new Map<string, number>();
export async function documentGet(
  input: string,
  maxBytes: number,
  signal?: AbortSignal,
  redirects = 0,
): Promise<{
  body: Buffer;
  type: string;
  url: string;
}> {
  const u = new URL(input);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443'))
    throw Error('DOCUMENT_URL_BLOCKED');
  if ((pauses.get(u.hostname) ?? 0) > Date.now()) throw Error('DOCUMENT_HOST_PAUSED');
  const wait = Math.max(0, nextRequest - Date.now());
  nextRequest = Math.max(Date.now(), nextRequest) + 2000;
  await sleep(wait, signal);
  const answers = await lookup(u.hostname, { family: 4, all: true });
  if (!answers.length || answers.some((a) => !publicIpv4(a.address)))
    throw Error('DOCUMENT_URL_BLOCKED');
  const combined = AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]);
  return new Promise((resolve, reject) => {
    const req = request(
      u,
      {
        family: 4,
        signal: combined,
        headers: {
          'User-Agent': 'PrzetargRadar/1.0 (public procurement documents)',
          Accept: 'application/pdf,text/html,application/json',
        },
        lookup: ((_host: unknown, _options: unknown, cb: Function) =>
          cb(null, answers[0]!.address, 4)) as never,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirects >= 3) return reject(Error('DOCUMENT_REDIRECT_LIMIT'));
          try {
            documentGet(
              new URL(res.headers.location, u).href,
              maxBytes,
              combined,
              redirects + 1,
            ).then(resolve, reject);
          } catch {
            reject(Error('DOCUMENT_URL_BLOCKED'));
          }
          return;
        }
        if (res.statusCode !== 200) {
          if (res.statusCode === 429 || res.statusCode === 403)
            pauses.set(u.hostname, Date.now() + (res.statusCode === 429 ? 900000 : 3600000));
          res.resume();
          return reject(Error('DOCUMENT_HTTP_' + res.statusCode));
        }
        if (Number(res.headers['content-length']) > maxBytes) {
          res.destroy();
          return reject(Error('DOCUMENT_SIZE_LIMIT'));
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            res.destroy(Error('DOCUMENT_SIZE_LIMIT'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            body: Buffer.concat(chunks),
            type: String(res.headers['content-type'] ?? ''),
            url: u.href,
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}
export type DocumentLink = {
  url: string;
  name: string;
};
export function documentLinks(
  raw: unknown,
  base: string,
): {
  files: DocumentLink[];
  pages: string[];
} {
  const files = new Map<string, DocumentLink>(),
    pages = new Set<string>();
  let nodes = 0;
  const add = (url: string, name = '') => {
    try {
      const u = new URL(url.replace(/&amp;/g, '&'), base);
      if (u.protocol !== 'https:') return;
      u.hash = '';
      if (
        /\.(pdf|docx?|xlsx?|zip)(?:$|[?#])/i.test(u.href) ||
        /\.pdf|\.docx?|\.zip/i.test(name) ||
        /\/api\/files\/\d+/.test(u.pathname)
      )
        files.set(u.href, {
          url: u.href,
          name: name || decodeURIComponent(u.pathname.split('/').at(-1) || 'PDF'),
        });
      else if (/postep|transakcja|mp-client|ezamaw|platformazakupowa/i.test(u.href))
        pages.add(u.href);
    } catch {}
  };
  const walk = (v: unknown, depth = 0) => {
    if (depth > 25 || ++nodes > 50000) return;
    if (typeof v === 'string') {
      for (const m of v.matchAll(/https?:\/\/[^\s<>"']+/g)) add(m[0]);
      for (const m of v.matchAll(/href\s*=\s*["']([^"']+)["'][^>]*>([^<]*)/gi)) add(m[1]!, m[2]);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (v && typeof v === 'object') {
      const r = v as Record<string, unknown>;
      for (const key of ['uri', 'url', 'href', 'download_url'])
        if (typeof r[key] === 'string') add(r[key] as string, String(r.name ?? r.title ?? ''));
      Object.values(r).forEach((x) => walk(x, depth + 1));
    }
  };
  walk(raw);
  return { files: [...files.values()], pages: [...pages] };
}
