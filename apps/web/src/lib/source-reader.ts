export const sourceTopics = [
  ['all', 'Całe ogłoszenie'],
  ['dates', 'Terminy'],
  ['conditions', 'Warunki udziału'],
  ['money', 'Pieniądze i kryteria'],
  ['buyer', 'Zamawiający i lokalizacja'],
] as const;
const patterns: Record<string, RegExp> = {
  dates: /termin|deadline|date|duration|period|czas trwania/i,
  conditions: /warun|wymaga|kwalifik|zdolno|kryteri|require|selection|criterion|qualification/i,
  money: /kwot|warto|wadium|cena|kryteri|amount|currency|value|price|payment|guarantee/i,
  buyer: /zamawiaj|miejsc|adres|lokaliz|buyer|organisation|address|location|city|region/i,
};
export function sourcePassages(text: string, query: string, topic: string) {
  const parts = text.split(/\n\s*\n|\n(?=.{0,200}(?:[:：]|\/))/).filter((p) => p.trim());
  const terms = query.trim().toLocaleLowerCase('pl').split(/\s+/).filter(Boolean);
  return parts.filter(
    (p) =>
      terms.every((term) => p.toLocaleLowerCase('pl').includes(term)) &&
      (!patterns[topic] || patterns[topic]!.test(p)),
  );
}
