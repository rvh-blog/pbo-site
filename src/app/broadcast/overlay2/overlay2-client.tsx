"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  useShowdownBattle,
  type RosterPokemon,
  type PokemonBattleState,
} from "@/hooks/use-showdown-battle";
import { normalizePokemonName } from "@/lib/battle-event-parser";
import { BattleScene, type BattleSceneHandle, type ChatLogEntry } from "../overlay/battle-scene";
import type { OverlayData, TeamData } from "../overlay/overlay-client";
import { ArrowLeftRight, Calculator, ChevronLeft, ChevronRight, Diamond, Mic, Pause, Play, Radio, ScrollText, SkipBack, SkipForward, Skull, Sword, Video, Zap } from "lucide-react";
import { calcDamage, type CalcMon, type CalcFieldState, type DamageResult, type EvSpread, EV_PRESETS, DEFAULT_EVS } from "@/lib/damage-calc";
import type { SideConditions } from "@/hooks/use-showdown-battle";

/* ═══════════════════════════════════════════════
   Layout Constants
   ═══════════════════════════════════════════════ */

const VIEWPORT_DEFAULT = { x: 360, y: 120, w: 1200, h: 675 };

/* ═══════════════════════════════════════════════
   Avatar Helpers
   ═══════════════════════════════════════════════ */

const AVATAR_NUMBERS: Record<string, string> = {
  "1":"lucas","2":"dawn","3":"youngster-gen4","4":"lass-gen4dp","5":"camper","6":"picnicker","7":"bugcatcher","8":"aromalady","9":"twins-gen4dp","10":"hiker-gen4",
  "11":"battlegirl-gen4","12":"fisherman-gen4","13":"cyclist-gen4","14":"cyclistf-gen4","15":"blackbelt-gen4dp","16":"artist-gen4","17":"pokemonbreeder-gen4","18":"pokemonbreederf-gen4","19":"cowgirl","20":"jogger",
  "21":"pokefan-gen4","22":"pokefanf-gen4","23":"pokekid","24":"youngcouple-gen4dp","25":"acetrainer-gen4dp","26":"acetrainerf-gen4dp","27":"waitress-gen4","28":"veteran-gen4","29":"ninjaboy","30":"dragontamer",
  "31":"birdkeeper-gen4dp","32":"doubleteam","33":"richboy-gen4","34":"lady-gen4","35":"gentleman-gen4dp","36":"madame-gen4dp","37":"beauty-gen4dp","38":"collector","39":"policeman-gen4","40":"pokemonranger-gen4",
  "41":"pokemonrangerf-gen4","42":"scientist-gen4dp","43":"swimmer-gen4dp","44":"swimmerf-gen4dp","45":"tuber","46":"tuberf","47":"sailor","48":"sisandbro","49":"ruinmaniac","50":"psychic-gen4",
  "51":"psychicf-gen4","52":"gambler","53":"guitarist-gen4","54":"acetrainersnow","55":"acetrainersnowf","56":"skier","57":"skierf-gen4dp","58":"roughneck-gen4","59":"clown","60":"worker-gen4",
  "61":"schoolkid-gen4dp","62":"schoolkidf-gen4","63":"roark","64":"barry","65":"byron","66":"aaron","67":"bertha","68":"flint","69":"lucian","70":"cynthia-gen4",
  "71":"bellepa","72":"rancher","73":"mars","74":"galacticgrunt","75":"gardenia","76":"crasherwake","77":"maylene","78":"fantina","79":"candice","80":"volkner",
  "81":"parasollady-gen4","82":"waiter-gen4dp","83":"interviewers","84":"cameraman","85":"reporter","86":"idol","87":"cyrus","88":"jupiter","89":"saturn","90":"galacticgruntf",
  "91":"argenta","92":"palmer","93":"thorton","94":"buck","95":"darach","96":"marley","97":"mira","98":"cheryl","99":"riley","100":"dahlia",
  "101":"ethan","102":"lyra","103":"twins-gen4","104":"lass-gen4","105":"acetrainer-gen4","106":"acetrainerf-gen4","107":"juggler","108":"sage","109":"li","110":"gentleman-gen4",
  "111":"teacher","112":"beauty","113":"birdkeeper","114":"swimmer-gen4","115":"swimmerf-gen4","116":"kimonogirl","117":"scientist-gen4","118":"acetrainercouple","119":"youngcouple","120":"supernerd",
  "121":"medium","122":"schoolkid-gen4","123":"blackbelt-gen4","124":"pokemaniac","125":"firebreather","126":"burglar","127":"biker-gen4","128":"skierf","129":"boarder","130":"rocketgrunt",
  "131":"rocketgruntf","132":"archer","133":"ariana","134":"proton","135":"petrel","136":"eusine","137":"lucas-gen4pt","138":"dawn-gen4pt","139":"madame-gen4","140":"waiter-gen4",
  "141":"falkner","142":"bugsy","143":"whitney","144":"morty","145":"chuck","146":"jasmine","147":"pryce","148":"clair","149":"will","150":"koga",
  "151":"bruno","152":"karen","153":"lance","154":"brock","155":"misty","156":"ltsurge","157":"erika","158":"janine","159":"sabrina","160":"blaine",
  "161":"blue","162":"red","163":"red","164":"silver","165":"giovanni","166":"unknownf","167":"unknown","168":"unknown","169":"hilbert","170":"hilda",
  "171":"youngster","172":"lass","173":"schoolkid","174":"schoolkidf","175":"smasher","176":"linebacker","177":"waiter","178":"waitress","179":"chili","180":"cilan",
  "181":"cress","182":"nurseryaide","183":"preschoolerf","184":"preschooler","185":"twins","186":"pokemonbreeder","187":"pokemonbreederf","188":"lenora","189":"burgh","190":"elesa",
  "191":"clay","192":"skyla","193":"pokemonranger","194":"pokemonrangerf","195":"worker","196":"backpacker","197":"backpackerf","198":"fisherman","199":"musician","200":"dancer",
  "201":"harlequin","202":"artist","203":"baker","204":"psychic","205":"psychicf","206":"cheren","207":"bianca","208":"plasmagrunt-gen5bw","209":"n","210":"richboy",
  "211":"lady","212":"pilot","213":"workerice","214":"hoopster","215":"scientistf","216":"clerkf","217":"acetrainerf","218":"acetrainer","219":"blackbelt","220":"scientist",
  "221":"striker","222":"brycen","223":"iris","224":"drayden","225":"roughneck","226":"janitor","227":"pokefan","228":"pokefanf","229":"doctor","230":"nurse",
  "231":"hooligans","232":"battlegirl","233":"parasollady","234":"clerk","235":"clerk-boss","236":"backers","237":"backersf","238":"veteran","239":"veteranf","240":"biker",
  "241":"infielder","242":"hiker","243":"madame","244":"gentleman","245":"plasmagruntf-gen5bw","246":"shauntal","247":"marshal","248":"grimsley","249":"caitlin","250":"ghetsis-gen5bw",
  "251":"depotagent","252":"swimmer","253":"swimmerf","254":"policeman","255":"maid","256":"ingo","257":"alder","258":"cyclist","259":"cyclistf","260":"cynthia",
  "261":"emmet","262":"hilbert-dueldisk","263":"hilda-dueldisk","264":"hugh","265":"rosa","266":"nate","267":"colress","268":"beauty-gen5bw2","269":"ghetsis","270":"plasmagrunt",
  "271":"plasmagruntf","272":"iris-gen5bw2","273":"brycenman","274":"shadowtriad","275":"rood","276":"zinzolin","277":"cheren-gen5bw2","278":"marlon","279":"roxie","280":"roxanne",
  "281":"brawly","282":"wattson","283":"flannery","284":"norman","285":"winona","286":"tate","287":"liza","288":"juan","289":"guitarist","290":"steven",
  "291":"wallace","292":"bellelba","293":"benga",
};

function getTrainerSpriteUrl(avatar: string): string {
  if (avatar.startsWith("#")) {
    return `https://play.pokemonshowdown.com/sprites/trainers-custom/${avatar.slice(1)}.png`;
  }
  const mapped = AVATAR_NUMBERS[avatar];
  if (mapped) return `https://play.pokemonshowdown.com/sprites/trainers/${mapped}.png`;
  return `https://play.pokemonshowdown.com/sprites/trainers/${avatar}.png`;
}

/** Map form names to their actual Showdown sprite filenames when they differ */
const SPRITE_NAME_OVERRIDES: Record<string, string> = {
  // Urshifu: Single-Strike is the base sprite, Rapid-Strike drops the hyphen
  "urshifu-rapid-strike": "urshifu-rapidstrike",
  "urshifu-single-strike": "urshifu",
  "urshifu-rapid-strike-gmax": "urshifu-gmax",
  "urshifu-single-strike-gmax": "urshifu-gmax",
  // Default forms that Showdown names differently from the sprite file
  "palafin-zero": "palafin",
  "sinistcha-artisan": "sinistcha",
  "shaymin-land": "shaymin",
  "xerneas-active": "xerneas",
  // Incarnate forms use the base sprite (no -incarnate suffix in filenames)
  "enamorus-incarnate": "enamorus",
  "landorus-incarnate": "landorus",
  "tornadus-incarnate": "tornadus",
  "thundurus-incarnate": "thundurus",
  // Galarian Darmanitan Zen uses the Galar sprite, not the base Zen sprite
  "darmanitan-galar-zen": "darmanitan-galar",
  // Terapagos: all forms 404 in ani/dex but exist in gen5ani with correct names —
  // no override needed, the fallback chain (ani→dex→gen5ani) handles it.
  // Indeedee-M: base sprite IS the male form
  "indeedee-m": "indeedee",
  // Dudunsparce: sprite file omits the hyphen between "three" and "segment"
  "dudunsparce-three-segment": "dudunsparce-threesegment",
  // Alcremie: no individual cream/sweet sprites, all use base
  "alcremie-vanilla-cream": "alcremie",
  "alcremie-ruby-cream": "alcremie",
  "alcremie-matcha-cream": "alcremie",
  "alcremie-mint-cream": "alcremie",
  "alcremie-lemon-cream": "alcremie",
  "alcremie-salted-cream": "alcremie",
  "alcremie-ruby-swirl": "alcremie",
  "alcremie-caramel-swirl": "alcremie",
  "alcremie-rainbow-swirl": "alcremie",
  // Florges: red form 404s, others may too — safe to map all color forms
  "florges-red": "florges",
  "florges-orange": "florges",
  "florges-yellow": "florges",
  "florges-white": "florges",
  // Ogerpon tera forms: sprite filename merges "tera" without a hyphen
  "ogerpon-cornerstone-tera": "ogerpon-cornerstonetera",
  "ogerpon-wellspring-tera": "ogerpon-wellspringtera",
  "ogerpon-hearthflame-tera": "ogerpon-hearthflametera",
};

function getShowdownSpriteUrl(battleForm: string): string {
  let id = battleForm.toLowerCase().replace(/[^a-z0-9-]/g, "");
  id = SPRITE_NAME_OVERRIDES[id] ?? id;
  return `https://play.pokemonshowdown.com/sprites/ani/${id}.gif`;
}

function getStaticSpriteUrl(name: string): string {
  let id = name.toLowerCase().replace(/[^a-z0-9-]/g, "");
  id = SPRITE_NAME_OVERRIDES[id] ?? id;
  return `https://play.pokemonshowdown.com/sprites/ani/${id}.gif`;
}

/** Dex sprite overrides — applied after hyphen stripping (dex uses no hyphens
 *  except for forms where the hyphenated name is the actual filename). */
const DEX_SPRITE_OVERRIDES: Record<string, string> = {
  "ogerponcornerstone": "ogerpon-cornerstone",
  "ogerponwellspring": "ogerpon-wellspring",
  "ogerponhearthflame": "ogerpon-hearthflame",
  "ogerponcornerstonetera": "ogerpon-cornerstonetera",
  "ogerponwellspringtera": "ogerpon-wellspringtera",
  "ogerponhearthflametera": "ogerpon-hearthflametera",
};

