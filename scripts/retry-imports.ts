import { db } from '../packages/database/src/client.js';
import { getConfig } from '../packages/core/src/config.js';
import { createSources } from '../packages/core/src/source.js';
import { normalizeNotice } from '../packages/core/src/bzp.js';
import { ingestNotice } from '../packages/core/src/ingest.js';
const config = getConfig();
try {
  if (!process.argv.includes('--confirm'))
    throw new Error('Use --confirm to retry up to 50 quarantined source records.');
  const sources = createSources(config, db);
  const rows = await db.syncRejectedRecord.findMany({
    where: { resolvedAt: null, mode: config.APP_MODE },
    orderBy: { firstSeenAt: 'asc' },
    take: 50,
  });
  let resolved = 0,
    failed = 0;
  for (const row of rows) {
    const source = sources.find((s) => (s.id ?? 'bzp') === row.sourceId);
    if (!source) continue;
    const input = (
      row.raw as {
        payload: unknown;
      }
    ).payload;
    try {
      const full = input && typeof input === 'object' && ('fullText' in input || 'detail' in input);
      const raw = source.hydrate && !full ? await source.hydrate(input) : input;
      await ingestNotice(db, raw, config, source.normalize ?? normalizeNotice);
      await db.syncRejectedRecord.update({
        where: { recordKey: row.recordKey },
        data: { resolvedAt: new Date() },
      });
      resolved++;
    } catch {
      failed++;
      await db.syncRejectedRecord.update({
        where: { recordKey: row.recordKey },
        data: { attempts: { increment: 1 } },
      });
    }
  }
  console.log({ checked: rows.length, resolved, failed });
} finally {
  await db.$disconnect();
}
