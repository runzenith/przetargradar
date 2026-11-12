import { GoogleGenAI } from '@google/genai';
import { getConfig } from '../packages/core/src/config.js';
const c = getConfig();
if (!c.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
try {
  const model = await new GoogleGenAI({
    apiKey: c.GEMINI_API_KEY,
    httpOptions: { timeout: 20000, retryOptions: { attempts: 1 } },
  }).models.get({ model: c.GEMINI_MODEL });
  console.log({ accessible: true, model: model.name });
} catch (e) {
  console.error({
    accessible: false,
    status: e && typeof e === 'object' && 'status' in e ? e.status : 'network',
    model: c.GEMINI_MODEL,
  });
  process.exitCode = 1;
}
