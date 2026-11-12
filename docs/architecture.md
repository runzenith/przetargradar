# Architektura

Repozytorium jest workspace pnpm:

```text
apps/api/       Fastify: odczyt ofert, konta, profil i status systemu
apps/worker/    synchronizacja źródeł, dokumenty i analiza AI
apps/web/       React: wyszukiwarka, karty, szczegóły i mapa
packages/core/ adaptery źródeł i logika przetwarzania
packages/contracts/ wspólne typy i schematy Zod
packages/database/ Prisma, migracje i dane DEMO
infra/          Dockerfile i nginx
```

## Pobieranie ogłoszeń

Każde źródło ma własną pętlę i checkpoint. Import przechodzi przez strony wyników, normalizuje rekordy i zapisuje zmiany jako wersje ogłoszeń. Zakładka czasowa obejmuje również część poprzedniego okna, żeby ograniczyć ryzyko pominięcia opóźnionych publikacji. Błędne rekordy są odkładane do ponowienia. Błąd sieci albo bazy nie pozwala przesunąć checkpointu za nieukończoną stronę.

Domyślne odpytywanie źródeł odbywa się co godzinę. Eksport platformazakupowa.pl ma osobny, krótszy harmonogram, bo nie jest pełnym archiwum. To mechanizm synchronizacji przyrostowej, nie odpytywanie wszystkich serwisów przy każdym wejściu użytkownika.

## Kolejka AI

Kolejka jest w MySQL. Worker atomowo przejmuje job przez FOR UPDATE SKIP LOCKED. Lease i heartbeat umożliwiają wznowienie po awarii. Cache uwzględnia hash materiałów oraz konfigurację analizy.

Gemini i Groq mogą pracować w trybie wyboru dostawcy lub automatycznego routingu. Rezerwacje wywołań i tokenów są zapisywane w bazie. Opóźnienie przez quota nie powinno zużywać kolejnej próby analizy. Wynik przechodzi walidację Zod oraz sprawdzenie dosłownych cytatów i wartości pieniężnych.

## PDF i OCR

Osobny proces logiczny odkrywa publiczne linki do PDF. Cache przechowuje plik i tekst. Poppler odczytuje warstwę tekstową, a Tesseract pol+eng uruchamia się tylko dla stron z małą ilością tekstu. Dokumenty dodają własne sourceId i znaczniki stron do wejścia AI. Cytat ze wskazaną stroną musi zgadzać się z tą stroną tekstu.

Domyślnie przetwarzane są aktualne, niezakończone postępowania LIVE. Limity: 6 plików po 10 MB, do 12 stron OCR na PDF oraz wspólny limit wejścia AI. Pliki nie są po cichu ucinane; przekroczenie limitu jest widoczne jako brak. Nie jest to uniwersalny crawler wszystkich platform. ZIP i DOCX nie są rozpakowywane.

Pobieranie dopuszcza HTTPS, weryfikuje publiczny IPv4 i przypina DNS dla każdego żądania oraz przekierowania. Dodatkowo stosowane są limity odpowiedzi, czasu, pamięci i liczby żądań.

## Konta i frontend

Konta używają hashowanych haseł, sesji i ochrony CSRF dla zapisów. Zapisane przetargi oraz profil firmy są przypisane do właściciela. Przeglądanie ogłoszeń jest publiczne.

TanStack Query odpowiada za stan żądań i odświeżanie odczytów. Filtry są w URL. Mapa korzysta z lokalnego zestawu miejscowości GeoNames, a podkład z OpenStreetMap. Oznaczenie siedziby zamawiającego nie oznacza potwierdzonego miejsca realizacji.

## Wdrożenie

Compose uruchamia mysql, migrate, api, worker i web. Migracje muszą zakończyć się przed API i workerem, a nginx serwuje frontend i kieruje /api do Fastify. Publiczna instancja działa na VPS za nginx i Cloudflare. Klucze oraz hasła znajdują się w konfiguracji środowiska, nie w repozytorium.
