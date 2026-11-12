import { BkClient, PzClient } from '../packages/core/src/public-feeds.js';
const to = new Date();
const from = new Date(to.getTime() - 86400000);
let failed = false;
for (const source of [
  new BkClient({ BK_REQUEST_INTERVAL_MS: 3000 }),
  new PzClient({ PZ_REQUEST_INTERVAL_MS: 10000 }),
]) {
  try {
    const page = await source.page('ContractNotice', from, to, null, 1);
    const notice = page.items[0]
      ? source.normalize('hydrate' in source ? await source.hydrate(page.items[0]) : page.items[0])
      : null;
    console.log({
      source: source.id,
      accessible: true,
      found: page.items.length,
      nextPage: !!page.nextCursor,
      id: notice?.sourceId,
      textChars: notice?.text.length,
      url: notice?.sourceUrl,
    });
  } catch (error) {
    failed = true;
    console.error({
      source: source.id,
      accessible: false,
      error: error instanceof Error ? error.message : 'Unknown feed error',
    });
  }
}
if (failed) process.exitCode = 1;