/** Fallback sprite URL for Pokemon without animated GIFs (e.g. Gen 9) */
function getDexSpriteUrl(name: string): string {
  let id = name.toLowerCase().replace(/[^a-z0-9-]/g, "");
  id = SPRITE_NAME_OVERRIDES[id] ?? id;
  id = id.replace(/-/g, "");
  id = DEX_SPRITE_OVERRIDES[id] ?? id;
  return `https://play.pokemonshowdown.com/sprites/dex/${id}.png`;
}

/** Second fallback: gen5-style animated sprites (some Gen 9 Pokemon like Terapagos are here) */
function getGen5SpriteUrl(name: string): string {
  let id = name.toLowerCase().replace(/[^a-z0-9-]/g, "");
  id = SPRITE_NAME_OVERRIDES[id] ?? id;
  return `https://play.pokemonshowdown.com/sprites/gen5ani/${id}.gif`;
}

/** Final fallback: gen5 static sprites (Iron Boulder, etc.) */
function getGen5StaticSpriteUrl(name: string): string {
  let id = name.toLowerCase().replace(/[^a-z0-9-]/g, "");
  id = SPRITE_NAME_OVERRIDES[id] ?? id;
  id = id.replace(/-/g, "");
  return `https://play.pokemonshowdown.com/sprites/gen5/${id}.png`;
}


/* ═══════════════════════════════════════════════
   Merged Mon (roster + battle state)
   ═══════════════════════════════════════════════ */

interface MergedMon {
  name: string;
  sprite: string;
  hp: number;
  maxHp: number;
  status: string;
  active: boolean;
  isCaptain: boolean;
  kills: number;
  fainted: boolean;
  terastallized: boolean;
  teraType: string | null;
  types: string[];
  ability: string | null;
  item: string | null;
  itemConsumed: boolean;
  movesUsed: string[];
  boosts: Record<string, number>;
  level: number;
}

function mergeMon(
  rp: RosterPokemon,
  stateMap: Map<string, PokemonBattleState>
): MergedMon {
  const norm = normalizePokemonName(rp.displayName || rp.name);
  const s = stateMap.get(norm);
  return {
    name: s?.battleForm || rp.displayName || rp.name,
    sprite: s?.battleForm
      ? getShowdownSpriteUrl(s.battleForm)
      : getStaticSpriteUrl(rp.name),
    hp: s?.hp ?? 100,
    maxHp: s?.maxHp ?? 100,
    status: s?.status || "",
    active: s?.active ?? false,
    isCaptain: rp.isTeraCaptain,
    kills: s?.kills ?? 0,
    fainted: s?.fainted ?? false,
    terastallized: s?.terastallized ?? false,
    teraType: s?.teraType ?? null,
    types: rp.types || [],
    ability: s?.ability ?? null,
    item: s?.item ?? null,
    itemConsumed: s?.itemConsumed ?? false,
    movesUsed: s?.movesUsed ?? [],
    boosts: s?.boosts ?? {},
    level: s?.level ?? 100,
  };
}

/* ═══════════════════════════════════════════════
   Match Context Types
   ═══════════════════════════════════════════════ */

export interface MatchContext {
  team1: TeamContext;
  team2: TeamContext;
  h2h: { coach1Wins: number; coach2Wins: number };
  divisionName: string;
}

interface TeamContext {
  standings: {
    position: number;
    wins: number;
    losses: number;
    differential: number;
    gamesPlayed: number;
    totalTeams: number;
    gamesRemaining: number;
    maxWins: number;
    playoffStatus: "clinched" | "eliminated" | "contending";
    relegationStatus: "safe" | "danger" | "relegated" | "exempt";
    teamAbbreviation: string;
  } | null;
  form: ("W" | "L")[];
  killLeader: {
    name: string;
    kills: number;
    divisionRank: number | null;
  } | null;
}

/* ═══════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════ */

interface Props {
  data: OverlayData;
  battleUrl: string;
  context?: MatchContext;
}

