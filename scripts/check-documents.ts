import { documentGet } from '../packages/core/src/document-fetch.js';
import { extractPdf } from '../packages/core/src/documents.js';
const url =
  process.argv[2] ??
  'https://media.ezamowienia.gov.pl/pod/2022/07/Zapisy-do-SWZ_komunikacja_skladanie_ofert.pdf';
try {
  const signal = AbortSignal.timeout(180000);
  const file = await documentGet(url, 10000000, signal);
  if (!file.body.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw Error('DOCUMENT_NOT_PDF');
  const result = await extractPdf(file.body, 12, signal);
  console.log({
    accessible: true,
    bytes: file.body.length,
    textChars: result.text.length,
    pages: result.text.match(/\[Strona \d+\]/g)?.length ?? 0,
    ocr: result.ocr,
  });
} catch (error) {
  console.log({
    accessible: false,
    code:
      error instanceof Error && /^DOCUMENT_[A-Z_]+$/.test(error.message)
        ? error.message
        : 'PDF_DOWNLOAD_OR_NATIVE_TOOL_ERROR',
  });
  process.exitCode = 1;
}
