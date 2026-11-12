import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Config } from '../../../packages/core/src/config.js';
import { hash } from '../../../packages/core/src/utils.js';
const scrypt = promisify(derive);
const credentials = z.object({
  email: z
    .email()
    .max(191)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
});
export const profileInput = z.object({
  description: z.string().max(5000),
  services: z.array(z.string().min(1).max(100)).max(30),
  exclusions: z.array(z.string().min(1).max(100)).max(30),
  regions: z.array(z.string().max(80)).max(16),
  cpvCodes: z.array(z.string().regex(/^\d{8}(-\d)?$/)).max(30),
  competencies: z.array(z.string().max(200)).max(30),
});
export function scoreTender(
  profile: z.infer<typeof profileInput>,
  tender: {
    title: string;
    cpv: string | null;
    buyerRegion: string | null;
  },
) {
  const text = tender.title.toLocaleLowerCase('pl');
  const excluded = profile.exclusions.some((s) => text.includes(s.toLocaleLowerCase('pl')));
  const cpv = profile.cpvCodes.some((c) => tender.cpv?.startsWith(c.slice(0, 8))) ? 45 : 0;
  const services = profile.services.some((s) => text.includes(s.toLocaleLowerCase('pl'))) ? 35 : 0;
  const region =
    profile.regions.length === 0 ? 20 : profile.regions.includes(tender.buyerRegion ?? '') ? 20 : 0;
  return {
    score: excluded ? 0 : cpv + services + region,
    components: { cpv, services, region, excluded },
    explanation: excluded
      ? 'Tytuł zawiera wykluczoną usługę.'
      : `CPV ${cpv}/45 · usługi ${services}/35 · region zamawiającego ${region}/20.`,
    missingInformation: [
      'Kompetencje i warunki udziału wymagają sprawdzenia. Region dotyczy zamawiającego. Wynik nie jest prawdopodobieństwem wygranej.',
    ],
  };
}
export async function accountRoutes(app: FastifyInstance, db: PrismaClient, config: Config) {
  await app.register(cookie);
  const fail = (status: number, message: string) =>
    Object.assign(new Error(message), { statusCode: status });
  const cookieOptions = {
    httpOnly: true,
    secure: new URL(config.PUBLIC_ORIGIN).protocol === 'https:',
    sameSite: 'lax' as const,
    path: '/api',
    maxAge: 604800,
  };
  const session = async (req: FastifyRequest) => {
    const token = req.cookies.radar_session;
    if (!token) return null;
    return db.session.findFirst({
      where: { tokenHash: hash(token), expiresAt: { gt: new Date() } },
      include: { user: true },
    });
  };
  const owner = async (req: FastifyRequest) => {
    const s = await session(req);
    if (!s) throw fail(401, 'Zaloguj się, aby kontynuować.');
    if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-csrf-token'] !== s.csrf)
      throw fail(403, 'Nieprawidłowy token CSRF.');
    return s;
  };
  app.addHook('onRequest', async (req) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== config.PUBLIC_ORIGIN
    )
      throw fail(403, 'Niedozwolone źródło żądania.');
  });
  app.get('/api/auth/me', async (req) => {
    const s = await session(req);
    return s
      ? { user: { id: s.user.id, email: s.user.email }, csrf: s.csrf }
      : { user: null, csrf: null };
  });
  for (const action of ['register', 'login'] as const)
    app.post(
      `/api/auth/${action}`,
      { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
      async (req, reply) => {
        const parsed = credentials.safeParse(req.body);
        if (!parsed.success) throw fail(400, 'Podaj poprawny e-mail i hasło od 12 do 128 znaków.');
        const { email, password } = parsed.data;
        let user = await db.user.findUnique({ where: { email } });
        if (action === 'register') {
          if (user) throw fail(409, 'Nie można utworzyć konta dla tego adresu.');
          const salt = randomBytes(16).toString('hex');
          const key = (await scrypt(password, salt, 64)) as Buffer;
          try {
            user = await db.user.create({
              data: { email, passwordHash: salt + ':' + key.toString('hex') },
            });
          } catch {
            throw fail(409, 'Nie można utworzyć konta.');
          }
        } else {
          const [salt, key] = user?.passwordHash.split(':') ?? [
            '00000000000000000000000000000000',
            '00'.repeat(64),
          ];
          const candidate = (await scrypt(password, salt!, 64)) as Buffer;
          if (!user || !timingSafeEqual(candidate, Buffer.from(key!, 'hex')))
            throw fail(401, 'Nieprawidłowy e-mail lub hasło.');
        }
        if (req.cookies.radar_session)
          await db.session.deleteMany({ where: { tokenHash: hash(req.cookies.radar_session) } });
        const token = randomBytes(32).toString('hex'),
          csrf = randomBytes(32).toString('hex');
        await db.session.create({
          data: {
            tokenHash: hash(token),
            csrf,
            userId: user!.id,
            expiresAt: new Date(Date.now() + 604800000),
          },
        });
        reply.setCookie('radar_session', token, cookieOptions);
        return { user: { id: user!.id, email: user!.email }, csrf };
      },
    );
  app.post('/api/auth/logout', async (req, reply) => {
    const s = await owner(req);
    await db.session.delete({ where: { tokenHash: s.tokenHash } });
    reply.clearCookie('radar_session', { path: '/api' });
    return { ok: true };
  });
  app.get('/api/profile', async (req) => {
    const s = await owner(req);
    return {
      profile: await db.companyProfile.findFirst({
        where: { ownerId: s.userId },
        orderBy: { version: 'desc' },
      }),
    };
  });
  app.put('/api/profile', async (req) => {
    const s = await owner(req);
    const p = profileInput.safeParse(req.body);
    if (!p.success) throw fail(400, 'Sprawdź pola profilu i format kodów CPV.');
    const profile = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM User WHERE id=${s.userId} FOR UPDATE`;
      const old = await tx.companyProfile.findFirst({
        where: { ownerId: s.userId },
        orderBy: { version: 'desc' },
      });
      return tx.companyProfile.create({
        data: { ...p.data, ownerId: s.userId, version: (old?.version ?? 0) + 1 },
      });
    });
    return { profile };
  });
  app.get('/api/user/tenders', async (req) => {
    const s = await owner(req);
    return {
      states: await db.userTender.findMany({
        where: { userId: s.userId },
        select: { tenderId: true, saved: true, readAt: true },
      }),
    };
  });
  app.put<{
    Params: {
      id: string;
    };
  }>('/api/user/tenders/:id', async (req) => {
    const s = await owner(req);
    const p = z
      .object({ saved: z.boolean().optional(), read: z.boolean().optional() })
      .safeParse(req.body);
    if (!p.success) throw fail(400, 'Niepoprawny stan zamówienia.');
    if (
      !(await db.tender.findFirst({
        where: { id: req.params.id, isDemo: config.APP_MODE === 'DEMO' },
      }))
    )
      throw fail(404, 'Nie znaleziono zamówienia.');
    return db.userTender.upsert({
      where: { userId_tenderId: { userId: s.userId, tenderId: req.params.id } },
      create: {
        userId: s.userId,
        tenderId: req.params.id,
        saved: p.data.saved ?? false,
        readAt: p.data.read ? new Date() : null,
      },
      update: {
        ...(p.data.saved !== undefined ? { saved: p.data.saved } : {}),
        ...(p.data.read !== undefined ? { readAt: p.data.read ? new Date() : null } : {}),
      },
    });
  });
  return { owner };
}
