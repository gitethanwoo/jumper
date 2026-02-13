const WORDS = ["JUMP", "BEAM", "LINK", "SYNC", "BOLT", "DASH", "FLUX", "GRID"] as const;

export function generateCode(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const suffix = Math.floor(Math.random() * 10_000).toString().padStart(4, "0");
  return `${word}-${suffix}`;
}
