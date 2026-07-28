import { AnalyzerClient } from "./analyzer-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Replay Analyzer",
  description: "Analyze a Pokémon Showdown replay with turn-by-turn events and battle statistics.",
  alternates: { canonical: "/analyzer" },
};

export default function AnalyzerPage() {
  return <AnalyzerClient />;
}
