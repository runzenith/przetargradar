import { BzpClient, normalizeNotice } from '../packages/core/src/bzp.js';
const client = new BzpClient({ BZP_REQUEST_INTERVAL_MS: 3100 });
const result = await client.page(
  'ContractNotice',
  new Date('2026-11-09T08:00:00Z'),
  new Date('2026-11-09T08:05:00Z'),
  null,
  1,
);
if (!result.items.length) throw new Error('No records in reference window');
const notice = normalizeNotice(result.items[0]);
console.log({
  sourceId: notice.sourceId,
  procedureId: notice.procedureId,
  hasBody: notice.text.length > 0,
  publishedAt: notice.publishedAt.toISOString(),
  deadline: notice.deadline?.toISOString(),
  sourceUrl: notice.sourceUrl,
});