export function Overlay2Client({ data, battleUrl, context }: Props) {
  const battleSceneRef = useRef<BattleSceneHandle>(null);
  const battle = useShowdownBattle(battleUrl, data.team1.roster, data.team2.roster, battleSceneRef);
  const { seekToTurn, goLive, setPaused, maxTurn: hookMaxTurn, reviewingTurn, isPaused, playTurnPhased, onBattleSceneReady, syncBattleScene } = battle;

  // Extract room ID from battle URL for the BattleScene component
  const roomId = (battleUrl.match(/battle-[a-z0-9]+-\d+(?:-[a-z0-9]+)?/i) || battleUrl.match(/battle-[a-z0-9-]+/i))?.[0] || "";

  // Track max turn from BattleScene's visual engine (may differ slightly from hook)
  const [battleMaxTurn, setBattleMaxTurn] = useState(0);
  const effectiveMaxTurn = Math.max(hookMaxTurn, battleMaxTurn);
  const effectiveMaxTurnRef = useRef(effectiveMaxTurn);
  effectiveMaxTurnRef.current = effectiveMaxTurn;
  const battleEndedRef = useRef(!!battle.winner);
  battleEndedRef.current = !!battle.winner;

  // Keepalive: ping the server every 30s to prevent Fly.io from idling the machine
  useEffect(() => {
    const id = setInterval(() => { fetch("/api/health").catch(() => {}); }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Re-sync after tab is backgrounded.  Browsers throttle timers and pause
  // CSS/jQuery animations in background tabs, so the BattleScene falls behind.
  // When the tab becomes visible again, fast-forward the BattleScene.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      // Only re-sync in live mode (not reviewing a past turn)
      if (reviewingTurn !== null) return;
      // Fast-forward the BattleScene to catch up with everything it received
      battleSceneRef.current?.seekTurn(Infinity);
      battleSceneRef.current?.play();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [reviewingTurn]);

  const handleBattleTurnUpdate = useCallback((turn: number) => {
    setBattleMaxTurn(turn);
  }, []);

  // Playback from a reviewed turn — poll battle scene's turn to sync hook state
  const playbackActiveRef = useRef(false);
  const playbackTurnRef = useRef(0);
  const playbackTargetTurnRef = useRef(0);
  const playbackPollRef = useRef<NodeJS.Timeout | null>(null);
  const lastTurnProcessedRef = useRef(false);
  // Track the displayed turn during active playback (updated from battle scene polling)
  const [playbackDisplayTurn, setPlaybackDisplayTurn] = useState<number | null>(null);
  const stopPlayback = useCallback(() => {
    playbackActiveRef.current = false;
    lastTurnProcessedRef.current = false;
    setPlaybackDisplayTurn(null);
    if (playbackPollRef.current) {
      clearInterval(playbackPollRef.current);
      playbackPollRef.current = null;
    }
  }, []);

  // Coordinated seek: stop any playback, pause + seek both systems.
  // If seeking to the live edge, go live instead.
  const handleSeek = useCallback((turn: number) => {
    if (turn >= effectiveMaxTurnRef.current) {
      stopPlayback();
      goLive();
      battleSceneRef.current?.seekTurn(Infinity);
      battleSceneRef.current?.play();
      return;
    }
    stopPlayback();
    syncBattleScene();
    battleSceneRef.current?.pause();
    battleSceneRef.current?.seekTurn(turn);
    seekToTurn(turn);
    setPaused(true);
  }, [seekToTurn, setPaused, stopPlayback, goLive, syncBattleScene]);

  const handleGoLive = useCallback(() => {
    stopPlayback();
    goLive();
    battleSceneRef.current?.seekTurn(Infinity);
    battleSceneRef.current?.play();
  }, [goLive, stopPlayback]);

  // Play forward from a reviewed turn — let battle scene animate naturally,
  // poll its current turn to keep the hook state in sync with phased updates
  const startPlaybackFromReview = useCallback(() => {
    const startTurn = reviewingTurn;
    if (startTurn === null) return;

    setPaused(false);
    playbackActiveRef.current = true;
    playbackTurnRef.current = startTurn;
    playbackTargetTurnRef.current = effectiveMaxTurnRef.current;

    // Ensure BattleScene has all lines (turns may have arrived during review)
    syncBattleScene();

    // Don't process the starting turn's events yet — wait for the battle
    // engine to finish animating it (detected when sceneTurn advances).

    // Let battle scene play through all turns naturally
    battleSceneRef.current?.seekTurn(startTurn);
    battleSceneRef.current?.play();

    // Poll the battle scene's current turn. When it advances past a turn,
    // that turn's animations are done — process its events now (no spoilers).
    if (playbackPollRef.current) clearInterval(playbackPollRef.current);
    lastTurnProcessedRef.current = false;
    playbackPollRef.current = setInterval(() => {
      if (!playbackActiveRef.current) {
        if (playbackPollRef.current) clearInterval(playbackPollRef.current);
        playbackPollRef.current = null;
        return;
      }

      const sceneTurn = battleSceneRef.current?.getCurrentTurn() ?? 0;
      // Always update the display turn so the counter tracks the scene
      if (sceneTurn > 0) setPlaybackDisplayTurn(sceneTurn);
      if (sceneTurn > playbackTurnRef.current) {
        // The battle engine moved past playbackTurnRef → that turn just
        // finished animating.  Process its events now.
        const finishedTurn = playbackTurnRef.current;
        playbackTurnRef.current = sceneTurn;
        playTurnPhased(finishedTurn);
      }

      // Reached what we thought was the last turn — check if more arrived.
      if (sceneTurn >= playbackTargetTurnRef.current && !lastTurnProcessedRef.current) {
        // Check if BattleScene is still animating (queue not drained yet)
        const stillAnimating = battleSceneRef.current?.isAnimating() ?? false;
        if (stillAnimating) return; // keep polling until animations finish

        // Process this turn's events
        playTurnPhased(playbackTargetTurnRef.current);

        // Check if new turns arrived while we were playing back
        if (effectiveMaxTurnRef.current > playbackTargetTurnRef.current) {
          // More turns came in — sync them to BattleScene and keep playing
          playbackTurnRef.current = playbackTargetTurnRef.current;
          playbackTargetTurnRef.current = effectiveMaxTurnRef.current;
          syncBattleScene();
          // BattleScene will continue playing through the new lines
          return;
        }

        // Truly caught up — stop playback and go live
        lastTurnProcessedRef.current = true;
        playbackActiveRef.current = false;
        setPlaybackDisplayTurn(null);
        if (playbackPollRef.current) clearInterval(playbackPollRef.current);
        playbackPollRef.current = null;

        if (battleEndedRef.current) {
          // Battle is over — seek to end so the visual engine shows the
          // end state, then pause for the user to see it
          battleSceneRef.current?.seekTurn(Infinity);
          setPaused(true);
        } else {
          // Still live — go to live edge
          goLive();
          battleSceneRef.current?.seekTurn(Infinity);
          battleSceneRef.current?.play();
        }
      }
    }, 50);
  }, [reviewingTurn, setPaused, playTurnPhased, goLive, syncBattleScene]);

  const handleTogglePause = useCallback(() => {
    if (isPaused || reviewingTurn !== null) {
      if (playbackActiveRef.current) {
        // Currently playing back from review — pause it
        stopPlayback();
        setPaused(true);
        battleSceneRef.current?.pause();
      } else if (reviewingTurn !== null) {
        // Paused at a reviewed turn — start playing forward
        startPlaybackFromReview();
      } else {
        // Paused while live — just unpause
        setPaused(false);
        battleSceneRef.current?.play();
      }
    } else {
      stopPlayback();
      setPaused(true);
      battleSceneRef.current?.pause();
    }
  }, [isPaused, reviewingTurn, setPaused, stopPlayback, startPlaybackFromReview]);

  // --- p1/p2 → team1/team2 resolution ---
  const t1Names = new Set(data.team1.roster.map((r) => normalizePokemonName(r.displayName || r.name)));
  const t2Names = new Set(data.team2.roster.map((r) => normalizePokemonName(r.displayName || r.name)));
  const p1Species = [...battle.p1Pokemon.keys()];
  const p2Species = [...battle.p2Pokemon.keys()];

  let p1IsTeam1 = true;
  if (p1Species.length > 0 || p2Species.length > 0) {
    let p1MatchesT1 = 0, p1MatchesT2 = 0;
    for (const species of p1Species) {
      if (t1Names.has(species)) p1MatchesT1++;
      if (t2Names.has(species)) p1MatchesT2++;
    }
    for (const species of p2Species) {
      if (t1Names.has(species)) p1MatchesT2++;
      if (t2Names.has(species)) p1MatchesT1++;
    }
    if (p1MatchesT1 > p1MatchesT2) p1IsTeam1 = true;
    else if (p1MatchesT2 > p1MatchesT1) p1IsTeam1 = false;
    else p1IsTeam1 = battle.p1IsTeam1 ?? true;
  } else {
    p1IsTeam1 = battle.p1IsTeam1 ?? true;
  }

  const leftTeam = p1IsTeam1 ? data.team1 : data.team2;
  const rightTeam = p1IsTeam1 ? data.team2 : data.team1;
  const leftPokemon = battle.p1Pokemon;
  const rightPokemon = battle.p2Pokemon;
  const leftBrought = [...battle.p1Pokemon.values()].filter((p) => p.brought);
  const rightBrought = [...battle.p2Pokemon.values()].filter((p) => p.brought);
  const leftAlive = leftBrought.length > 0 ? leftBrought.filter((p) => !p.fainted).length : battle.p1Pokemon.size || 6;
  const rightAlive = rightBrought.length > 0 ? rightBrought.filter((p) => !p.fainted).length : battle.p2Pokemon.size || 6;
  const leftAvatar = battle.p1Avatar;
  const rightAvatar = battle.p2Avatar;

  // Split roster into brought / unbrought
  const splitRoster = (team: TeamData, stateMap: Map<string, PokemonBattleState>) => {
    const brought: RosterPokemon[] = [];
    const unbrought: RosterPokemon[] = [];
    team.roster.forEach((p) => {
      const norm = normalizePokemonName(p.displayName || p.name);
      const state = stateMap.get(norm);
      if (state?.brought) brought.push(p);
      else unbrought.push(p);
    });
    return { brought, unbrought };
  };

  const leftRoster = splitRoster(leftTeam, leftPokemon);
  const rightRoster = splitRoster(rightTeam, rightPokemon);

  // Merge brought pokemon with battle state
  const leftMons = leftRoster.brought.map((rp) => mergeMon(rp, leftPokemon));
  const rightMons = rightRoster.brought.map((rp) => mergeMon(rp, rightPokemon));

  // If no pokemon brought yet, show full roster as placeholder
  const leftDisplay = leftMons.length > 0 ? leftMons : leftTeam.roster.map((rp) => mergeMon(rp, leftPokemon));
  const rightDisplay = rightMons.length > 0 ? rightMons : rightTeam.roster.map((rp) => mergeMon(rp, rightPokemon));

  // Damage calc toggle + state (lifted here so it survives panel toggle)
  const [showDamageCalc, setShowDamageCalc] = useState(false);
  const [calcAtkIdx, setCalcAtkIdx] = useState(-1);
  const [calcDefIdx, setCalcDefIdx] = useState(-1);
  const [calcMoveIdx, setCalcMoveIdx] = useState(0);
  const [calcCustomMove, setCalcCustomMove] = useState("");
  const [calcAtkNature, setCalcAtkNature] = useState("Serious");
  const [calcDefNature, setCalcDefNature] = useState("Serious");
  const [calcAtkEvPreset, setCalcAtkEvPreset] = useState("252/252/4 Atk");
  const [calcDefEvPreset, setCalcDefEvPreset] = useState("252 HP / 252 SpD");
  const [calcFlipped, setCalcFlipped] = useState(false);

  // Viewport + edit mode
  const [viewport, setViewport] = useState(VIEWPORT_DEFAULT);

  // Fullscreen scaling (same pattern as power-rankings slideshow)
  const containerRef = useRef<HTMLDivElement>(null);
  const [screenSize, setScreenSize] = useState({ w: 1920, h: 1080 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hideUI, setHideUI] = useState(false);
  const [viewportHovered, setViewportHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  const scale = Math.min(screenSize.w / 1920, screenSize.h / 1080);
  const offsetX = (screenSize.w - 1920 * scale) / 2;
  const offsetY = (screenSize.h - 1080 * scale) / 2;

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); }
      else if (e.key === "h" || e.key === "H") { e.preventDefault(); setHideUI((p) => !p); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleFullscreen]);

  // Portal mount + hide layout chrome
  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Viewport scaling — measure container
  useEffect(() => {
    function measure() {
      const el = containerRef.current;
      if (el) {
        setScreenSize({ w: el.clientWidth, h: el.clientHeight });
      } else {
        setScreenSize({ w: window.innerWidth, h: window.innerHeight });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    document.addEventListener("fullscreenchange", measure);
    let ro: ResizeObserver | undefined;
    if (containerRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener("resize", measure);
      document.removeEventListener("fullscreenchange", measure);
      ro?.disconnect();
    };
  }, [mounted]);

  const divisionColor = data.divisionColor;

  if (!mounted) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-[#020617] overflow-hidden select-none"
    >
      {/* Scaled 1920x1080 container */}
      <div
        style={{
          width: 1920,
          height: 1080,
          position: "absolute",
          left: offsetX,
          top: offsetY,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <div className="w-[1920px] h-[1080px] bg-[#020617] text-slate-100 overflow-hidden select-none relative"
             style={{ fontFamily: "'Chakra Petch', system-ui, sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,300;0,400;0,500;0,600;0,700;1,700&family=Press+Start+2P&display=swap');
        .pixelated { image-rendering: pixelated; }
        .bg-dots {
          background-image: radial-gradient(${divisionColor}88 2px, transparent 2px);
          background-size: 32px 32px;
        }
        .scanlines {
          background: linear-gradient(
            to bottom,
            transparent 50%,
            rgba(0, 0, 0, 0.1) 51%,
            transparent 51%
          );
          background-size: 100% 4px;
        }
        .mask-fade-top {
          mask-image: linear-gradient(to bottom, transparent, black 15%);
        }
        .branding-wash {
          background: radial-gradient(circle at center, ${divisionColor} 0%, transparent 70%);
        }
      `}</style>

      {/* ── BACKGROUND: Dark base ── */}
      <div className="absolute inset-0 bg-[#020617]" />

      {/* ── Branding wash (division glow radiating from viewport, excludes viewport hole) ── */}
      <div className="absolute inset-0 pointer-events-none z-[8]" style={{
        background: `radial-gradient(ellipse 120% 100% at 50% ${viewport.y + viewport.h / 2}px, ${divisionColor}55 0%, ${divisionColor}30 30%, ${divisionColor}15 55%, ${divisionColor}08 75%, transparent 95%)`,
        clipPath: `polygon(
          0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
          ${viewport.x}px ${viewport.y}px,
          ${viewport.x + viewport.w}px ${viewport.y}px,
          ${viewport.x + viewport.w}px ${viewport.y + viewport.h}px,
          ${viewport.x}px ${viewport.y + viewport.h}px,
          ${viewport.x}px ${viewport.y}px
        )`,
      }} />

      {/* ── Division-colored dot pattern ── */}
      <div className="absolute inset-0 bg-dots pointer-events-none opacity-50 z-0" />

      {/* ── Scanlines ── */}
      <div className="absolute inset-0 scanlines pointer-events-none opacity-20 z-0" />

      {/* ── BATTLE SCENE (z-5, behind UI) ── */}
      <div
        className="absolute z-[5]"
        style={{
          left: viewport.x,
          top: viewport.y,
          width: viewport.w,
          height: viewport.h,
        }}
      >
        <BattleScene ref={battleSceneRef} roomId={roomId} onReady={onBattleSceneReady} onTurnUpdate={handleBattleTurnUpdate} />
      </div>

      {/* ── MASKING: Cover areas around the viewport hole ── */}
      <div className="absolute inset-0 pointer-events-none z-[6]">
        {/* Top */}
        <div className="absolute top-0 left-0 right-0 bg-[#020617]" style={{ height: viewport.y }} />
        {/* Bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-[#020617]" style={{ height: 1080 - (viewport.y + viewport.h) }} />
        {/* Left */}
        <div className="absolute left-0 bg-[#020617]" style={{ top: viewport.y, height: viewport.h, width: viewport.x }} />
        {/* Right */}
        <div className="absolute right-0 bg-[#020617]" style={{ top: viewport.y, height: viewport.h, width: 1920 - (viewport.x + viewport.w) }} />
        {/* Dot pattern over masks */}
        <div className="absolute top-0 left-0 right-0 bg-dots opacity-50" style={{ height: viewport.y }} />
        <div className="absolute bottom-0 left-0 right-0 bg-dots opacity-50" style={{ height: 1080 - (viewport.y + viewport.h) }} />
        <div className="absolute left-0 bg-dots opacity-50" style={{ top: viewport.y, height: viewport.h, width: viewport.x }} />
        <div className="absolute right-0 bg-dots opacity-50" style={{ top: viewport.y, height: viewport.h, width: 1920 - (viewport.x + viewport.w) }} />
        {/* Scanlines over masks */}
        <div className="absolute top-0 left-0 right-0 scanlines opacity-20" style={{ height: viewport.y }} />
        <div className="absolute bottom-0 left-0 right-0 scanlines opacity-20" style={{ height: 1080 - (viewport.y + viewport.h) }} />
        <div className="absolute left-0 scanlines opacity-20" style={{ top: viewport.y, height: viewport.h, width: viewport.x }} />
        <div className="absolute right-0 scanlines opacity-20" style={{ top: viewport.y, height: viewport.h, width: 1920 - (viewport.x + viewport.w) }} />
      </div>

      {/* ── Viewport hover zone (detects mouse for playback controls) ── */}
      <div
        className="absolute z-[9]"
        style={{
          left: viewport.x,
          top: viewport.y,
          width: viewport.w,
          height: viewport.h,
        }}
        onMouseEnter={() => setViewportHovered(true)}
        onMouseLeave={() => setViewportHovered(false)}
      />

      {/* ── Viewport hole border ── */}
      <div
        className="absolute pointer-events-none z-[7] border border-white/5 rounded-xl"
        style={{
          left: viewport.x,
          top: viewport.y,
          width: viewport.w,
          height: viewport.h,
        }}
      />

      {/* ── TOP HEADER: SCOREBOARD ── */}
      <div className="absolute top-0 left-0 w-full flex justify-center z-50">
        <Scoreboard
          leftTeam={leftTeam}
          rightTeam={rightTeam}
          leftAlive={leftAlive}
          rightAlive={rightAlive}
          turn={battle.turn}
          connected={battle.connected}
          battleEnded={!!battle.winner}
          isLive={reviewingTurn === null && !isPaused}
          battleStartTime={battle.battleStartTime}
          weekLabel={data.weekLabel}
          seasonName={data.seasonName}
          divisionName={data.divisionName}
          divisionColor={divisionColor}
          viewportWidth={viewport.w}
        />
      </div>

      {/* ── SIDEBAR LEFT: TEAM 1 ── */}
      <div className="absolute z-30 px-8 flex flex-col" style={{
        top: viewport.y,
        left: 0,
        width: viewport.x,
        height: viewport.h + (viewport.y - 80) - 8,
      }}>
        <TeamHeader
          team={leftTeam}
          avatar={leftAvatar}
          side="left"
          divisionColor={divisionColor}
        />
        <div className="flex-1 flex flex-col justify-between gap-1 min-h-0 pb-1">
          {leftDisplay.map((mon, i) => (
            <PokemonCard key={i} pokemon={mon} divisionColor={divisionColor} side="left" teamTeraUsed={leftDisplay.some((m) => m.terastallized)} isReviewing={reviewingTurn !== null || isPaused} />
          ))}
        </div>

        {leftRoster.unbrought.length > 0 && (
          <div className="mt-1 shrink-0">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.2em] mb-1 block">Bench</span>
            <div className="flex gap-2 flex-wrap">
              {[...leftRoster.unbrought].sort((a, b) => (a.displayName || a.name).length - (b.displayName || b.name).length).map((p, i) => (
                <div key={i} className="px-2 py-1 bg-slate-900/60 rounded border border-white/10 text-[11px] text-slate-200 font-bold uppercase tracking-normal shadow-sm backdrop-blur-sm">
                  {p.displayName || p.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── SIDEBAR RIGHT: TEAM 2 ── */}
      <div className="absolute z-30 px-8 flex flex-col" style={{
        top: viewport.y,
        right: 0,
        width: 1920 - (viewport.x + viewport.w),
        height: viewport.h + (viewport.y - 80) - 8,
      }}>
        <TeamHeader
          team={rightTeam}
          avatar={rightAvatar}
          side="right"
          divisionColor={divisionColor}
        />
        <div className="flex-1 flex flex-col justify-between gap-1 min-h-0 pb-1">
          {rightDisplay.map((mon, i) => (
            <PokemonCard key={i} pokemon={mon} divisionColor={divisionColor} side="right" teamTeraUsed={rightDisplay.some((m) => m.terastallized)} isReviewing={reviewingTurn !== null || isPaused} />
          ))}
        </div>

        {rightRoster.unbrought.length > 0 && (
          <div className="mt-1 shrink-0 flex flex-col items-end">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.2em] mb-1 block">Bench</span>
            <div className="flex gap-2 flex-wrap justify-end">
              {[...rightRoster.unbrought].sort((a, b) => (a.displayName || a.name).length - (b.displayName || b.name).length).map((p, i) => (
                <div key={i} className="px-2 py-1 bg-slate-900/60 rounded border border-white/10 text-[11px] text-slate-200 font-bold uppercase tracking-normal shadow-sm backdrop-blur-sm">
                  {p.displayName || p.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER: CHAT & CONTEXT ── */}
      <div className="absolute left-1/2 -translate-x-1/2 flex gap-6 z-20" style={{
        width: viewport.w,
        top: viewport.y + viewport.h + (viewport.y - 80),
        bottom: 12,
      }}>

        {/* Battle Log */}
        <BattleLogPanel
          battleSceneRef={battleSceneRef}
          divisionColor={divisionColor}
          p1Username={battle.p1Username}
          p2Username={battle.p2Username}
        />

        {/* Dynamic Context / Damage Calc toggle */}
        {showDamageCalc ? (
          <DamageCalcPanel
            leftMons={leftDisplay}
            rightMons={rightDisplay}
            leftTeamAbbr={leftTeam.teamAbbreviation || leftTeam.teamName.slice(0, 3).toUpperCase()}
            rightTeamAbbr={rightTeam.teamAbbreviation || rightTeam.teamName.slice(0, 3).toUpperCase()}
            weather={battle.weather}
            terrain={battle.terrain}
            p1Side={battle.p1Side}
            p2Side={battle.p2Side}
            p1IsTeam1={p1IsTeam1}
            divisionColor={divisionColor}
            onToggle={() => setShowDamageCalc(false)}
            atkIdx={calcAtkIdx} setAtkIdx={setCalcAtkIdx}
            defIdx={calcDefIdx} setDefIdx={setCalcDefIdx}
            moveIdx={calcMoveIdx} setMoveIdx={setCalcMoveIdx}
            customMove={calcCustomMove} setCustomMove={setCalcCustomMove}
            atkNature={calcAtkNature} setAtkNature={setCalcAtkNature}
            defNature={calcDefNature} setDefNature={setCalcDefNature}
            atkEvPreset={calcAtkEvPreset} setAtkEvPreset={setCalcAtkEvPreset}
            defEvPreset={calcDefEvPreset} setDefEvPreset={setCalcDefEvPreset}
            flipped={calcFlipped} setFlipped={setCalcFlipped}
          />
        ) : (
          <ContextPanel
            data={data}
            context={context}
            leftTeam={leftTeam}
            rightTeam={rightTeam}
            p1IsTeam1={p1IsTeam1}
            divisionColor={divisionColor}
            onToggle={() => setShowDamageCalc(true)}
          />
        )}
      </div>

      {/* ── BOTTOM LEFT: Caster Cam ── */}
      <div className="absolute z-20 flex flex-col" style={{
        left: 0,
        top: viewport.y + viewport.h + (viewport.y - 80),
        width: viewport.x,
        bottom: 12,
      }}>
        <div className="flex-1 mx-6 bg-slate-950/70 backdrop-blur-xl rounded-xl border overflow-hidden shadow-2xl flex flex-col" style={{ borderColor: `${divisionColor}44` }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
            <Video size={14} style={{ color: divisionColor }} />
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Caster Cam</span>
          </div>
          <div className="flex-1 flex items-center justify-center text-slate-600">
            <span className="text-xs font-bold uppercase tracking-wider">OBS Camera Source</span>
          </div>
        </div>
      </div>

      {/* ── BOTTOM RIGHT: Commentators Booth ── */}
      <div className="absolute z-20 flex flex-col" style={{
        right: 0,
        top: viewport.y + viewport.h + (viewport.y - 80),
        width: 1920 - (viewport.x + viewport.w),
        bottom: 12,
      }}>
        <div className="flex-1 mx-6 bg-slate-950/70 backdrop-blur-xl rounded-xl border overflow-hidden shadow-2xl flex flex-col" style={{ borderColor: `${divisionColor}44` }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
            <Mic size={14} style={{ color: divisionColor }} />
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Commentators</span>
          </div>
          <div className="flex-1 flex items-center justify-center text-slate-600">
            <span className="text-xs font-bold uppercase tracking-wider">Discord Voice Widget</span>
          </div>
        </div>
      </div>

      {/* ── PLAYBACK CONTROLS + hover zone over viewport (always visible, hover-gated) ── */}
      <PlaybackControls
        currentTurn={playbackDisplayTurn ?? reviewingTurn ?? battle.turn}
        maxTurn={effectiveMaxTurn}
        isLive={reviewingTurn === null && !isPaused}
        isPaused={isPaused}
        onFirst={() => handleSeek(1)}
        onPrev={() => handleSeek(Math.max(1, (reviewingTurn ?? battle.turn) - 1))}
        onTogglePause={handleTogglePause}
        onNext={() => handleSeek(Math.min(effectiveMaxTurn, (reviewingTurn ?? battle.turn) + 1))}
        onLive={handleGoLive}
        divisionColor={data.divisionColor}
        viewportHovered={viewportHovered}
        viewportY={viewport.y}
        viewportH={viewport.h}
      />

      {/* ── GLOBAL FRAME ── */}
      <div className="absolute inset-0 pointer-events-none border-[12px] border-slate-950/40 rounded-2xl z-[8]" />

        </div>
      </div>

      {/* Fullscreen button — outside the scaled container so it's always accessible */}
      {!hideUI && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-4 right-4 w-9 h-9 rounded-lg bg-black/50 flex items-center justify-center text-white/50 hover:text-white hover:bg-black/70 transition-all z-[10000]"
          title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
        >
          {isFullscreen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m7 5l5-5m0 0v4m0-4h-4m-7 7l-5 5m0 0v-4m0 4h4m7-5l5 5m0 0v-4m0 4h-4" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
            </svg>
          )}
        </button>
      )}

    </div>,
    document.body
  );
}

/* ═══════════════════════════════════════════════
   SCOREBOARD
   ═══════════════════════════════════════════════ */

function GameClock({ startTime }: { startTime: number | null }) {
  const [mins, setMins] = useState(0);

  useEffect(() => {
    if (!startTime) { setMins(0); return; }
    const tick = () => setMins(Math.floor((Date.now() - startTime) / 60000));
    tick();
    const interval = setInterval(tick, 10000);
    return () => clearInterval(interval);
  }, [startTime]);

  if (mins < 1) return <>JUST STARTED</>;
  return <>{mins} MIN{mins !== 1 ? "S" : ""} IN</>;
}

function Scoreboard({
  leftTeam, rightTeam, leftAlive, rightAlive, turn, connected, battleEnded, isLive, battleStartTime, weekLabel, seasonName, divisionName, divisionColor, viewportWidth,
}: {
  leftTeam: TeamData; rightTeam: TeamData;
  leftAlive: number; rightAlive: number;
  turn: number; connected: boolean; battleEnded: boolean; isLive: boolean; battleStartTime: number | null;
  weekLabel: string; seasonName: string; divisionName: string;
  divisionColor: string; viewportWidth: number;
}) {
  const t1abbr = leftTeam.teamAbbreviation || leftTeam.teamName.slice(0, 3).toUpperCase();
  const t2abbr = rightTeam.teamAbbreviation || rightTeam.teamName.slice(0, 3).toUpperCase();

  return (
    <div
      className="flex items-center justify-between h-20 px-8 bg-slate-950/90 backdrop-blur-xl rounded-b-2xl border-b-2 border-x-2 shadow-2xl relative overflow-hidden"
      style={{ width: Math.max(viewportWidth, 1000), borderColor: divisionColor }}
    >
      {/* Division color glow at top center */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-1 blur-[60px]" style={{ backgroundColor: divisionColor }} />

      {/* Left team */}
      <div className="flex items-center gap-4 flex-1">
        <span className="text-4xl font-black italic opacity-40 text-white">{t1abbr}</span>
        <div className="h-10 w-1 rounded-full" style={{ backgroundColor: divisionColor }} />
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 uppercase">ALIVE</span>
          <span className="text-3xl font-black text-white leading-none tracking-tighter" style={{ fontFamily: "'Press Start 2P', cursive" }}>
            {leftAlive}
          </span>
        </div>
      </div>

      {/* Center */}
      <div className="flex flex-col items-center gap-1 flex-1">
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase">
          {battleEnded ? (
            <span className="text-slate-400 flex items-center gap-1">
              <Radio size={10} /> ENDED
            </span>
          ) : connected && isLive ? (
            <span className="text-red-500 animate-pulse flex items-center gap-1">
              <Radio size={10} /> LIVE
            </span>
          ) : connected ? (
            <span className="text-amber-500 flex items-center gap-1">
              <Radio size={10} /> PLAYBACK
            </span>
          ) : (
            <span className="text-slate-500 flex items-center gap-1">
              <Radio size={10} /> OFFLINE
            </span>
          )}
          <span className="w-1 h-1 bg-slate-700 rounded-full" />
          <span>{weekLabel}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-px w-8 bg-slate-800" />
          <div className="text-xl font-black text-white uppercase italic tracking-widest px-4 border-x border-slate-800">
            {battleStartTime ? <GameClock startTime={battleStartTime} /> : weekLabel.toUpperCase()}
          </div>
          <div className="h-px w-8 bg-slate-800" />
        </div>
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
          {seasonName} &bull; {divisionName}
        </div>
      </div>

      {/* Right team */}
      <div className="flex items-center gap-4 flex-1 justify-end text-right">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 uppercase">ALIVE</span>
          <span className="text-3xl font-black text-white leading-none tracking-tighter" style={{ fontFamily: "'Press Start 2P', cursive" }}>
            {rightAlive}
          </span>
        </div>
        <div className="h-10 w-1 rounded-full" style={{ backgroundColor: divisionColor }} />
        <span className="text-4xl font-black italic opacity-40 text-white">{t2abbr}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TEAM HEADER (with spectral avatar)
   ═══════════════════════════════════════════════ */

function TeamHeader({
  team, avatar, side, divisionColor,
}: {
  team: TeamData; avatar: string | null; side: "left" | "right"; divisionColor: string;
}) {
  const isLeft = side === "left";
  const avatarUrl = avatar ? getTrainerSpriteUrl(avatar) : null;

  return (
    <div className={`relative flex flex-col justify-end ${isLeft ? "items-start" : "items-end"} mb-2 h-[120px]`}>

      {/* MASSIVE SPECTRAL AVATAR (Z-0) */}
      {avatarUrl && (
        <div
          className={`absolute top-[-140px] ${isLeft ? "left-[-40px]" : "right-[-40px]"} w-[320px] h-[320px] z-0 pointer-events-none`}
        >
          <img
            src={avatarUrl}
            className={`w-full h-full object-contain pixelated ${isLeft ? "scale-x-[-1]" : ""}`}
            style={{
              filter: `drop-shadow(0 0 20px ${divisionColor}44)`,
              maskImage: "linear-gradient(to bottom, black 0%, black 40%, rgba(0,0,0,0.3) 70%, transparent 95%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 40%, rgba(0,0,0,0.3) 70%, transparent 95%)",
            }}
            alt="trainer-spectral"
          />
        </div>
      )}

      {/* NEAT & TIDY UI CLUSTER (Z-10) */}
      <div className={`relative z-10 flex items-center gap-4 ${isLeft ? "flex-row" : "flex-row-reverse"}`}>
        <div className="relative">
          <div
            className="w-20 h-20 bg-slate-900/80 rounded-lg border-2 border-slate-800 flex items-center justify-center p-2 shadow-xl backdrop-blur-sm"
            style={{ borderColor: divisionColor }}
          >
            {team.teamLogoUrl ? (
              <img src={team.teamLogoUrl} className="w-full h-full object-contain" alt="logo" />
            ) : (
              <span className="text-2xl font-black text-slate-600 italic">
                {(team.teamAbbreviation || team.teamName.slice(0, 3)).toUpperCase()}
              </span>
            )}
          </div>
          <div className="absolute -bottom-2 right-0 left-0 flex justify-center">
            <span className="bg-slate-950 border border-slate-700 text-sm px-1.5 py-0 rounded font-bold text-slate-400 shadow-md">
              {team.eloRating}
            </span>
          </div>
        </div>
        <div className={isLeft ? "text-left" : "text-right"}>
          <h2 className="text-2xl font-black text-white leading-none tracking-tighter uppercase italic drop-shadow-lg">
            {team.teamName}
          </h2>
          <div className={`flex items-center gap-2 mt-1 ${isLeft ? "justify-start" : "justify-end"}`}>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{team.coachName}</span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span className="text-xs font-bold px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">
              {team.record.wins}-{team.record.losses}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   POKEMON CARD
   ═══════════════════════════════════════════════ */

const TERA_TYPE_COLORS: Record<string, string> = {
  normal: "#A8A878", fire: "#F08030", water: "#6890F0", electric: "#F8D030",
  grass: "#78C850", ice: "#98D8D8", fighting: "#C03028", poison: "#A040A0",
  ground: "#E0C068", flying: "#A890F0", psychic: "#F85888", bug: "#A8B820",
  rock: "#B8A038", ghost: "#705898", dragon: "#7038F8", dark: "#705848",
  steel: "#B8B8D0", fairy: "#EE99AC", stellar: "#44AABB",
};

const TYPE_COLORS: Record<string, string> = {
  normal: "#A8A878", fire: "#F08030", water: "#6890F0", electric: "#F8D030",
  grass: "#78C850", ice: "#98D8D8", fighting: "#C03028", poison: "#A040A0",
  ground: "#E0C068", flying: "#A890F0", psychic: "#F85888", bug: "#A8B820",
  rock: "#B8A038", ghost: "#705898", dragon: "#7038F8", dark: "#705848",
  steel: "#B8B8D0", fairy: "#EE99AC", stellar: "#44AABB",
};

const BOOST_NAMES: Record<string, string> = {
  atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe", accuracy: "Acc", evasion: "Eva",
};

/** Look up a species in Showdown's BattlePokedex (loaded at runtime). */
function getDexEntry(name: string): { abilities: Record<string, string>; baseStats: Record<string, number> } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dex = (window as any).BattlePokedex;
  if (!dex) return null;
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return dex[id] || null;
}

/** Look up a move in Showdown's BattleMovedex (loaded at runtime). */
function getMoveDex(name: string): { category: string; basePower: number; accuracy: number | true; type: string } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dex = (window as any).BattleMovedex;
  if (!dex) return null;
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return dex[id] || null;
}

const CATEGORY_COLORS: Record<string, string> = {
  Physical: "#C92112", Special: "#4F5870", Status: "#8C888C",
};

/** Calculate speed range at a given level. */
function speedRange(baseSpe: number, level: number): { min: number; max: number } {
  // Min: 0 IV, 0 EV, hindering nature (0.9)
  const min = Math.floor(Math.floor((2 * baseSpe * level) / 100 + 5) * 0.9);
  // Max: 31 IV, 252 EV, beneficial nature (1.1)
  const max = Math.floor(Math.floor((2 * baseSpe + 31 + 63) * level / 100 + 5) * 1.1);
  return { min, max };
}

function PokemonTooltip({ pokemon, side, divisionColor }: { pokemon: MergedMon; side: "left" | "right"; divisionColor: string }) {
  const { name, types, ability, item, itemConsumed, movesUsed, boosts, level, terastallized, teraType } = pokemon;
  const isLeft = side === "left";
  const activeBoosts = Object.entries(boosts).filter(([, v]) => v !== 0);

  const dex = getDexEntry(name);
  const possibleAbilities = dex?.abilities ? Object.values(dex.abilities) : [];
  const spe = dex?.baseStats?.spe;
  const speRange = spe != null ? speedRange(spe, level) : null;

  // Show tera type if terastallized, otherwise show base types
  const displayTypes = terastallized && teraType ? [teraType] : types;

  return (
    <div
      className={`absolute z-50 w-72 rounded-lg border shadow-2xl backdrop-blur-xl pointer-events-none`}
      style={{
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        borderColor: divisionColor,
        top: "50%",
        transform: "translateY(-50%)",
        ...(isLeft ? { left: "calc(100% + 8px)" } : { right: "calc(100% + 8px)" }),
      }}
    >
      <div className="p-3 space-y-2.5">
        {/* Types */}
        {displayTypes.length > 0 && (
          <div className="flex gap-1.5 items-center">
            {terastallized && <span className="text-[13px] font-bold text-slate-500 uppercase">Tera</span>}
            {displayTypes.map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded text-[13px] font-bold uppercase tracking-wider text-white/90"
                style={{ backgroundColor: TYPE_COLORS[t.toLowerCase()] || "#666" }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Ability */}
        <div>
          <span className="text-[13px] font-bold uppercase tracking-wider text-slate-500">
            {ability ? "Ability" : "Possible Abilities"}
          </span>
          {ability ? (
            <div className="text-[15px] font-semibold text-slate-200">{ability}</div>
          ) : possibleAbilities.length > 0 ? (
            <div className="text-[15px] text-slate-400 italic mt-0.5">
              {possibleAbilities.join(", ")}
            </div>
          ) : (
            <div className="text-[15px] text-slate-600 italic">Unknown</div>
          )}
        </div>

        {/* Item */}
        <div>
          <span className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Item</span>
          <div className={`text-[15px] font-semibold ${itemConsumed ? "text-slate-500 line-through" : item ? "text-slate-200" : "text-slate-600 italic"}`}>
            {item || (itemConsumed ? "Consumed" : "Unknown")}
          </div>
        </div>

        {/* Speed Range */}
        {speRange && (
          <div>
            <span className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Speed Range</span>
            <div className="text-[15px] font-semibold text-slate-300">
              {speRange.min} – {speRange.max}
              <span className="text-slate-500 ml-1 font-normal">(base {spe})</span>
            </div>
          </div>
        )}

        {/* Moves */}
        {movesUsed.length > 0 && (
          <div>
            <span className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Moves Revealed</span>
            <div className="mt-1 space-y-1">
              {movesUsed.map((m) => {
                const md = getMoveDex(m);
                return (
                  <div key={m} className="flex items-center gap-1.5">
                    <span className="text-[14px] font-medium text-slate-300 flex-1 min-w-0 truncate">{m}</span>
                    {md && md.category !== "Status" && (
                      <span className="text-[12px] font-bold text-slate-400 tabular-nums shrink-0">
                        {md.basePower > 0 ? md.basePower : "—"}<span className="text-slate-600">BP</span>
                        <span className="text-slate-600 mx-0.5">/</span>
                        {md.accuracy === true ? "—" : <>{md.accuracy}<span className="text-slate-600">%</span></>}
                      </span>
                    )}
                    {md && (
                      <span
                        className="px-1 py-px rounded text-[9px] font-black uppercase tracking-wide text-white shrink-0 w-[38px] text-center"
                        style={{ backgroundColor: TYPE_COLORS[md.type.toLowerCase()] || "#666" }}
                      >
                        {md.category === "Physical" ? "PHY" : md.category === "Special" ? "SPE" : "STA"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stat Boosts */}
        {activeBoosts.length > 0 && (
          <div>
            <span className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Stat Changes</span>
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {activeBoosts.map(([stat, val]) => (
                <span
                  key={stat}
                  className={`px-1.5 py-0.5 rounded text-[13px] font-bold ${val > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}
                >
                  {BOOST_NAMES[stat] || stat} {val > 0 ? `+${val}` : val}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PokemonCard({
  pokemon, divisionColor, side, teamTeraUsed, isReviewing,
}: {
  pokemon: MergedMon; divisionColor: string; side: "left" | "right"; teamTeraUsed: boolean; isReviewing: boolean;
}) {
  const { name, hp, fainted, kills, isCaptain, sprite, active, status, terastallized, teraType } = pokemon;
  const isLeft = side === "left";

  const [hovered, setHovered] = useState(false);

  // Delay the faint visual so the HP bar animates to 0 first (live only)
  const [showFainted, setShowFainted] = useState(fainted);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frozen, setFrozen] = useState(false);

  // Freeze the GIF sprite by capturing the current frame to a canvas
  const freezeSprite = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.complete || !img.naturalWidth) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      try {
        ctx.drawImage(img, 0, 0);
        setFrozen(true);
      } catch {
        // Image failed to load (all sprite fallbacks 404) — skip freezing
      }
    }
  }, []);

  useEffect(() => {
    if (isReviewing) {
      // During review/playback, show fainted state immediately — no delay
      setShowFainted(fainted);
      if (fainted) {
        freezeSprite();
      } else {
        setFrozen(false);
      }
      return;
    }
    if (fainted && !showFainted) {
      freezeSprite();
      // Wait for HP bar transition (500ms) + a small buffer
      const timer = setTimeout(() => setShowFainted(true), 700);
      return () => clearTimeout(timer);
    }
    if (!fainted) {
      setShowFainted(false);
      setFrozen(false);
    }
  }, [fainted, isReviewing, freezeSprite]); // eslint-disable-line react-hooks/exhaustive-deps

  const getHPColor = (p: number) => {
    if (p > 50) return "bg-emerald-500";
    if (p > 20) return "bg-yellow-500";
    return "bg-red-600";
  };

  const getStatusColor = (s: string) => {
    switch (s.toLowerCase()) {
      case "brn": return "bg-orange-500";
      case "par": return "bg-yellow-400";
      case "slp": return "bg-slate-400";
      case "psn": case "tox": return "bg-purple-500";
      case "frz": return "bg-cyan-300";
      default: return "bg-red-500";
    }
  };

  const faintStyle = showFainted ? "opacity-40 grayscale" : "";
  const faintGrayscale = showFainted ? "opacity-80 grayscale" : "";

  return (
    <div
      className={`relative flex items-center p-1.5 rounded-lg transition-all duration-500 border
        ${showFainted ? "bg-slate-950/40" : "bg-slate-900/40 backdrop-blur-md shadow-lg"}`}
      style={{
        borderColor: divisionColor,
        flexDirection: isLeft ? "row" : "row-reverse",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hover Tooltip */}
      {hovered && <PokemonTooltip pokemon={pokemon} side={side} divisionColor={divisionColor} />}

      {/* Sprite */}
      <div className={`relative w-16 h-16 flex-shrink-0 transition-all duration-500 ${faintStyle}`}>
        {sprite && (
          <>
            <img
              ref={imgRef}
              src={sprite}
              alt={name}
              className={`w-full h-full object-contain ${isLeft ? "scale-x-[-1]" : ""}`}
              style={{ imageRendering: "auto", display: frozen ? "none" : "block" }}
              onError={(e) => {
                const img = e.currentTarget;
                const src = img.src;
                if (!src.includes("/sprites/dex/") && !src.includes("/sprites/gen5ani/") && !src.includes("/sprites/gen5/")) {
                  // First fallback: static dex sprites
                  img.src = getDexSpriteUrl(name);
                  img.classList.remove("scale-x-[-1]");
                  img.style.transform = isLeft ? "scale(-1.3, 1.3)" : "scale(1.3)";
                } else if (src.includes("/sprites/dex/")) {
                  // Second fallback: gen5 animated sprites (same direction as regular ani)
                  img.src = getGen5SpriteUrl(name);
                  if (isLeft) img.classList.add("scale-x-[-1]");
                  img.style.transform = "";
                } else if (src.includes("/sprites/gen5ani/")) {
                  // Final fallback: gen5 static sprites (Iron Boulder, etc.)
                  img.src = getGen5StaticSpriteUrl(name);
                  img.classList.remove("scale-x-[-1]");
                  img.style.transform = isLeft ? "scale(-1.3, 1.3)" : "scale(1.3)";
                }
              }}
            />
            <canvas
              ref={canvasRef}
              className={`w-full h-full object-contain ${isLeft ? "scale-x-[-1]" : ""}`}
              style={{ imageRendering: "auto", display: frozen ? "block" : "none" }}
            />
          </>
        )}
        {/* Status badge — on sprite corner */}
        {status && !showFainted && (
          <div className={`absolute ${isLeft ? "-bottom-1 -right-1" : "-bottom-1 -left-1"} px-1.5 py-0.5 rounded-md text-[11px] font-black text-white border-2 border-slate-900 shadow-lg z-10 ${getStatusColor(status)}`}>
            {status.toUpperCase()}
          </div>
        )}
      </div>

      {/* Data */}
      <div className={`flex-grow px-2 ${isLeft ? "text-left" : "text-right"}`}>
        <div className={`flex items-center gap-1.5 mb-1 ${isLeft ? "justify-start" : "justify-end"}`}>
          {!isLeft && kills > 0 && (
            <div className={`relative z-20 flex items-center justify-center gap-1 bg-red-600 rounded px-2 py-1 border border-red-500/50 transition-all duration-500 ${faintGrayscale}`}>
              <Skull size={14} className="text-white" />
              <span className="text-[13px] font-black text-white leading-none">{kills}</span>
            </div>
          )}
          <h4 className={`text-sm font-bold truncate text-slate-100 uppercase tracking-tight leading-none transition-all duration-500 ${isLeft ? "text-left" : "text-right"} ${faintStyle}`}>{name}</h4>
          {isLeft && kills > 0 && (
            <div className={`relative z-20 flex items-center justify-center gap-1 bg-red-600 rounded px-2 py-1 border border-red-500/50 transition-all duration-500 ${faintGrayscale}`}>
              <Skull size={14} className="text-white" />
              <span className="text-[13px] font-black text-white leading-none">{kills}</span>
            </div>
          )}
        </div>

        {/* HP Bar */}
        <div className={`w-full transition-all duration-500 ${faintStyle}`}>
          <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400 mb-0.5">
            <span>HP</span>
            <span className={hp <= 20 && !showFainted ? "text-red-400" : ""}>{hp}%</span>
          </div>
          <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800 shadow-inner">
            <div
              className={`h-full transition-all duration-500 ease-out ${getHPColor(hp)}`}
              style={{ width: `${hp}%` }}
            />
          </div>
        </div>
      </div>

      {/* Fainted overlay */}
      {showFainted && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 opacity-40 grayscale">
          <div className="bg-slate-950/80 px-2 py-0.5 rounded border border-red-900/50 text-[10px] font-bold text-red-500 uppercase tracking-widest">
            Fainted
          </div>
        </div>
      )}

      {/* Tera badge — greyscale when fainted */}
      {isCaptain && !(teamTeraUsed && !terastallized) && (
        <div
          className={`absolute ${isLeft ? "-top-2 -right-2" : "-top-2 -left-2"} flex items-center justify-center gap-1 rounded-md px-1.5 py-1 border-2 border-slate-900 shadow-lg z-10 transition-all duration-300 ${faintStyle}`}
          style={{
            backgroundColor: terastallized && teraType
              ? TERA_TYPE_COLORS[teraType.toLowerCase()] || "#F8D030"
              : "#facc15",
          }}
        >
          <Diamond size={14} className="fill-current" style={{ color: "#0f172a" }} />
          {teraType && (
            <span className="text-[10px] font-black leading-none uppercase" style={{ color: "#0f172a" }}>{teraType}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Context Panel (static, all insights visible)
   ═══════════════════════════════════════════════ */

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ContextPanel({
  data, context, leftTeam, rightTeam, p1IsTeam1, divisionColor, onToggle,
}: {
  data: OverlayData;
  context?: MatchContext;
  leftTeam: TeamData;
  rightTeam: TeamData;
  p1IsTeam1: boolean;
  divisionColor: string;
  onToggle?: () => void;
}) {
  const leftCtx = context ? (p1IsTeam1 ? context.team1 : context.team2) : null;
  const rightCtx = context ? (p1IsTeam1 ? context.team2 : context.team1) : null;
  const h2hL = context ? (p1IsTeam1 ? context.h2h.coach1Wins : context.h2h.coach2Wins) : 0;
  const h2hR = context ? (p1IsTeam1 ? context.h2h.coach2Wins : context.h2h.coach1Wins) : 0;

  const lAbbr = leftTeam.teamAbbreviation || leftTeam.teamName.slice(0, 3).toUpperCase();
  const rAbbr = rightTeam.teamAbbreviation || rightTeam.teamName.slice(0, 3).toUpperCase();
  const lStand = leftCtx?.standings;
  const rStand = rightCtx?.standings;

  function playoffTag(s: NonNullable<typeof lStand>) {
    if (s.playoffStatus === "clinched")
      return <span className="px-2.5 py-1 rounded text-[13px] font-black uppercase tracking-wide bg-emerald-500/15 text-emerald-400/75 border border-emerald-500/20">Clinched Playoffs</span>;
    if (s.playoffStatus === "eliminated")
      return <span className="px-2.5 py-1 rounded text-[13px] font-black uppercase tracking-wide bg-yellow-500/15 text-yellow-400/75 border border-yellow-500/20">Can&apos;t Make Playoffs</span>;
    if (s.position > 8 && s.playoffStatus === "contending")
      return <span className="px-2.5 py-1 rounded text-[13px] font-black uppercase tracking-wide bg-yellow-500/15 text-yellow-400/75 border border-yellow-500/20">Not In Playoffs</span>;
    if (s.relegationStatus === "relegated")
      return <span className="px-2.5 py-1 rounded text-[13px] font-black uppercase tracking-wide bg-red-500/15 text-red-400/75 border border-red-500/20">Relegated</span>;
    if (s.relegationStatus === "danger")
      return <span className="px-2.5 py-1 rounded text-[13px] font-black uppercase tracking-wide bg-red-500/15 text-red-400/75 border border-red-500/20">Relegation Spot</span>;
    if (s.position <= 8)
      return <span className="px-2.5 py-1 rounded text-[13px] font-black uppercase tracking-wide bg-emerald-500/15 text-emerald-400/75 border border-emerald-500/20">Playoff Spot</span>;
    return null;
  }

  const hasH2H = h2hL + h2hR > 0;
  const hasKills = !!(leftCtx?.killLeader || rightCtx?.killLeader);

  return (
    <div
      className="flex-1 bg-slate-950/70 backdrop-blur-xl rounded-xl border flex flex-col relative overflow-hidden shadow-2xl"
      style={{ borderColor: `${divisionColor}44` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={14} style={{ color: divisionColor }} />
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Match Context</span>
        </div>
        <button
          onClick={onToggle}
          className="text-[10px] text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <Calculator size={11} />
          Damage Calc
        </button>
      </div>

      {/* Two-column team comparison */}
      <div className="flex-1 flex flex-col gap-1 min-h-0 px-4 pt-1 pb-4">

        {/* Standings comparison */}
        {(lStand || rStand) && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            {/* Left team */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-black text-white/85 leading-none italic" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: "14px" }}>
                  {lStand ? ordinal(lStand.position) : "—"}
                </span>
                <span className="text-[15px] font-bold text-slate-300 uppercase">{lAbbr}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-black text-white/85">{lStand ? `${lStand.wins}-${lStand.losses}` : ""}</span>
                {lStand && (
                  <span className="text-[15px] text-slate-500">
                    ({lStand.differential > 0 ? "+" : ""}{lStand.differential})
                  </span>
                )}
                {lStand && playoffTag(lStand)}
              </div>
              {leftCtx && leftCtx.form.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-600 uppercase">Last {leftCtx.form.length}</span>
                  {leftCtx.form.map((r, i) => (
                    <span
                      key={i}
                      className={`w-[26px] h-[22px] flex items-center justify-center rounded text-[13px] font-black leading-none ${
                        r === "W" ? "bg-emerald-500/20 text-emerald-400/80 border border-emerald-500/15" : "bg-red-500/20 text-red-400/80 border border-red-500/15"
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex flex-col items-center gap-1 self-stretch py-1">
              <div className="flex-1 w-px" style={{ backgroundColor: `${divisionColor}33` }} />
              <span className="text-[10px] font-bold text-slate-600 uppercase">vs</span>
              <div className="flex-1 w-px" style={{ backgroundColor: `${divisionColor}33` }} />
            </div>

            {/* Right team */}
            <div className="flex flex-col gap-1.5 items-end text-right">
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-bold text-slate-300 uppercase">{rAbbr}</span>
                <span className="font-black text-white/85 leading-none italic" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: "14px" }}>
                  {rStand ? ordinal(rStand.position) : "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {rStand && playoffTag(rStand)}
                {rStand && (
                  <span className="text-[15px] text-slate-500">
                    ({rStand.differential > 0 ? "+" : ""}{rStand.differential})
                  </span>
                )}
                <span className="text-[16px] font-black text-white/85">{rStand ? `${rStand.wins}-${rStand.losses}` : ""}</span>
              </div>
              {rightCtx && rightCtx.form.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {rightCtx.form.map((r, i) => (
                    <span
                      key={i}
                      className={`w-[26px] h-[22px] flex items-center justify-center rounded text-[13px] font-black leading-none ${
                        r === "W" ? "bg-emerald-500/20 text-emerald-400/80 border border-emerald-500/15" : "bg-red-500/20 text-red-400/80 border border-red-500/15"
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                  <span className="text-[11px] font-bold text-slate-600 uppercase">Last {rightCtx.form.length}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Separator */}
        {(lStand || rStand) && (
          <div className="h-px w-full" style={{ backgroundColor: `${divisionColor}22` }} />
        )}

        {/* Bottom stats row */}
        <div className="flex items-stretch gap-3">
          {/* H2H */}
          <div className="flex-1 flex flex-col bg-slate-900/40 rounded-lg px-4 py-2.5 border border-white/5">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Head to Head</div>
            {hasH2H ? (
              <>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-[18px] font-black text-white/85">{h2hL}</span>
                  <span className="text-[13px] text-slate-600">—</span>
                  <span className="text-[18px] font-black text-white/85">{h2hR}</span>
                </div>
                {(h2hL !== h2hR) && (
                  <div className="text-[13px] text-slate-400 text-center mt-0.5">
                    {h2hL > h2hR ? leftTeam.coachName : rightTeam.coachName} leads
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[13px] text-slate-500 text-center italic">Never played before</div>
            )}
          </div>

          {/* Kill leaders */}
          {hasKills && (
            <div className="flex-1 bg-slate-900/40 rounded-lg px-4 py-2.5 border border-white/5">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Top Killers</div>
              <div className="flex flex-col gap-0.5">
                {leftCtx?.killLeader && (
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-bold text-white/85 truncate">
                      {leftCtx.killLeader.name}
                    </span>
                    <div className="flex items-center shrink-0 ml-2">
                      <span className="text-[16px] font-black text-white/85 tabular-nums min-w-[2ch] text-right">{leftCtx.killLeader.kills}</span>
                      <span className="text-[16px] font-black text-white/85 ml-1">kills</span>
                      {leftCtx.killLeader.divisionRank && (
                        <span className="text-[13px] font-bold text-slate-400 ml-2">#</span>
                      )}
                      {leftCtx.killLeader.divisionRank && (
                        <span className="text-[13px] font-bold text-slate-400 tabular-nums inline-block min-w-[2ch] text-left">{leftCtx.killLeader.divisionRank}</span>
                      )}
                    </div>
                  </div>
                )}
                {rightCtx?.killLeader && (
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-bold text-white/85 truncate">
                      {rightCtx.killLeader.name}
                    </span>
                    <div className="flex items-center shrink-0 ml-2">
                      <span className="text-[16px] font-black text-white/85 tabular-nums min-w-[2ch] text-right">{rightCtx.killLeader.kills}</span>
                      <span className="text-[16px] font-black text-white/85 ml-1">kills</span>
                      {rightCtx.killLeader.divisionRank && (
                        <span className="text-[13px] font-bold text-slate-400 ml-2">#</span>
                      )}
                      {rightCtx.killLeader.divisionRank && (
                        <span className="text-[13px] font-bold text-slate-400 tabular-nums inline-block min-w-[2ch] text-left">{rightCtx.killLeader.divisionRank}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Division color accent */}
      <div className="absolute right-0 bottom-0 w-full h-[2px]" style={{ background: `linear-gradient(to right, transparent, ${divisionColor}66)` }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Damage Calculator Panel
   ═══════════════════════════════════════════════ */

function DamageCalcPanel({
  leftMons, rightMons, leftTeamAbbr, rightTeamAbbr,
  weather, terrain,
  p1Side, p2Side, p1IsTeam1,
  divisionColor, onToggle,
  atkIdx, setAtkIdx,
  defIdx, setDefIdx,
  moveIdx, setMoveIdx,
  customMove, setCustomMove,
  atkNature, setAtkNature,
  defNature, setDefNature,
  atkEvPreset, setAtkEvPreset,
  defEvPreset, setDefEvPreset,
  flipped, setFlipped,
}: {
  leftMons: MergedMon[];
  rightMons: MergedMon[];
  leftTeamAbbr: string;
  rightTeamAbbr: string;
  weather: string | null;
  terrain: string | null;
  p1Side: SideConditions;
  p2Side: SideConditions;
  p1IsTeam1: boolean;
  divisionColor: string;
  onToggle: () => void;
  atkIdx: number; setAtkIdx: (v: number) => void;
  defIdx: number; setDefIdx: (v: number) => void;
  moveIdx: number; setMoveIdx: (v: number) => void;
  customMove: string; setCustomMove: (v: string) => void;
  atkNature: string; setAtkNature: (v: string) => void;
  defNature: string; setDefNature: (v: string) => void;
  atkEvPreset: string; setAtkEvPreset: (v: string) => void;
  defEvPreset: string; setDefEvPreset: (v: string) => void;
  flipped: boolean; setFlipped: (v: boolean) => void;
}) {
  // atkIdx = left-side mon index, defIdx = right-side mon index (always)
  // flipped = false: left attacks right.  flipped = true: right attacks left.

  // Auto-follow the active pokemon: when the active mon changes, sync indices + reset move
  const prevLeftActive = useRef<string | null>(null);
  const prevRightActive = useRef<string | null>(null);
  const leftActiveIdx = leftMons.findIndex((m) => m.active);
  const rightActiveIdx = rightMons.findIndex((m) => m.active);
  const leftActiveName = leftActiveIdx >= 0 ? leftMons[leftActiveIdx].name : null;
  const rightActiveName = rightActiveIdx >= 0 ? rightMons[rightActiveIdx].name : null;

  useEffect(() => {
    if (leftActiveName && leftActiveName !== prevLeftActive.current) {
      prevLeftActive.current = leftActiveName;
      setAtkIdx(leftActiveIdx);
      // Reset move if left side is the attacker
      if (!flipped) { setMoveIdx(0); setCustomMove(""); }
    }
    if (rightActiveName && rightActiveName !== prevRightActive.current) {
      prevRightActive.current = rightActiveName;
      setDefIdx(rightActiveIdx);
      // Reset move if right side is the attacker
      if (flipped) { setMoveIdx(0); setCustomMove(""); }
    }
  }, [leftActiveName, rightActiveName, leftActiveIdx, rightActiveIdx, flipped, setAtkIdx, setDefIdx, setMoveIdx, setCustomMove]);

  const safeLeftIdx = atkIdx >= 0 && atkIdx < leftMons.length ? atkIdx : (leftActiveIdx >= 0 ? leftActiveIdx : 0);
  const safeRightIdx = defIdx >= 0 && defIdx < rightMons.length ? defIdx : (rightActiveIdx >= 0 ? rightActiveIdx : 0);

  const leftMon = leftMons[safeLeftIdx] || leftMons[0];
  const rightMon = rightMons[safeRightIdx] || rightMons[0];

  // Determine attacker/defender based on direction
  const attackerMon = flipped ? rightMon : leftMon;
  const defenderMon = flipped ? leftMon : rightMon;
  const attackerNature = atkNature;
  const defenderNature = defNature;
  const attackerEvs: EvSpread = EV_PRESETS[atkEvPreset] || DEFAULT_EVS;
  const defenderEvs: EvSpread = EV_PRESETS[defEvPreset] || DEFAULT_EVS;

  const moveOptions = attackerMon?.movesUsed || [];
  const selectedMove = customMove || moveOptions[moveIdx] || "";

  // Side conditions: p1Side is always left, p2Side is always right
  // (p1IsTeam1 only swaps team data, not battle sides)
  const getFieldState = (): CalcFieldState => {
    const attackerIsLeft = !flipped;
    return {
      weather,
      terrain,
      attackerSide: attackerIsLeft ? p1Side : p2Side,
      defenderSide: attackerIsLeft ? p2Side : p1Side,
    };
  };

  const toCalcMon = (m: MergedMon, nature: string, evs: EvSpread): CalcMon => ({
    name: m.name,
    level: m.level,
    ability: m.ability,
    item: m.item,
    itemConsumed: m.itemConsumed,
    status: m.status,
    hp: m.hp,
    maxHp: m.maxHp,
    boosts: m.boosts,
    terastallized: m.terastallized,
    teraType: m.teraType,
    nature,
    evs,
  });

  let result: DamageResult | null = null;
  if (attackerMon && defenderMon && selectedMove) {
    result = calcDamage(toCalcMon(attackerMon, attackerNature, attackerEvs), toCalcMon(defenderMon, defenderNature, defenderEvs), selectedMove, getFieldState());
  }

  // Active field conditions summary
  const fieldParts: string[] = [];
  if (weather) fieldParts.push(weather);
  if (terrain) fieldParts.push(terrain);
  const atkSideState = getFieldState().attackerSide;
  const defSideState = getFieldState().defenderSide;
  if (defSideState.reflect) fieldParts.push("Reflect");
  if (defSideState.lightScreen) fieldParts.push("Light Screen");
  if (defSideState.auroraVeil) fieldParts.push("Aurora Veil");
  if (atkSideState.tailwind) fieldParts.push("Tailwind (atk)");
  if (defSideState.tailwind) fieldParts.push("Tailwind (def)");

  const natures = ["Serious", "Adamant", "Bold", "Brave", "Calm", "Careful", "Gentle", "Hasty", "Impish", "Jolly", "Lax", "Lonely", "Mild", "Modest", "Naive", "Naughty", "Quiet", "Rash", "Relaxed", "Sassy", "Timid"];

  return (
    <div
      className="flex-1 bg-slate-950/70 backdrop-blur-xl rounded-xl border flex flex-col relative overflow-hidden shadow-2xl"
      style={{ borderColor: `${divisionColor}44` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <Calculator size={14} style={{ color: divisionColor }} />
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Damage Calc</span>
        </div>
        <button
          onClick={onToggle}
          className="text-[10px] text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <Zap size={11} />
          Context
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col gap-2 min-h-0 px-3 pt-2 pb-3">
        {/* Left mon → Move → Right mon row */}
        <div className="flex items-center gap-2">
          {/* Left mon selector */}
          <select
            value={safeLeftIdx}
            onChange={(e) => { setAtkIdx(Number(e.target.value)); setMoveIdx(0); setCustomMove(""); }}
            className="flex-1 bg-slate-900/80 border border-white/10 rounded px-2 py-1.5 text-[12px] font-bold text-white/90 truncate appearance-none cursor-pointer focus:outline-none focus:border-white/20"
          >
            {leftMons.map((m, i) => (
              <option key={i} value={i}>{m.name}{m.active ? " ★" : ""}</option>
            ))}
          </select>

          {/* Direction arrow */}
          <span className="text-slate-500 text-[11px] font-bold shrink-0">{flipped ? "←" : "→"}</span>

          {/* Move selector */}
          <select
            value={customMove ? "__custom__" : moveIdx}
            onChange={(e) => {
              if (e.target.value === "__custom__") return;
              setMoveIdx(Number(e.target.value));
              setCustomMove("");
            }}
            className="flex-1 bg-slate-900/80 border border-white/10 rounded px-2 py-1.5 text-[12px] font-bold text-white/90 truncate appearance-none cursor-pointer focus:outline-none focus:border-white/20"
          >
            {moveOptions.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
            {moveOptions.length === 0 && <option value={0}>No moves revealed</option>}
            {customMove && <option value="__custom__">{customMove}</option>}
          </select>

          {/* Direction arrow */}
          <span className="text-slate-500 text-[11px] font-bold shrink-0">{flipped ? "←" : "→"}</span>

          {/* Right mon selector */}
          <select
            value={safeRightIdx}
            onChange={(e) => setDefIdx(Number(e.target.value))}
            className="flex-1 bg-slate-900/80 border border-white/10 rounded px-2 py-1.5 text-[12px] font-bold text-white/90 truncate appearance-none cursor-pointer focus:outline-none focus:border-white/20"
          >
            {rightMons.map((m, i) => (
              <option key={i} value={i}>{m.name}{m.active ? " ★" : ""}</option>
            ))}
          </select>
        </div>

        {/* Info row: abilities, items, natures, EVs, custom move + swap button */}
        <div className="flex items-start gap-3 text-[10px] text-slate-400">
          {/* Left mon info */}
          <div className="flex-1 flex flex-col gap-0.5">
            {leftMon?.ability && <span>Ability: <span className="text-slate-300">{leftMon.ability}</span></span>}
            {leftMon?.item && <span>Item: <span className={leftMon.itemConsumed ? "text-slate-600 line-through" : "text-slate-300"}>{leftMon.item}</span></span>}
            <div className="flex items-center gap-1">
              <span className="shrink-0">Nature:</span>
              <select value={flipped ? defNature : atkNature} onChange={(e) => flipped ? setDefNature(e.target.value) : setAtkNature(e.target.value)}
                className="bg-transparent border-none text-slate-300 text-[10px] p-0 cursor-pointer focus:outline-none">
                {natures.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="shrink-0">EVs:</span>
              <select value={flipped ? defEvPreset : atkEvPreset} onChange={(e) => flipped ? setDefEvPreset(e.target.value) : setAtkEvPreset(e.target.value)}
                className="bg-transparent border-none text-slate-300 text-[10px] p-0 cursor-pointer focus:outline-none">
                {Object.keys(EV_PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
          {/* Center: custom move input + direction toggle */}
          <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
            <input
              type="text"
              placeholder="Custom move…"
              value={customMove}
              onChange={(e) => setCustomMove(e.target.value)}
              className="bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-[11px] text-white/80 w-[120px] placeholder:text-slate-600 focus:outline-none focus:border-white/20"
            />
            <button
              onClick={() => {
                setFlipped(!flipped);
                setMoveIdx(0);
                setCustomMove("");
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/60 border border-white/10 hover:bg-slate-700/60 hover:border-white/20 transition-colors cursor-pointer"
              title="Swap attack direction"
            >
              <ArrowLeftRight size={10} className="text-slate-400" />
              <span className="text-[9px] text-slate-400">Swap</span>
            </button>
          </div>
          {/* Right mon info */}
          <div className="flex-1 flex flex-col gap-0.5 items-end">
            {rightMon?.ability && <span>Ability: <span className="text-slate-300">{rightMon.ability}</span></span>}
            {rightMon?.item && <span>Item: <span className={rightMon.itemConsumed ? "text-slate-600 line-through" : "text-slate-300"}>{rightMon.item}</span></span>}
            <div className="flex items-center gap-1">
              <span className="shrink-0">Nature:</span>
              <select value={flipped ? atkNature : defNature} onChange={(e) => flipped ? setAtkNature(e.target.value) : setDefNature(e.target.value)}
                className="bg-transparent border-none text-slate-300 text-[10px] p-0 cursor-pointer focus:outline-none">
                {natures.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="shrink-0">EVs:</span>
              <select value={flipped ? atkEvPreset : defEvPreset} onChange={(e) => flipped ? setAtkEvPreset(e.target.value) : setDefEvPreset(e.target.value)}
                className="bg-transparent border-none text-slate-300 text-[10px] p-0 cursor-pointer focus:outline-none">
                {Object.keys(EV_PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="h-px w-full" style={{ backgroundColor: `${divisionColor}22` }} />

        {/* Result */}
        {result ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[16px] font-black text-white/90 tabular-nums">
                {result.minDmg}–{result.maxDmg}
              </span>
              <span className="text-[14px] text-slate-400 tabular-nums">
                ({result.minPercent.toFixed(1)}% – {result.maxPercent.toFixed(1)}%)
              </span>
            </div>
            {/* Damage bar */}
            <div className="h-[10px] w-full bg-slate-900/80 rounded-full overflow-hidden border border-white/5">
              <div className="h-full rounded-full relative overflow-hidden" style={{
                width: `${Math.min(100, result.maxPercent)}%`,
                background: result.koN <= 1
                  ? `linear-gradient(90deg, #ef4444, #dc2626)`
                  : result.koN <= 2
                    ? `linear-gradient(90deg, #f97316, #ea580c)`
                    : `linear-gradient(90deg, #eab308, #ca8a04)`,
              }}>
                {/* Min damage marker */}
                <div className="absolute top-0 bottom-0 w-px bg-black/30" style={{ left: `${(result.minPercent / Math.max(result.maxPercent, 1)) * 100}%` }} />
              </div>
            </div>
            <span className="text-[13px] font-bold" style={{
              color: result.koN <= 1 ? "#ef4444" : result.koN <= 2 ? "#f97316" : "#eab308",
            }}>
              {result.koChance}
            </span>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-600 text-[12px]">
            {selectedMove ? "Unable to calculate" : "Select a move to calculate damage"}
          </div>
        )}

        {/* Field conditions */}
        {fieldParts.length > 0 && (
          <div className="text-[10px] text-slate-500 mt-auto">
            Field: {fieldParts.join(" · ")}
          </div>
        )}
      </div>

      {/* Division color accent */}
      <div className="absolute right-0 bottom-0 w-full h-[2px]" style={{ background: `linear-gradient(to right, transparent, ${divisionColor}66)` }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Battle Log Panel (mirrors Showdown's BattleLog DOM)
   ═══════════════════════════════════════════════ */

function BattleLogPanel({
  battleSceneRef,
  divisionColor,
  p1Username,
  p2Username,
}: {
  battleSceneRef: React.RefObject<BattleSceneHandle | null>;
  divisionColor: string;
  p1Username: string | null;
  p2Username: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const lastHTMLRef = useRef("");
  const lastChatLenRef = useRef(0);

  const usernamesRef = useRef({ p1: p1Username, p2: p2Username });
  usernamesRef.current = { p1: p1Username, p2: p2Username };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function getInner(): HTMLElement | null {
      const logEl = battleSceneRef.current?.getLogElement();
      if (!logEl) return null;
      return logEl.querySelector(".inner.message-log") ?? logEl;
    }

    function isPlayer(user: string): boolean {
      const clean = user.replace(/^[★☆\s]+/, "");
      return clean === usernamesRef.current.p1 || clean === usernamesRef.current.p2
        || user === usernamesRef.current.p1 || user === usernamesRef.current.p2;
    }

    function escapeHtml(s: string): string {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function chatToHTML(entry: ChatLogEntry): string {
      const clean = entry.user.replace(/^[★☆\s]+/, "");
      const color = isPlayer(entry.user) ? divisionColor : "#ffffff";
      return `<div class="battle-log-chat" style="padding:1px 0"><strong style="color:${color}">${escapeHtml(clean)}:</strong> <span style="color:#cbd5e1">${escapeHtml(entry.message)}</span></div>`;
    }

    function sync() {
      const inner = getInner();
      if (!inner || !container) return;

      const chatLog = battleSceneRef.current?.getChatLog() ?? [];
      const children = inner.children;
      let startIdx = -1;

      for (let i = 0; i < children.length; i++) {
        if (children[i].classList.contains("battle-history") && children[i].textContent?.includes("Battle started")) {
          startIdx = i;
          break;
        }
      }

      // Group chats by turn for reliable placement at end of each turn
      const chatsByTurn = new Map<number, ChatLogEntry[]>();
      for (const c of chatLog) {
        let arr = chatsByTurn.get(c.turn);
        if (!arr) { arr = []; chatsByTurn.set(c.turn, arr); }
        arr.push(c);
      }
      // Sort within each turn by posInTurn for consistent ordering
      for (const arr of chatsByTurn.values()) {
        arr.sort((a, b) => a.posInTurn - b.posInTurn);
      }

      let html = "";
      let currentTurn = 0;

      if (startIdx >= 0) {
        // Battle has started — render log DOM with chats interleaved
        for (let i = startIdx; i < children.length; i++) {
          const el = children[i] as HTMLElement;
          if (el.classList.contains("spacer")) continue;
          if (el.tagName === "BUTTON") continue;

          // Detect turn headers — flush chats for the previous turn before it
          const turnHeaderMatch = el.tagName === "H2" && el.textContent?.match(/Turn\s+(\d+)/);
          if (turnHeaderMatch) {
            const chats = chatsByTurn.get(currentTurn);
            if (chats) {
              for (const c of chats) html += chatToHTML(c);
              chatsByTurn.delete(currentTurn);
            }
            currentTurn = parseInt(turnHeaderMatch[1], 10);
            html += el.outerHTML;
            continue;
          }

          html += el.outerHTML;
        }
      }

      // Flush chats for the last (or current during team preview) turn at the end
      const remaining = chatsByTurn.get(currentTurn);
      if (remaining) {
        for (const c of remaining) html += chatToHTML(c);
      }

      if (html === lastHTMLRef.current && chatLog.length === lastChatLenRef.current) return;
      lastHTMLRef.current = html;
      lastChatLenRef.current = chatLog.length;
      container.innerHTML = html;

      if (autoScrollRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    }

    sync();

    let observer: MutationObserver | null = null;
    function startObserver() {
      const logEl = battleSceneRef.current?.getLogElement();
      if (!logEl) return;
      observer = new MutationObserver(() => sync());
      observer.observe(logEl, { childList: true, subtree: true, characterData: true });
    }
    startObserver();

    const interval = setInterval(() => {
      if (!observer) startObserver();
      sync();
    }, 500);

    function onScroll() {
      if (!container) return;
      autoScrollRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
    }
    container.addEventListener("scroll", onScroll);

    return () => {
      observer?.disconnect();
      clearInterval(interval);
      container.removeEventListener("scroll", onScroll);
    };
  }, [battleSceneRef, divisionColor]);

  return (
    <div
      className="flex-1 bg-slate-950/70 backdrop-blur-xl rounded-xl border flex flex-col overflow-hidden shadow-2xl"
      style={{ borderColor: `${divisionColor}44`, ["--division-color" as string]: divisionColor }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 shrink-0">
        <ScrollText size={14} style={{ color: divisionColor }} />
        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Battle Log</span>
      </div>
      <div
        ref={containerRef}
        className="battle-log-container flex-1 overflow-y-auto overflow-x-hidden p-3"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Playback Controls
   ═══════════════════════════════════════════════ */

function PlaybackControls({
  currentTurn, maxTurn, isLive, isPaused,
  onFirst, onPrev, onTogglePause, onNext, onLive,
  divisionColor, viewportHovered, viewportY, viewportH,
}: {
  currentTurn: number;
  maxTurn: number;
  isLive: boolean;
  isPaused: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onTogglePause: () => void;
  onNext: () => void;
  onLive: () => void;
  divisionColor: string;
  viewportHovered: boolean;
  viewportY: number;
  viewportH: number;
}) {
  const [controlsHovered, setControlsHovered] = useState(false);
  const show = viewportHovered || controlsHovered || isPaused;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-50 transition-opacity duration-300"
      style={{
        top: viewportY + viewportH - 60,
        opacity: show ? 1 : 0,
        pointerEvents: show ? "auto" : "none",
      }}
      onMouseEnter={() => setControlsHovered(true)}
      onMouseLeave={() => setControlsHovered(false)}
    >
      <div
        className="flex items-center gap-1 px-3 py-1.5 bg-slate-950/80 backdrop-blur-xl rounded-xl border shadow-2xl"
        style={{ borderColor: `${divisionColor}44` }}
      >
        {/* First turn */}
        <button
          onClick={onFirst}
          disabled={currentTurn <= 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="First turn"
        >
          <SkipBack size={16} />
        </button>

        {/* Prev turn */}
        <button
          onClick={onPrev}
          disabled={currentTurn <= 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Previous turn"
        >
          <ChevronLeft size={18} />
        </button>

        {/* Play/Pause */}
        <button
          onClick={onTogglePause}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-white hover:bg-white/10 transition-all"
          title={isPaused ? "Play" : "Pause"}
        >
          {isPaused ? <Play size={20} className="ml-0.5" /> : <Pause size={20} />}
        </button>

        {/* Next turn */}
        <button
          onClick={onNext}
          disabled={currentTurn >= maxTurn}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Next turn"
        >
          <ChevronRight size={18} />
        </button>

        {/* Go Live */}
        <button
          onClick={onLive}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
            isLive ? "text-slate-600 cursor-default" : "text-slate-400 hover:text-white hover:bg-white/10"
          }`}
          disabled={isLive}
          title="Go live"
        >
          <SkipForward size={16} />
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-white/10 mx-1" />

        {/* Turn indicator */}
        <div className="flex items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-wider">
          {isLive && !isPaused ? (
            <span className="text-red-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="text-slate-400">
              Turn {currentTurn} / {maxTurn}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Viewport Editor
   ═══════════════════════════════════════════════ */

interface Viewport {
  x: number; y: number; w: number; h: number;
}

