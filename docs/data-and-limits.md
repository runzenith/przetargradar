# Źródła danych i obsługiwane dokumenty

## Ogłoszenia

Aplikacja pobiera dane z BZP/e-Zamówień, TED, Bazy Konkurencyjności i publicznego eksportu platformazakupowa.pl. Dostępność i kompletność wyników zależą od źródła oraz zakresu udostępnianego API. Link do oryginalnego ogłoszenia jest w szczegółach oferty.

Synchronizacja działa w tle. Stan aplikacji może być opóźniony względem serwisu źródłowego. Eksport platformazakupowa.pl nie stanowi pełnego archiwum zamówień.

## Dokumenty

Obsługiwane są publicznie dostępne PDF-y wskazane w ogłoszeniu lub na obsługiwanej stronie postępowania. Dostęp do niektórych plików wymaga logowania albo JavaScript — takich dokumentów worker nie pobiera. ZIP i DOCX nie są analizowane.

Obowiązują konfigurowalne limity liczby plików, ich rozmiaru, stron wymagających OCR i całego wejścia analizy. Przekroczenie limitu jest oznaczane w interfejsie. Szczegóły domyślnych limitów i procesu odczytu opisuje [architektura](architecture.md).

## Wynik analizy

Analiza obejmuje materiały faktycznie przekazane modelowi. Odczyt OCR i odpowiedzi AI mogą zawierać pomyłki, szczególnie w tabelach i kwotach. Backend sprawdza format wyniku oraz obecność cytatów w źródle, a dla PDF również wskazaną stronę. To nie zastępuje sprawdzenia oryginalnej dokumentacji przed złożeniem oferty.

## Lokalizacja

Mapa pokazuje siedzibę zamawiającego, a miejsce realizacji tylko wtedy, gdy udało się je ustalić. Punkt na mapie oznacza środek miejscowości, nie dokładny adres inwestycji.

Aplikacja służy do wyszukiwania i porównywania ogłoszeń. Nie składa ofert i nie kontaktuje się z zamawiającymi.
