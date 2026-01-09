import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "TBD";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDifferential(diff: number): string {
  if (diff > 0) return `+${diff}`;
  return diff.toString();
}

export function getPokemonSpriteUrl(pokemonName: string): string {
  // Use PokeAPI sprites
  const formattedName = pokemonName.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${formattedName}.png`;
}

export function getTypeColor(type: string): string {
  const typeColors: Record<string, string> = {
    normal: "type-normal",
    fire: "type-fire",
    water: "type-water",
    electric: "type-electric",
    grass: "type-grass",
    ice: "type-ice",
    fighting: "type-fighting",
    poison: "type-poison",
    ground: "type-ground",
    flying: "type-flying",
    psychic: "type-psychic",
    bug: "type-bug",
    rock: "type-rock",
    ghost: "type-ghost",
    dragon: "type-dragon",
    dark: "type-dark",
    steel: "type-steel",
    fairy: "type-fairy",
  };
  return typeColors[type.toLowerCase()] || "type-normal";
}
