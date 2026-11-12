import { z } from 'zod';
import { retryAfter } from './utils.js';
export class AnalysisFailure extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function describeAiError(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  if (status === 429)
    return {
      message: 'AI_RATE_LIMIT: limit dostawcy AI; kolejka wstrzymana na 15 minut.',
      retry: true,
      pause: Math.max(
        900000,
        retryAfter(
          error &&
            typeof error === 'object' &&
            'headers' in error &&
            error.headers instanceof Headers
            ? error.headers.get('retry-after')
            : null,
        ) ?? 0,
      ),
    };
  if ([400, 401, 403, 404].includes(status))
    return {
      message: `AI_HTTP_${status}: ${status === 404 ? 'model niedostępny dla tego klucza' : status === 400 ? 'dostawca odrzucił konfigurację lub schemat' : 'sprawdź klucz, uprawnienia i dostęp API'}. Kolejka wstrzymana na godzinę.`,
      retry: true,
      pause: 3600000,
    };
  if (status >= 500 && status <= 599)
    return { message: `AI_HTTP_${status}: przejściowy błąd dostawcy.`, retry: true, pause: 60000 };
  if (error instanceof AnalysisFailure)
    return {
      message: error.code + ': ' + error.message,
      retry: false,
      pause: error.code === 'MODEL_REDIRECT' ? 3600000 : 0,
    };
  if (error instanceof z.ZodError)
    return {
      message:
        'AI_SCHEMA: odpowiedź niezgodna ze schematem (' +
        error.issues
          .map((i) => i.path.join('.'))
          .slice(0, 5)
          .join(', ') +
        ').',
      retry: true,
      pause: 60000,
    };
  if (error instanceof SyntaxError)
    return { message: 'AI_JSON: dostawca zwrócił niepoprawny JSON.', retry: true, pause: 60000 };
  if (error instanceof Error && /evidence|scope|basis/i.test(error.message))
    return {
      message: 'AI_EVIDENCE: cytat, kwota lub źródło nie zostały potwierdzone w materiale.',
      retry: true,
      pause: 60000,
    };
  return {
    message: 'AI_UNAVAILABLE: przejściowy błąd dostawcy lub timeout.',
    retry: true,
    pause: 60000,
  };
}
