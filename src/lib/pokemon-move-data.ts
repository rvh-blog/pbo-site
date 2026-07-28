export interface MoveDataEntry {
  id: string;
  name: string;
}

export interface PokemonMoveData {
  removal: MoveDataEntry[];
  setters: MoveDataEntry[];
  pivots: MoveDataEntry[];
  utility: MoveDataEntry[];
  support: MoveDataEntry[];
  priority: MoveDataEntry[];
}

const MOVE_DATA_CATEGORIES: Record<keyof PokemonMoveData, MoveDataEntry[]> = {
  removal: [
    { id: "rapid-spin", name: "Rapid Spin" },
    { id: "defog", name: "Defog" },
    { id: "mortal-spin", name: "Mortal Spin" },
    { id: "tidy-up", name: "Tidy Up" },
    { id: "court-change", name: "Court Change" },
  ],
  setters: [
    { id: "stealth-rock", name: "Stealth Rock" },
    { id: "spikes", name: "Spikes" },
    { id: "toxic-spikes", name: "Toxic Spikes" },
    { id: "sticky-web", name: "Sticky Web" },
    { id: "ceaseless-edge", name: "Ceaseless Edge" },
    { id: "stone-axe", name: "Stone Axe" },
  ],
  pivots: [
    { id: "u-turn", name: "U-Turn" },
    { id: "volt-switch", name: "Volt Switch" },
    { id: "flip-turn", name: "Flip Turn" },
    { id: "parting-shot", name: "Parting Shot" },
    { id: "teleport", name: "Teleport" },
    { id: "chilly-reception", name: "Chilly Reception" },
    { id: "shed-tail", name: "Shed Tail" },
  ],
  utility: [
    { id: "will-o-wisp", name: "Will-O-Wisp" },
    { id: "thunder-wave", name: "Thunder Wave" },
    { id: "toxic", name: "Toxic" },
    { id: "glare", name: "Glare" },
    { id: "taunt", name: "Taunt" },
    { id: "encore", name: "Encore" },
    { id: "whirlwind", name: "Whirlwind" },
    { id: "roar", name: "Roar" },
    { id: "dragon-tail", name: "Dragon Tail" },
    { id: "circle-throw", name: "Circle Throw" },
    { id: "trick", name: "Trick" },
    { id: "switcheroo", name: "Switcheroo" },
    { id: "yawn", name: "Yawn" },
    { id: "knock-off", name: "Knock Off" },
  ],
  support: [
    { id: "wish", name: "Wish" },
    { id: "healing-wish", name: "Healing Wish" },
    { id: "lunar-dance", name: "Lunar Dance" },
    { id: "aromatherapy", name: "Aromatherapy" },
    { id: "heal-bell", name: "Heal Bell" },
    { id: "tailwind", name: "Tailwind" },
    { id: "trick-room", name: "Trick Room" },
    { id: "reflect", name: "Reflect" },
    { id: "light-screen", name: "Light Screen" },
    { id: "aurora-veil", name: "Aurora Veil" },
    { id: "haze", name: "Haze" },
    { id: "memento", name: "Memento" },
  ],
  priority: [
    { id: "fake-out", name: "Fake Out" },
    { id: "first-impression", name: "First Impression" },
    { id: "extreme-speed", name: "Extreme Speed" },
    { id: "accelerock", name: "Accelerock" },
    { id: "aqua-jet", name: "Aqua Jet" },
    { id: "bullet-punch", name: "Bullet Punch" },
    { id: "ice-shard", name: "Ice Shard" },
    { id: "jet-punch", name: "Jet Punch" },
    { id: "mach-punch", name: "Mach Punch" },
    { id: "quick-attack", name: "Quick Attack" },
    { id: "shadow-sneak", name: "Shadow Sneak" },
    { id: "sucker-punch", name: "Sucker Punch" },
    { id: "vacuum-wave", name: "Vacuum Wave" },
    { id: "water-shuriken", name: "Water Shuriken" },
    { id: "grassy-glide", name: "Grassy Glide" },
  ],
};

export function getPokemonMoveData(moves: string[] | null | undefined): PokemonMoveData {
  const moveSet = new Set(moves || []);

  return {
    removal: MOVE_DATA_CATEGORIES.removal.filter((move) => moveSet.has(move.id)),
    setters: MOVE_DATA_CATEGORIES.setters.filter((move) => moveSet.has(move.id)),
    pivots: MOVE_DATA_CATEGORIES.pivots.filter((move) => moveSet.has(move.id)),
    utility: MOVE_DATA_CATEGORIES.utility.filter((move) => moveSet.has(move.id)),
    support: MOVE_DATA_CATEGORIES.support.filter((move) => moveSet.has(move.id)),
    priority: MOVE_DATA_CATEGORIES.priority.filter((move) => moveSet.has(move.id)),
  };
}
