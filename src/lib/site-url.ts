export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://www.pokemonbattle.org";

export function absoluteSiteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}
