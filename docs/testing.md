# Testy

## Testy bez MySQL

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm exec playwright test --config playwright.ui.config.ts
```

Testy jednostkowe obejmują adaptery, filtry, przetwarzanie źródeł, granice synchronizacji, ograniczenia pobierania dokumentów, hash wejścia i walidację cytatów. Test UI podstawia odpowiedzi API: sprawdza filtry, paginację po 12 ofert, dokumenty, szczegóły, menu, motywy i układ mobilny. Nie wykonuje wywołań do płatnych API.

## Testy integracyjne

Przygotuj oddzielną bazę z nazwą kończącą się na _test. Użytkownik w DATABASE_URL_TEST musi mieć prawo migracji w tej bazie. Runner odmawia uruchomienia na bazie aplikacji lub nazwie bez tego sufiksu.

```bash
DATABASE_URL_TEST=mysql://USER:PASSWORD@127.0.0.1:3307/przetargradar_test pnpm test:integration
```

W PowerShell ustaw zmienną przez `$env:DATABASE_URL_TEST = "mysql://..."`, a następnie wykonaj polecenie pnpm. Testy integracyjne zapisują i usuwają rekordy w bazie testowej. Dostawcy AI są zastępowani atrapami. Test dostawców izoluje analizę od kolejki dokumentów; testy dokumentów są osobno.

## Scenariusze z rzeczywistym backendem DEMO

Uruchom bazę, migracje, seed i pnpm dev według setup.md, a następnie `pnpm test:e2e`. Ten zestaw wymaga API na http://127.0.0.1:5173/api/ready i APP_MODE=DEMO. Część mapowa wymaga dostępu do kafelków OSM.

## CI

Workflow checks uruchamia formatowanie, typy, unit tests, build, testy integracyjne z MySQL oraz niezależny test UI. Wynik konkretnego uruchomienia jest w zakładce Actions. Nie jest to potwierdzenie zgodności aktualnych zewnętrznych API ani jakości OCR dla każdego dokumentu.
