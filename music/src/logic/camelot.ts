export function parseCamelotKey(key: string): { number: number; letter: "A" | "B" } | null {
  const match = key.match(/^(1[0-2]|[1-9])([AB])$/);
  if (!match) return null;
  return { number: parseInt(match[1], 10), letter: match[2] as "A" | "B" };
}

export function getCamelotPenalty(fromKey: string, toKey: string): number {
  const from = parseCamelotKey(fromKey);
  const to = parseCamelotKey(toKey);
  if (!from || !to) return 40;

  const numDiff = Math.min(
    Math.abs(from.number - to.number),
    12 - Math.abs(from.number - to.number)
  );
  const sameNumber = numDiff === 0;
  const sameLetter = from.letter === to.letter;

  if (sameNumber && sameLetter) return 0;
  if (sameNumber && !sameLetter) return 4;
  if (numDiff === 1 && sameLetter) return 6;
  if (numDiff === 1 && !sameLetter) return 12;
  if (numDiff === 2) return 18;
  if (numDiff <= 4) return 30;
  return 40;
}
