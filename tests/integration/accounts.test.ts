import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../../apps/api/src/app.js';
import { configSchema } from '../../packages/core/src/config.js';
import { ingestNotice } from '../../packages/core/src/ingest.js';
import { demoNotices } from '../../packages/core/src/demo.js';
const db = new PrismaClient(),
  config = configSchema.parse(process.env);
if (!new URL(config.DATABASE_URL).pathname.endsWith('_test')) throw new Error('Test DB required');
beforeAll(() => db.$connect());
beforeEach(async () => {
  await db.userTender.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.tenderMatch.deleteMany();
  await db.companyProfile.deleteMany();
  await db.analysisJob.deleteMany();
  await db.tenderAnalysis.deleteMany();
  await db.tenderNotice.deleteMany();
  await db.tender.deleteMany();
  await db.aiBudget.deleteMany();
  await db.aiProviderState.deleteMany();
});
afterAll(() => db.$disconnect());
it('registers, verifies passwords, protects CSRF/origin and revokes sessions', async () => {
  const app = await buildApp(db, config);
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'owner@example.com', password: 'very-long-password-123' },
    });
    expect(response.statusCode).toBe(200);
    const cookie = String(response.headers['set-cookie']).split(';')[0]!,
      csrf = response.json().csrf;
    expect(String(response.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(response.headers['set-cookie'])).toContain('SameSite=Lax');
    expect((await db.user.findFirstOrThrow()).passwordHash).not.toContain('very-long');
    expect((await db.session.findFirstOrThrow()).tokenHash).not.toBe(cookie.split('=')[1]);
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie } })).json().user.email).toBe(
      'owner@example.com',
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'owner@example.com', password: 'wrong-password-123' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { cookie, 'x-csrf-token': csrf, origin: 'https://attacker.example' },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { cookie, 'x-csrf-token': csrf },
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie } })).json().user).toBeNull();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@example.com', password: 'very-long-password-123' },
    });
    expect(login.statusCode).toBe(200);
  } finally {
    await app.close();
  }
});
it('isolates two owners, persists favorites and versions scoring without AI calls', async () => {
  const app = await buildApp(db, config);
  try {
    const headers = [];
    for (const email of ['a@example.com', 'b@example.com']) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email, password: 'long-password-123' },
      });
      headers.push({
        cookie: String(r.headers['set-cookie']).split(';')[0]!,
        'x-csrf-token': r.json().csrf,
      });
    }
    await ingestNotice(db, demoNotices()[0], config);
    const tender = await db.tender.findFirstOrThrow();
    expect((await app.inject('/api/profile')).statusCode).toBe(401);
    const profile = {
      description: 'IT',
      services: ['system'],
      exclusions: [],
      regions: [],
      cpvCodes: ['72263000-6'],
      competencies: [],
    };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/profile',
          headers: headers[0],
          payload: profile,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/api/profile', headers: headers[1] })).json().profile,
    ).toBeNull();
    await app.inject({
      method: 'PUT',
      url: '/api/user/tenders/' + tender.id,
      headers: headers[0],
      payload: { saved: true, read: true },
    });
    expect(
      (await app.inject({ url: '/api/tenders?view=saved', headers: headers[0] })).json().total,
    ).toBe(1);
    expect(
      (await app.inject({ url: '/api/tenders?view=saved', headers: headers[1] })).json().total,
    ).toBe(0);
    const matched = (
      await app.inject({ url: '/api/tenders?view=recommended', headers: headers[0] })
    ).json();
    expect(matched.matches[0].score).toBe(100);
    await app.inject({
      method: 'PUT',
      url: '/api/profile',
      headers: headers[0],
      payload: { ...profile, services: ['inny zakres'], cpvCodes: [] },
    });
    expect(
      (await app.inject({ url: '/api/tenders?view=recommended', headers: headers[0] })).json()
        .total,
    ).toBe(0);
    expect(await db.companyProfile.count()).toBe(2);
    expect(await db.tenderMatch.count()).toBe(1);
    expect(await db.userTender.count({ where: { saved: true } })).toBe(1);
    const jobs = await db.analysisJob.findMany();
    for (let i = 0; i < 8; i++) {
      await app.inject('/api/system');
      await app.inject('/api/tenders');
      await app.inject('/api/tenders/' + tender.id);
    }
    expect(await db.analysisJob.findMany()).toEqual(jobs);
    expect(await db.aiBudget.count()).toBe(0);
  } finally {
    await app.close();
  }
});
