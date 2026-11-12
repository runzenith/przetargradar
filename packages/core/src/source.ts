import type { PrismaClient } from '@prisma/client';
import type { Config } from './config.js';
import { BzpClient } from './bzp.js';
import { DemoSource } from './demo.js';
import { TedClient } from './ted.js';
import { BkClient, PzClient } from './public-feeds.js';
import type { NoticeSource } from './bzp.js';
export const createSources = (config: Config, db?: PrismaClient): NoticeSource[] => {
  if (config.APP_MODE === 'DEMO') return [new DemoSource()];
  const sources: NoticeSource[] = [new BzpClient(config)];
  if (config.ENABLE_TED)
    sources.push(
      new TedClient(
        config,
        fetch,
        db
          ? {
              get: async (id) =>
                db.tenderNotice.findFirst({
                  where: { sourceId: id, current: true, tender: { sourceKey: 'ted:' + id } },
                  select: { raw: true, fetchedAt: true },
                }),
              touch: async (id) => {
                await db.tenderNotice.updateMany({
                  where: { sourceId: id, current: true, tender: { sourceKey: 'ted:' + id } },
                  data: { fetchedAt: new Date() },
                });
              },
            }
          : undefined,
      ),
    );
  if (config.ENABLE_BK) sources.push(new BkClient(config));
  if (config.ENABLE_PLATFORMAZAKUPOWA) sources.push(new PzClient(config));
  return sources;
};
export const createSource = (config: Config) => createSources(config)[0]!;
