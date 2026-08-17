export type ExperimentalMetricAvailability = "available" | "partial" | "event-storage";

export interface ExperimentalMetricDefinition {
  name: string;
  availability: ExperimentalMetricAvailability;
  definition: string;
}

const available = (name: string, definition: string): ExperimentalMetricDefinition => ({
  name,
  availability: "available",
  definition,
});

const partial = (name: string, definition: string): ExperimentalMetricDefinition => ({
  name,
  availability: "partial",
  definition,
});

const eventStorage = (name: string, definition = "Requires normalized, auditable protocol events to be stored for each replay."): ExperimentalMetricDefinition => ({
  name,
  availability: "event-storage",
  definition,
});

export const experimentalMetricGroups: Array<{
  label: string;
  metrics: ExperimentalMetricDefinition[];
}> = [
  {
    label: "Battle shape and appearances",
    metrics: [
      available("Total turns", "Last saved turn in the replay HP timeline."),
      eventStorage("First Pokémon sent out"),
      eventStorage("Most common lead"),
      eventStorage("Lead matchup frequency"),
      eventStorage("Turn of each Pokémon's first appearance"),
      eventStorage("Latest Pokémon revealed"),
      eventStorage("Total switch-ins"),
      eventStorage("Most switch-ins by one Pokémon"),
      eventStorage("Pokémon that never switched out"),
      eventStorage("All six Pokémon revealed"),
    ],
  },
  {
    label: "Moves and outcomes",
    metrics: [
      available("Moves used", "Explicit move-use counts saved per Pokémon appearance."),
      available("Most-used move", "Largest explicit move-use total in the active filters."),
      available("Unique moves revealed", "Distinct move names explicitly used."),
      available("Moves used exactly once", "Move names with one saved use in the active scope."),
      eventStorage("Consecutive uses of the same move"),
      eventStorage("Failed moves"),
      eventStorage("Moves with no target"),
      partial("Explicit misses", "Saved favorable-miss counts are available; full attempt-level context requires events."),
      partial("Critical hits", "Saved favorable critical-hit counts are available; all critical hits require events."),
      eventStorage("Super-effective hits"),
      eventStorage("Resisted hits"),
      eventStorage("Immunities"),
      eventStorage("Multi-hit move hit counts"),
      eventStorage("Protect-family successes"),
      eventStorage("Protect-family failures"),
      eventStorage("Substitute creations"),
      eventStorage("Substitute breaks"),
      eventStorage("Recoil activations"),
      eventStorage("Drain activations"),
    ],
  },
  {
    label: "HP, survival, and faints",
    metrics: [
      partial("Total HP-loss events", "Team-level turn-to-turn HP losses can be counted; individual protocol events are not stored."),
      partial("Total healing events", "Team-level turn-to-turn recovery can be counted; Pokémon healing totals are stored."),
      partial("Largest displayed HP change", "Largest team-level change between saved turn snapshots."),
      eventStorage("Pokémon surviving at 1 HP"),
      available("First faint turn", "First explicit faint event saved in the match timeline."),
      available("Final faint turn", "Final explicit faint event saved in the match timeline."),
      available("Faint order", "Chronological explicit faint events saved for a match."),
      partial("Pokémon remaining at battle end", "Available from recorded match differential, but not as a protocol-event roster list."),
      available("Turns before the first faint", "First explicit faint turn minus the battle start."),
    ],
  },
  {
    label: "Statuses",
    metrics: [
      partial("Burns inflicted", "Saved favorable burn counts cover favorable replay procs, not every burn."),
      eventStorage("Paralysis inflicted"),
      eventStorage("Poison and toxic poison inflicted"),
      partial("Sleep inflicted", "Saved favorable sleep counts cover favorable replay procs, not every sleep."),
      partial("Freezes inflicted", "Saved favorable freeze counts cover explicit favorable freezes."),
      eventStorage("Confusion activations"),
      partial("Flinches", "Saved favorable flinch counts are available."),
      partial("Fully paralyzed turns", "Saved favorable paralysis counts cover opponent full-paralysis events."),
      eventStorage("Turns asleep"),
      eventStorage("Turns frozen"),
      eventStorage("Status cures"),
      eventStorage("Distinct statuses experienced by one Pokémon"),
    ],
  },
  {
    label: "Items and abilities",
    metrics: [
      available("Items revealed", "Explicit held-item reveal records saved per Pokémon appearance."),
      available("Item reveal turn", "Turn attached to each saved held-item reveal."),
      eventStorage("Items consumed"),
      eventStorage("Items knocked off"),
      eventStorage("Items stolen"),
      eventStorage("Items exchanged"),
      eventStorage("Berries activated"),
      eventStorage("Focus Sash activations"),
      eventStorage("Air Balloon pops"),
      eventStorage("Leftovers recovery activations"),
      eventStorage("Abilities revealed"),
      eventStorage("Ability reveal turn"),
      eventStorage("Ability activations"),
      eventStorage("Abilities copied"),
      eventStorage("Abilities swapped"),
      eventStorage("Abilities suppressed"),
      eventStorage("Intimidate activations"),
    ],
  },
  {
    label: "Field conditions",
    metrics: [
      eventStorage("Weather activations"),
      eventStorage("Weather changes"),
      eventStorage("Weather duration"),
      eventStorage("Terrain activations"),
      eventStorage("Terrain duration"),
      eventStorage("Entry hazards placed"),
      eventStorage("Maximum hazard layers"),
      eventStorage("Hazards removed"),
      eventStorage("Reflect activations"),
      eventStorage("Light Screen activations"),
      eventStorage("Aurora Veil activations"),
      eventStorage("Tailwind activations"),
      eventStorage("Trick Room activations"),
      eventStorage("Field-condition duration"),
    ],
  },
  {
    label: "Transformations and stat stages",
    metrics: [
      eventStorage("Terastallization usage"),
      eventStorage("Tera type"),
      eventStorage("Tera turn"),
      eventStorage("Games completed without Terastallizing"),
      eventStorage("Form changes"),
      eventStorage("Type changes"),
      eventStorage("Transform activations"),
      partial("Illusion reveals", "Matches involving Zoroark are flagged, but individual reveal events are not stored."),
      partial("Stat boosts", "Setup-move use is stored; exact stat-stage events are not."),
      eventStorage("Stat drops"),
      eventStorage("Highest explicitly displayed boost stage"),
      eventStorage("Boost resets"),
    ],
  },
  {
    label: "Replay records and rare events",
    metrics: [
      eventStorage("Most replay events in one turn"),
      partial("Most HP changes in one turn", "Team-level turn snapshots are available, not every HP protocol event."),
      eventStorage("Most switches in one turn"),
      eventStorage("Most simultaneous field conditions"),
      available("Most distinct moves in one battle", "Distinct saved move names across both teams."),
      partial("Latest item, ability, move, or Pokémon reveal", "Item reveal turns are stored; the other reveal types require events."),
      partial("Rarest explicitly recorded battle event", "Can rank saved faint causes and item reveals; complete rarity requires normalized events."),
      eventStorage("Most protocol events in one turn"),
      available("Longest replay by turns", "Largest saved final turn."),
      eventStorage("Shortest replay with all twelve Pokémon revealed"),
      eventStorage("Turn with the most switches"),
      partial("Turn with the most HP changes", "Team-level changes are available; individual changes require events."),
      available("Most distinct move names in one battle", "Distinct saved move names across both teams."),
      eventStorage("Most explicit failures in a win"),
      eventStorage("Most simultaneous active conditions"),
      eventStorage("Most Pokémon affected by the same status"),
      eventStorage("Battles containing the rarest explicit event"),
      eventStorage("Exact frequency of every move/item/ability/status combination publicly revealed"),
    ],
  },
];
export const experimentalVisualDefinitions = [
  { name: "Move outcome flow", availability: "event-storage" as const, description: "Attempt-to-outcome flow for success, critical, effectiveness, miss, failure, immunity, and no target." },
  { name: "Item reveal timeline", availability: "available" as const, description: "Histogram of explicit first-held-item reveal turns." },
  { name: "Turn involvement heatmap", availability: "event-storage" as const, description: "Pokémon-by-turn active-state grid." },
  { name: "Battle event timeline", availability: "partial" as const, description: "Saved team HP, faint, and win events are available now; switches and field events require storage." },
  { name: "Switch sequence network", availability: "event-storage" as const, description: "Explicit switch-in sequence graph without strategic interpretation." },
  { name: "Status dashboard", availability: "partial" as const, description: "Favorable status-event summaries are available; complete status timing requires events." },
  { name: "Field-condition timeline", availability: "event-storage" as const, description: "Weather, terrain, rooms, screens, Tailwind, and hazard tracks." },
  { name: "Rare Event Explorer", availability: "partial" as const, description: "Saved replay records are searchable now; full protocol rarity requires events." },
];
