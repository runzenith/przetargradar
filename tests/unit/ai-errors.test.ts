import { it, expect } from 'vitest';
import { AnalysisFailure, describeAiError } from '../../packages/core/src/ai-errors.js';
it('stops repeated quota/access failures without exposing provider payloads', () => {
  expect(describeAiError({ status: 429, message: 'private body secret' })).toMatchObject({
    pause: 900000,
    retry: true,
  });
  expect(describeAiError({ status: 404 })).toMatchObject({ pause: 3600000 });
  expect(describeAiError({ status: 403, message: 'secret' }).message).not.toContain('secret');
  expect(describeAiError(new AnalysisFailure('AI_INCOMPLETE', 'MAX_TOKENS'))).toMatchObject({
    retry: false,
  });
  expect(describeAiError(new Error('Evidence quote is absent'))).toMatchObject({
    retry: true,
    pause: 60000,
  });
});
