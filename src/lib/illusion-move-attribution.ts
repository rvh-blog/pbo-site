export type MoveUsagePokemon = {
  name: string;
  movesUsed: Record<string, number>;
  setupMovesUsed: number;
};

type Player = "p1" | "p2";

type ActiveMoveStint = {
  nickname: string;
  attributedPokemonName: string;
  movesUsed: Record<string, number>;
  setupMovesUsed: number;
  entryState: string | null;
  currentState: string | null;
  reassigned: boolean;
};

function healthStateFingerprint(health: string | undefined) {
  if (!health) return null;
  const normalized = health.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || null;
}

function isTraceableReturnState(state: string | null) {
  if (!state) return false;
  if (/\s(?:brn|par|psn|tox|slp|frz)$/.test(state)) return true;

  const hp = state.match(/^(\d+)\/(\d+)/);
  return Boolean(hp && Number(hp[1]) < Number(hp[2]));
}

/**
 * Tracks move commands within the current switch-in stint so Illusion can be
 * corrected without moving stats that the real disguise target earned during
 * an earlier appearance.
 */
export class IllusionMoveAttributionTracker {
  private readonly activeStints = new Map<Player, ActiveMoveStint>();
  private readonly completedStints = new Map<Player, ActiveMoveStint[]>([
    ["p1", []],
    ["p2", []],
  ]);

  beginStint(
    player: Player,
    nickname: string,
    attributedPokemonName: string,
    health?: string,
  ) {
    const previousStint = this.activeStints.get(player);
    if (previousStint) this.completedStints.get(player)?.push(previousStint);

    const entryState = healthStateFingerprint(health);
    this.activeStints.set(player, {
      nickname,
      attributedPokemonName,
      movesUsed: {},
      setupMovesUsed: 0,
      entryState,
      currentState: entryState,
      reassigned: false,
    });
  }

  recordHealth(player: Player, nickname: string, health: string) {
    const stint = this.activeStints.get(player);
    if (!stint || stint.nickname !== nickname) return;
    stint.currentState = healthStateFingerprint(health);
  }

  recordMove(player: Player, nickname: string, moveName: string, isSetupMove: boolean) {
    const stint = this.activeStints.get(player);
    if (!stint || stint.nickname !== nickname) return;

    stint.movesUsed[moveName] = (stint.movesUsed[moveName] || 0) + 1;
    if (isSetupMove) stint.setupMovesUsed += 1;
  }

  revealIllusion(
    player: Player,
    nickname: string,
    revealedPokemonName: string,
    team: MoveUsagePokemon[],
  ) {
    const stint = this.activeStints.get(player);
    if (!stint) return 0;

    let reassignedStints = this.reassignStint(stint, revealedPokemonName, team) ? 1 : 0;
    let priorEntryState = stint.entryState;
    const completed = this.completedStints.get(player) || [];

    // A Zoroark that leaves the field without losing Illusion produces no
    // replace event. Its next disguised switch-in starts with the same public
    // HP/status state, so walk that unique state chain backward. If more than
    // one stint has the same state, leave it untouched instead of guessing.
    while (isTraceableReturnState(priorEntryState)) {
      const candidates = completed.filter(
        (candidate) => !candidate.reassigned && candidate.currentState === priorEntryState,
      );
      if (candidates.length !== 1) break;

      const candidate = candidates[0];
      if (this.reassignStint(candidate, revealedPokemonName, team)) reassignedStints += 1;
      candidate.reassigned = true;
      priorEntryState = candidate.entryState;
    }

    stint.nickname = nickname;
    stint.attributedPokemonName = revealedPokemonName;
    stint.movesUsed = {};
    stint.setupMovesUsed = 0;
    stint.reassigned = true;
    return reassignedStints;
  }

  private reassignStint(
    stint: ActiveMoveStint,
    revealedPokemonName: string,
    team: MoveUsagePokemon[],
  ) {
    if (stint.attributedPokemonName === revealedPokemonName) return false;

    const disguisedPokemon = team.find((pokemon) => pokemon.name === stint.attributedPokemonName);
    const revealedPokemon = team.find((pokemon) => pokemon.name === revealedPokemonName);
    if (!disguisedPokemon || !revealedPokemon) return false;

    for (const [moveName, uses] of Object.entries(stint.movesUsed)) {
      const remainingDisguisedUses = (disguisedPokemon.movesUsed[moveName] || 0) - uses;
      if (remainingDisguisedUses > 0) {
        disguisedPokemon.movesUsed[moveName] = remainingDisguisedUses;
      } else {
        delete disguisedPokemon.movesUsed[moveName];
      }
      revealedPokemon.movesUsed[moveName] = (revealedPokemon.movesUsed[moveName] || 0) + uses;
    }

    disguisedPokemon.setupMovesUsed = Math.max(
      0,
      disguisedPokemon.setupMovesUsed - stint.setupMovesUsed,
    );
    revealedPokemon.setupMovesUsed += stint.setupMovesUsed;
    stint.reassigned = true;
    return true;
  }
}
