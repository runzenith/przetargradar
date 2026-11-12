export const industries = [
  { id: 'construction', label: 'Budownictwo', prefixes: ['45'] },
  { id: 'roads', label: 'Drogi i infrastruktura', prefixes: ['4523', '44113'] },
  { id: 'it', label: 'IT i oprogramowanie', prefixes: ['48', '72', '302'] },
  { id: 'medical', label: 'Medycyna i farmacja', prefixes: ['33', '85'] },
  { id: 'food', label: 'Żywność', prefixes: ['15', '03'] },
  { id: 'transport', label: 'Transport i logistyka', prefixes: ['60', '63'] },
  { id: 'vehicles', label: 'Pojazdy i maszyny', prefixes: ['34', '16', '42'] },
  { id: 'energy', label: 'Energia i paliwa', prefixes: ['09', '31', '65'] },
  { id: 'consulting', label: 'Doradztwo i prawo', prefixes: ['79', '66'] },
  { id: 'training', label: 'Edukacja i szkolenia', prefixes: ['80'] },
  { id: 'cleaning', label: 'Sprzątanie', prefixes: ['909'] },
  { id: 'security', label: 'Ochrona i bezpieczeństwo', prefixes: ['797', '351'] },
  { id: 'green', label: 'Zieleń i leśnictwo', prefixes: ['773', '772'] },
  { id: 'catering', label: 'Catering i gastronomia', prefixes: ['55'] },
  { id: 'design', label: 'Projektowanie i inżynieria', prefixes: ['71'] },
  { id: 'furniture', label: 'Meble i wyposażenie', prefixes: ['39'] },
  { id: 'waste', label: 'Odpady i środowisko', prefixes: ['90'] },
  { id: 'water', label: 'Woda i kanalizacja', prefixes: ['45231', '651', '904'] },
  { id: 'maintenance', label: 'Serwis i naprawy', prefixes: ['50'] },
  { id: 'printing', label: 'Druk i materiały biurowe', prefixes: ['22', '30', '798'] },
  { id: 'telecom', label: 'Telekomunikacja', prefixes: ['32', '64'] },
  { id: 'culture', label: 'Kultura, sport i rekreacja', prefixes: ['92'] },
] as const;
export const regions = [
  'dolnośląskie',
  'kujawsko-pomorskie',
  'lubelskie',
  'lubuskie',
  'łódzkie',
  'małopolskie',
  'mazowieckie',
  'opolskie',
  'podkarpackie',
  'podlaskie',
  'pomorskie',
  'śląskie',
  'świętokrzyskie',
  'warmińsko-mazurskie',
  'wielkopolskie',
  'zachodniopomorskie',
];
export const sources = [
  ['bzp', 'BZP / e-Zamówienia'],
  ['ted', 'TED — Unia Europejska'],
  ['bk', 'Baza Konkurencyjności'],
  ['pz', 'platformazakupowa.pl'],
] as [string, string][];
export function industryFor(cpv: string | null) {
  if (!cpv) return undefined;
  const specificity = (i: (typeof industries)[number]) =>
    Math.max(0, ...i.prefixes.filter((p) => cpv.startsWith(p)).map((p) => p.length));
  return industries
    .filter((i) => specificity(i) > 0)
    .sort((a, b) => specificity(b) - specificity(a))[0];
}
export function sourceName(key: string) {
  return sources.find(([id]) => key.startsWith(id + ':'))?.[1] ?? 'BZP / e-Zamówienia';
}
