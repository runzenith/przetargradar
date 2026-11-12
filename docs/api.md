# API

Dokumentacja OpenAPI jest pod `/api/docs`, a JSON pod `/api/docs/json` uruchomionej instancji.

| Endpoint                                                   | Przeznaczenie                                             |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| GET /api/tenders                                           | Lista i filtry, domyślnie 12 ofert na stronę              |
| GET /api/tenders/:id                                       | Szczegóły, analiza, aktualne ogłoszenia i stan dokumentów |
| GET /api/map                                               | Zagregowane punkty mapy                                   |
| GET /api/map/location                                      | Odszukanie miejscowości                                   |
| GET /api/system                                            | Liczniki i historia pracy workera                         |
| GET /api/health, /api/ready                                | Stan procesu i gotowość bazy                              |
| GET /api/auth/me                                           | Bieżąca sesja i token CSRF                                |
| POST /api/auth/register, /api/auth/login, /api/auth/logout | Obsługa konta                                             |
| GET /api/profile, PUT /api/profile                         | Profil zalogowanej firmy                                  |
| GET /api/user/tenders, PUT /api/user/tenders/:id           | Zapisane i przeczytane oferty                             |

Lista przyjmuje m.in. `q`, `industry`, `category`, `source`, `region`, `city`, `status`, `analysis`, `published`, `deadlineDays`, `sort`, `page` i `pageSize`. Dokładne wartości i limity definiuje `listQuerySchema` w packages/contracts/src/index.ts.

```text
/api/tenders?source=ted&status=active&page=1&pageSize=12
```

Zapisy wymagają sesji i nagłówka `X-CSRF-Token`. Endpointy odczytowe nie uruchamiają analizy AI ani pobierania dokumentów. Szczegóły administratora i ewentualne ręczne operacje są rozdzielone od normalnego interfejsu użytkownika.
