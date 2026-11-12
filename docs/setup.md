# Uruchomienie i konfiguracja

## Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
docker compose --profile tools run --rm seed
```

Adres: http://localhost:8080. MySQL jest dostępny wewnątrz sieci Compose. Nie koliduje z MySQL zainstalowanym na hoście. Stan bazy jest w wolumenie mysql_data. Status: `docker compose ps`, logi: `docker compose logs -f --tail=100 worker api`.

Tryb DEMO nie wykonuje wywołań do dostawców AI ani źródeł ogłoszeń. Podkład mapy może być pobierany z OpenStreetMap. Rejestracja konta działa także w DEMO. Seed służy wyłącznie do przykładowych danych.

## Praca nad kodem

Wymagane Node.js 26, pnpm 10.33.2 oraz Docker do bazy. Utwórz .env z przykładu. Dla uruchomienia Vite ustaw w nim:

```dotenv
PUBLIC_ORIGIN=http://127.0.0.1:5173
DATABASE_URL=mysql://radar:radar_local@127.0.0.1:3307/przetargradar
```

Baza dla trybu developerskiego ma port 3307 ograniczony do localhost:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d mysql
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Otwórz http://127.0.0.1:5173. Polecenia pnpm zakładają domyślne hasło developerskie z przykładu; przy zmianie haseł dostosuj DATABASE_URL. Poppler i Tesseract są w obrazie Dockera. Uruchamianie ekstrakcji PDF poza kontenerem wymaga ich lokalnej instalacji.

## Tryb LIVE

Używaj osobnej bazy dla LIVE. Ustaw APP_MODE=LIVE, prawdziwy PUBLIC_ORIGIN, własne hasła i losowy ADMIN_TOKEN. Włącz potrzebne źródła oraz skonfiguruj wybranego dostawcę AI, AI_LIVE_ENABLED=true i dodatni AI_DAILY_LIMIT. AI_AUTO_PROVIDER=true pozwala korzystać z obu skonfigurowanych dostawców.

Limity RPM/TPM/RPD muszą odpowiadać kontu i modelowi. Limity w przykładzie nie gwarantują bezpłatnego korzystania. Klucze Gemini/Groq są opcjonalne w DEMO. Nie umieszczaj kluczy w kodzie ani w zmiennych frontendu VITE_*.

Po zmianie .env odtwórz kontenery. Migracje:

```bash
docker compose build
docker compose stop api worker web
docker compose run --rm --no-deps migrate
docker compose up -d
```

Przed aktualizacją zachowaj kopię bazy i konfiguracji. Nie uruchamiaj seeda w LIVE. Test narzędzi PDF bez wywołań AI: `docker compose exec worker node dist/check-documents.js`.
