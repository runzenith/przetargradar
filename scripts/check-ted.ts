import { TedClient } from '../packages/core/src/ted.js';
try {
  const client = new TedClient({ TED_REQUEST_INTERVAL_MS: 3100 });
  const to = new Date();
  const from = new Date(to.getTime() - 2 * 86400000);
  const page = await client.page('cn-standard', from, to, null, 1);
  const n = page.items[0] ? client.normalize(await client.hydrate(page.items[0])) : null;
  console.log({
    accessible: true,
    found: page.items.length,
    nextPage: !!page.nextCursor,
    id: n?.sourceId,
    noticeType: n?.noticeType,
    textChars: n?.text.length,
    deadline: n?.deadline?.toISOString(),
    url: n?.sourceUrl,
  });
} catch (error) {
  console.error({
    accessible: false,
    error:
      error instanceof Error && /^(TED_[A-Z_]+|External HTTP \d+)$/.test(error.message)
        ? error.message
        : 'TED_CHECK_FAILED',
  });
  process.exitCode = 1;
}
