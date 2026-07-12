"use client";

import { useRef, useEffect, useState } from "react";
import { useShowdownBattle, type RosterPokemon, type PokemonBattleState } from "@/hooks/use-showdown-battle";
import type { BattleSceneHandle } from "./battle-scene";
import { normalizePokemonName } from "@/lib/battle-event-parser";
import { pokemonNamesMatchForClient } from "@/lib/pokemon-name-client";
import type { SerializedPokemonAliasMaps } from "@/lib/pokemon-name-aliases";
import { BattleScene } from "./battle-scene";
import Image from "next/image";
import { Swords, Mic } from "lucide-react";

/* ═══════════════════════════════════════════════
   Types & Exports
   ═══════════════════════════════════════════════ */

export interface TeamData {
  seasonCoachId: number;
  teamName: string;
  teamAbbreviation: string;
  teamLogoUrl: string | null;
  coachName: string;
  eloRating: number;
  record: { wins: number; losses: number };
  roster: RosterPokemon[];
}

export interface OverlayData {
  matchId: number;
  week: number;
  weekLabel: string;
  seasonName: string;
  seasonNumber: number;
  divisionName: string;
  divisionColor: string;
  pokemonNameAliases?: SerializedPokemonAliasMaps;
  team1: TeamData;
  team2: TeamData;
}

interface Props {
  data: OverlayData;
  battleUrl: string;
}

/* ═══════════════════════════════════════════════
   Layout Constants
   ═══════════════════════════════════════════════ */

const ROSTER_WIDTH = 390;
const AVATAR_SIZE = 120;
const HERO_WIDTH = ROSTER_WIDTH + 8 + AVATAR_SIZE; // Info card + gap + avatar
const PANEL_WIDTH = 580;

// Rendered battle viewport (640×360 native, scaled 1.875×)
const BATTLE_W = 1200;
const BATTLE_H = 675;
const VIEWPORT_X = (1920 - BATTLE_W) / 2; // 360
const VIEWPORT_Y = 120; // Below header

// Vertical rhythm — every gap is GAP px.
// Layout: 120px header | 684px middle | 276px footer
// Middle panel (684px):
//   8(top) + 120(hero) + 8(gap) + 156×3 + 8×2(row gaps) + 8(gap) + 56(bench) = 684
// Footer gap matches VS→viewport gap (~16px):
//   viewport bottom 795 → footer content top 812 = 17px
const GAP = 8;
const HERO_TOP_MARGIN = GAP;
const HERO_H = 120;
const CARD_H = 156;
const FOOTER_H = 276;

/* ═══════════════════════════════════════════════
   Status & Type Color Maps
   ═══════════════════════════════════════════════ */

const STATUS_COLORS: Record<string, string> = {
  brn: "#f97316",
  par: "#eab308",
  slp: "#94a3b8",
  frz: "#06b6d4",
  psn: "#a855f7",
  tox: "#7e22ce",
};

const STATUS_LABELS: Record<string, string> = {
  brn: "BRN", par: "PAR", slp: "SLP", frz: "FRZ", psn: "PSN", tox: "TOX",
};

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Normal:   { bg: "#A8A878", border: "#8A8A5C", text: "#fff" },
  Fire:     { bg: "#F08030", border: "#C6652A", text: "#fff" },
  Water:    { bg: "#6890F0", border: "#4A6FC4", text: "#fff" },
  Electric: { bg: "#F8D030", border: "#C6A820", text: "#000" },
  Grass:    { bg: "#78C850", border: "#5CA038", text: "#fff" },
  Ice:      { bg: "#98D8D8", border: "#6CB4B4", text: "#000" },
  Fighting: { bg: "#C03028", border: "#9C2820", text: "#fff" },
  Poison:   { bg: "#A040A0", border: "#803480", text: "#fff" },
  Ground:   { bg: "#E0C068", border: "#B49840", text: "#000" },
  Flying:   { bg: "#A890F0", border: "#7E6CC4", text: "#fff" },
  Psychic:  { bg: "#F85888", border: "#C44468", text: "#fff" },
  Bug:      { bg: "#A8B820", border: "#8C9818", text: "#fff" },
  Rock:     { bg: "#B8A038", border: "#948028", text: "#fff" },
  Ghost:    { bg: "#705898", border: "#584070", text: "#fff" },
  Dragon:   { bg: "#7038F8", border: "#5828C8", text: "#fff" },
  Dark:     { bg: "#705848", border: "#584038", text: "#fff" },
  Steel:    { bg: "#B8B8D0", border: "#9898B0", text: "#000" },
  Fairy:    { bg: "#EE99AC", border: "#C87890", text: "#000" },
  Stellar:  { bg: "#44C8A8", border: "#30A088", text: "#fff" },
};

/* ═══════════════════════════════════════════════
   Avatar Number Map
   ═══════════════════════════════════════════════ */

/** Showdown numeric avatar ID → trainer sprite filename */
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

/* ═══════════════════════════════════════════════
   Sprite Helpers
   ═══════════════════════════════════════════════ */

/** Sprite ID overrides for forms where toID() doesn't match the filename. */
const SPRITE_OVERRIDES: Record<string, string> = {
  "ogerponcornerstone": "ogerpon-cornerstone",
  "ogerponcornerstonetera": "ogerpon-cornerstonetera",
  "ogerponwellspring": "ogerpon-wellspring",
  "ogerponwellspringtera": "ogerpon-wellspringtera",
  "ogerponhearthflame": "ogerpon-hearthflame",
  "ogerponhearthflametera": "ogerpon-hearthflametera",
};

/** Convert a Showdown battle form name to a sprite URL. */
function getShowdownSpriteUrl(battleForm: string): string {
  const id = battleForm.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const spriteId = SPRITE_OVERRIDES[id] ?? id;
  return `https://play.pokemonshowdown.com/sprites/gen5/${spriteId}.png`;
}

function getTrainerSpriteUrl(avatar: string): string {
  if (avatar.startsWith("#")) {
    return `https://play.pokemonshowdown.com/sprites/trainers-custom/${avatar.slice(1)}.png`;
  }
  const mapped = AVATAR_NUMBERS[avatar];
  if (mapped) return `https://play.pokemonshowdown.com/sprites/trainers/${mapped}.png`;
  return `https://play.pokemonshowdown.com/sprites/trainers/${avatar}.png`;
}

function pokemonId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getRosterBattleState(
  poke: RosterPokemon,
  stateMap: Map<string, PokemonBattleState>,
  pokemonNameAliases?: SerializedPokemonAliasMaps | null
): PokemonBattleState | null {
  const rosterName = poke.displayName || poke.name;
  const normalizedRosterName = normalizePokemonName(rosterName);
  const direct = stateMap.get(normalizedRosterName);
  if (direct) return direct;

  const rosterId = pokemonId(rosterName);
  for (const state of stateMap.values()) {
    if (
      pokemonNamesMatchForClient(state.species, rosterName, pokemonNameAliases) ||
      pokemonNamesMatchForClient(state.battleForm, rosterName, pokemonNameAliases) ||
      pokemonId(state.species) === rosterId ||
      pokemonId(state.battleForm) === rosterId
    ) {
      return state;
    }
  }

  return null;
}

/* ═══════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════ */

export function OverlayClient({ data, battleUrl }: Props) {
  const battleSceneRef = useRef<BattleSceneHandle>(null);
  const battle = useShowdownBattle(
    battleUrl,
    data.team1.roster,
    data.team2.roster,
    battleSceneRef,
    data.pokemonNameAliases
  );

  // Extract room ID from battle URL
  const roomId = (battleUrl.match(/battle-[a-z0-9]+-\d+(?:-[a-z0-9]+)?/i) || battleUrl.match(/battle-[a-z0-9-]+/i))?.[0] || "";

  // Resolve p1/p2 → team1/team2 mapping by matching Pokemon against rosters
  const p1Species = [...battle.p1Pokemon.keys()];
  const p2Species = [...battle.p2Pokemon.keys()];

  let p1IsTeam1 = true;
  if (p1Species.length > 0 || p2Species.length > 0) {
    let p1MatchesT1 = 0;
    let p1MatchesT2 = 0;
    for (const species of p1Species) {
      if (data.team1.roster.some((r) => pokemonNamesMatchForClient(species, r.displayName || r.name, data.pokemonNameAliases))) p1MatchesT1++;
      if (data.team2.roster.some((r) => pokemonNamesMatchForClient(species, r.displayName || r.name, data.pokemonNameAliases))) p1MatchesT2++;
    }
    for (const species of p2Species) {
      if (data.team1.roster.some((r) => pokemonNamesMatchForClient(species, r.displayName || r.name, data.pokemonNameAliases))) p1MatchesT2++;
      if (data.team2.roster.some((r) => pokemonNamesMatchForClient(species, r.displayName || r.name, data.pokemonNameAliases))) p1MatchesT1++;
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
  const leftKills = battle.p1Kills;
  const rightKills = battle.p2Kills;
  const leftAvatar = battle.p1Avatar;
  const rightAvatar = battle.p2Avatar;
  const leftUsername = battle.p1Username;
  const rightUsername = battle.p2Username;

  // Split roster into brought (active grid) and unbrought (bench)
  const splitRoster = (team: TeamData, stateMap: Map<string, PokemonBattleState>) => {
    const active: RosterPokemon[] = [];
    const unbrought: RosterPokemon[] = [];
    team.roster.forEach((p) => {
      const state = getRosterBattleState(p, stateMap, data.pokemonNameAliases);
      if (state?.brought) active.push(p);
      else unbrought.push(p);
    });
    return { active, unbrought };
  };

  const leftRoster = splitRoster(leftTeam, leftPokemon);
  const rightRoster = splitRoster(rightTeam, rightPokemon);
  const color = data.divisionColor;


  return (
    <div className="w-[1920px] h-[1080px] bg-transparent text-slate-100 font-sans relative overflow-hidden selection:bg-transparent">

      {/* ── STYLES ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Press+Start+2P&display=swap');
        .font-pixel { font-family: 'Press Start 2P', cursive; }
        .font-sans { font-family: 'Chakra Petch', sans-serif; }

        .slide-poke-card {
          position: relative;
          background: #0f172a;
          border: 4px solid ${color};
          color: ${color};
          box-shadow: 6px 6px 0px rgba(0,0,0,0.5);
        }
        .slide-poke-card::before, .slide-poke-card::after {
          content: '';
          position: absolute;
          width: 8px;
          height: 8px;
          background: currentColor;
          z-index: 20;
        }
        .slide-poke-card::before { top: -4px; left: -4px; }
        .slide-poke-card::after { bottom: -4px; right: -4px; }

        .slide-poke-card.shadow-left {
          box-shadow: -6px 6px 0px rgba(0,0,0,0.5);
        }
        .slide-poke-card.shadow-left::before { top: -4px; left: auto; right: -4px; }
        .slide-poke-card.shadow-left::after { bottom: -4px; right: auto; left: -4px; }

        .slide-bg-dots {
          background-image: radial-gradient(#334155 1.5px, transparent 1.5px);
          background-size: 24px 24px;
        }
        .slide-scanlines {
          background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.1));
          background-size: 100% 4px;
        }

        .mask-battle-area {
          clip-path: polygon(
            0% 0%,
            0% 100%,
            100% 100%,
            100% 0%,
            0% 0%,
            ${VIEWPORT_X}px ${VIEWPORT_Y}px,
            ${VIEWPORT_X + BATTLE_W}px ${VIEWPORT_Y}px,
            ${VIEWPORT_X + BATTLE_W}px ${VIEWPORT_Y + BATTLE_H}px,
            ${VIEWPORT_X}px ${VIEWPORT_Y + BATTLE_H}px,
            ${VIEWPORT_X}px ${VIEWPORT_Y}px
          );
        }
      `}</style>

      {/* ── BACKGROUND LAYERS (masked around battle viewport) ── */}
      <div className="absolute inset-0 bg-[#020617] mask-battle-area pointer-events-none" />
      <div className="absolute inset-0 slide-bg-dots opacity-30 mask-battle-area pointer-events-none" />

      {/* Division color glows */}
      <div className="absolute top-0 left-0 w-[400px] h-full opacity-35 pointer-events-none mix-blend-screen"
           style={{ background: `linear-gradient(to right, ${color}, transparent)` }} />
      <div className="absolute top-0 right-0 w-[400px] h-full opacity-35 pointer-events-none mix-blend-screen"
           style={{ background: `linear-gradient(to left, ${color}, transparent)` }} />

      {/* ── BATTLE SCENE (behind UI) ── */}
      <div
        className="absolute z-[5]"
        style={{ left: VIEWPORT_X, top: VIEWPORT_Y, width: BATTLE_W, height: BATTLE_H }}
      >
        <BattleScene ref={battleSceneRef} roomId={roomId} onReady={battle.onBattleSceneReady} />
      </div>

      {/* ── UI LAYER ── */}
      <div className="absolute inset-0 flex flex-col z-10 pointer-events-none">

        {/* TOP: Scoreboard */}
        <div className="h-[120px] w-full flex justify-center items-start pt-6 pointer-events-auto z-50">
          <Scoreboard
            leftTeam={leftTeam}
            rightTeam={rightTeam}
            leftKills={leftKills}
            rightKills={rightKills}
            weekLabel={data.weekLabel}
            turn={battle.turn}
            color={color}
          />
        </div>

        {/* MIDDLE: Roster Panels */}
        <div className="flex-1 w-full relative z-30">

          {/* LEFT ROSTER PANEL */}
          <div
            className="absolute left-0 top-0 bottom-0 flex flex-col items-start pointer-events-auto pl-6"
            style={{ width: PANEL_WIDTH, paddingTop: HERO_TOP_MARGIN, gap: GAP }}
          >
            <div className="shrink-0 relative z-50" style={{ width: HERO_WIDTH, height: HERO_H }}>
              <TeamHero team={leftTeam} avatar={leftAvatar} username={leftUsername} color={color} align="left" />
            </div>
            <div className="shrink-0 z-40" style={{ width: ROSTER_WIDTH }}>
              <div className="grid grid-cols-2" style={{ gap: GAP }}>
                {leftRoster.active.map((poke) => (
                  <SlideStyleCard
                    key={poke.pokemonId}
                    poke={poke}
                    stateMap={leftPokemon}
                    teraUsed={battle.p1TeraUsed}
                    color={color}
                    flipSprite
                    shadowLeft
                    pokemonNameAliases={data.pokemonNameAliases}
                  />
                ))}
              </div>
            </div>
            {leftRoster.unbrought.length > 0 && (
              <div className="shrink-0 z-40" style={{ width: ROSTER_WIDTH }}>
                <BenchRow roster={leftRoster.unbrought} align="left" />
              </div>
            )}
          </div>

          {/* RIGHT ROSTER PANEL */}
          <div
            className="absolute right-0 top-0 bottom-0 flex flex-col items-end pointer-events-auto pr-6"
            style={{ width: PANEL_WIDTH, paddingTop: HERO_TOP_MARGIN, gap: GAP }}
          >
            <div className="shrink-0 relative z-50" style={{ width: HERO_WIDTH, height: HERO_H }}>
              <TeamHero team={rightTeam} avatar={rightAvatar} username={rightUsername} color={color} align="right" />
            </div>
            <div className="shrink-0 z-40" style={{ width: ROSTER_WIDTH }}>
              <div className="grid grid-cols-2" style={{ gap: GAP }}>
                {rightRoster.active.map((poke) => (
                  <SlideStyleCard
                    key={poke.pokemonId}
                    poke={poke}
                    stateMap={rightPokemon}
                    teraUsed={battle.p2TeraUsed}
                    color={color}
                    pokemonNameAliases={data.pokemonNameAliases}
                  />
                ))}
              </div>
            </div>
            {rightRoster.unbrought.length > 0 && (
              <div className="shrink-0 z-40 flex justify-end" style={{ width: ROSTER_WIDTH }}>
                <BenchRow roster={rightRoster.unbrought} align="right" />
              </div>
            )}
          </div>

        </div>

        {/* BOTTOM: Footer */}
        <div className="w-full pointer-events-auto px-6 pb-6 z-40" style={{ height: FOOTER_H, paddingTop: GAP }}>
          <OverlayFooter chat={battle.chat} color={color} players={[battle.p1Username, battle.p2Username]} />
        </div>

      </div>

      {/* ── SCANLINES (on top, masked) ── */}
      <div className="absolute inset-0 slide-scanlines opacity-20 mask-battle-area pointer-events-none z-50" />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Scoreboard
   ═══════════════════════════════════════════════ */

function Scoreboard({ leftTeam, rightTeam, leftKills, rightKills, weekLabel, turn, color }: {
  leftTeam: TeamData; rightTeam: TeamData;
  leftKills: number; rightKills: number;
  weekLabel: string; turn: number; color: string;
}) {
  return (
    <div className="slide-poke-card min-w-[960px] h-[80px] bg-[#0f172a] grid grid-cols-[1fr_auto_1fr] items-center px-8 relative">
      {/* Left team — right-aligned within its column */}
      <div className="flex items-center justify-end gap-5">
        <span className="font-pixel text-lg text-white uppercase tracking-wide whitespace-nowrap truncate">{leftTeam.teamName}</span>
        <span className="font-pixel text-4xl text-[#22c55e] drop-shadow-[2px_2px_0_black] shrink-0">{leftKills}</span>
      </div>

      {/* Center: VS + Info — always centered */}
      <div className="flex flex-col items-center justify-center -mt-2 mx-8 shrink-0">
        <div className="bg-[#020617] border-2 px-4 py-1 -skew-x-12 shadow-[4px_4px_0_black]" style={{ borderColor: color }}>
          <span className="font-pixel text-2xl text-[#facc15] skew-x-12 block drop-shadow-md">VS</span>
        </div>
        <span
          className="font-pixel text-xs px-4 py-0.5 -skew-x-12 block mt-1"
          style={{ color }}
        >
          <span className="skew-x-12 block">{weekLabel.toUpperCase()}</span>
        </span>
      </div>

      {/* Right team — left-aligned within its column */}
      <div className="flex items-center justify-start gap-5">
        <span className="font-pixel text-4xl text-[#ef4444] drop-shadow-[2px_2px_0_black] shrink-0">{rightKills}</span>
        <span className="font-pixel text-lg text-white uppercase tracking-wide whitespace-nowrap truncate">{rightTeam.teamName}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Team Hero (Coach Info + Avatar)
   ═══════════════════════════════════════════════ */

function TeamHero({ team, avatar, username, color, align }: {
  team: TeamData; avatar: string | null; username: string; color: string; align: "left" | "right";
}) {
  const isLeft = align === "left";
  const avatarUrl = avatar ? getTrainerSpriteUrl(avatar) : null;

  return (
    <div className={`w-full h-full flex ${isLeft ? "flex-row" : "flex-row-reverse"}`} style={{ gap: GAP }}>

      {/* Info Card — matches grid width, aligns flush below */}
      <div className={`slide-poke-card flex-1 h-full flex overflow-hidden ${isLeft ? "flex-row shadow-left" : "flex-row-reverse"}`}>
        {/* Team Logo — full height on the outer side */}
        {team.teamLogoUrl && (
          <div className="shrink-0 h-full aspect-square relative p-2">
            <Image src={team.teamLogoUrl} alt={team.teamName} fill className="object-contain drop-shadow-md p-2" />
          </div>
        )}
        {/* Text content */}
        <div className={`flex-1 min-w-0 flex flex-col justify-between py-3 ${isLeft ? "pr-4" : "pl-4 items-end text-right"}`}>
          <div className="font-sans text-2xl font-bold text-white uppercase leading-none tracking-wide truncate">
            {team.coachName}
          </div>
          <div className="inline-grid gap-1 w-fit">
            <div className={`flex items-center gap-3 bg-black/40 px-2 py-0.5 border border-slate-700 ${isLeft ? "" : "flex-row-reverse"}`}>
              <span className="font-pixel text-[9px] text-slate-400">REC</span>
              <span className="font-pixel text-sm text-[#facc15]">{team.record.wins}-{team.record.losses}</span>
            </div>
            <div className={`flex items-center gap-3 bg-black/40 px-2 py-0.5 border border-slate-700 ${isLeft ? "" : "flex-row-reverse"}`}>
              <span className="font-pixel text-[9px] text-slate-400">ELO</span>
              <span className="font-pixel text-sm text-white">{team.eloRating}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Avatar Card — extends toward the battle viewport */}
      <div className={`slide-poke-card shrink-0 h-full overflow-hidden relative bg-[#020617] ${isLeft ? "shadow-left" : ""}`} style={{ width: AVATAR_SIZE }}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} className={`w-full h-full object-cover object-top ${isLeft ? "-scale-x-100" : ""}`} alt="Coach" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-pixel text-xs text-slate-600">?</span>
          </div>
        )}
        <div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 shadow-md z-10"
          style={{ backgroundColor: color }}
        >
          <span className="font-pixel text-[8px] text-white whitespace-nowrap">COACH</span>
        </div>
      </div>

    </div>
  );
}

/* ═══════════════════════════════════════════════
   Slide-Style Pokemon Card
   ═══════════════════════════════════════════════ */

function SlideStyleCard({ poke, stateMap, teraUsed, color, flipSprite, shadowLeft, pokemonNameAliases }: {
  poke: RosterPokemon; stateMap: Map<string, PokemonBattleState>; teraUsed: boolean; color: string; flipSprite?: boolean; shadowLeft?: boolean; pokemonNameAliases?: SerializedPokemonAliasMaps;
}) {
  const state = getRosterBattleState(poke, stateMap, pokemonNameAliases);
  const hpPercent = state ? (state.maxHp > 0 ? Math.round((state.hp / state.maxHp) * 100) : 0) : 100;
  const hpColor = hpPercent > 50 ? "#22c55e" : hpPercent > 20 ? "#facc15" : "#ef4444";
  const isFainted = state?.fainted;
  const isActive = state?.active;

  // Sprite: prefer Showdown sprite (correct form) with roster fallback
  const showdownUrl = state?.battleForm ? getShowdownSpriteUrl(state.battleForm) : null;
  const fallbackUrl = poke.spriteUrl;
  const spriteUrl = showdownUrl || fallbackUrl;

  const statusColor = state?.status ? STATUS_COLORS[state.status] : null;

  return (
    <div
      className={`
        slide-poke-card w-full flex flex-col items-center justify-end pb-1.5
        ${shadowLeft ? "shadow-left" : ""}
        opacity-100
      `}
      style={{ height: CARD_H }}
    >

      {/* ── Top-left badge: Tera indicator ── */}
      {!isFainted && (state?.terastallized || (poke.isTeraCaptain && !teraUsed)) && (() => {
        const teraColor = state?.terastallized && state.teraType ? TYPE_COLORS[state.teraType] : null;
        return (
          <div className="absolute top-2 left-2 z-30">
            <div
              className="-skew-x-6 px-2.5 h-6 flex items-center shadow-lg"
              style={teraColor
                ? { backgroundColor: teraColor.bg, color: teraColor.text, border: `2px solid ${teraColor.border}` }
                : { backgroundColor: "#eab308", color: "#000", border: "2px solid #ca8a04" }
              }
            >
              <span className="skew-x-6 font-pixel text-[11px] font-bold leading-none">TERA</span>
            </div>
          </div>
        );
      })()}

      {/* ── Top-right badge: Kill counter ── */}
      {(state?.kills ?? 0) > 0 && (
        <div className="absolute top-2 right-2 z-30">
          <div className="-skew-x-6 px-2.5 h-6 bg-[#dc2626] border-2 border-[#991b1b] shadow-lg flex items-center gap-1.5">
            <Swords size={12} className="text-white skew-x-6" />
            <span className="skew-x-6 font-pixel text-[11px] text-white leading-none">{state!.kills}</span>
          </div>
        </div>
      )}

      {/* Sprite area */}
      <div className={`absolute inset-0 z-10 flex items-center justify-center pb-5 ${isFainted ? "grayscale" : ""}`}>
        {spriteUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spriteUrl}
            className={`w-[80%] h-[80%] object-contain drop-shadow-[0_2px_0_rgba(0,0,0,0.4)] scale-125 ${flipSprite ? "-scale-x-125" : ""} ${isFainted ? "opacity-40" : ""}`}
            alt={poke.name}
            onError={(e) => {
              if (fallbackUrl && e.currentTarget.src !== fallbackUrl) {
                e.currentTarget.src = fallbackUrl;
              }
            }}
          />
        ) : (
          <div className="w-10 h-10 bg-slate-800 rounded-full opacity-50" />
        )}
      </div>

      {/* KO overlay — outside grayscale so color shows */}
      {isFainted && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <span className="font-pixel text-3xl text-white leading-none drop-shadow-[2px_2px_0_black] -mt-3">KO</span>
        </div>
      )}

      {/* ── Status badge — bottom-right, above name bar ── */}
      {state?.status && !isFainted && (
        <div className="absolute bottom-8 right-2 z-30 flex shadow-lg">
          <div className="bg-[#020617] border border-slate-600 border-r-0 px-2.5 py-1 flex items-center">
            <span className="font-pixel text-[13px] leading-none uppercase" style={{ color: statusColor || "#64748b" }}>
              {STATUS_LABELS[state.status] || state.status.toUpperCase()}
            </span>
          </div>
          <div className="w-2 shrink-0" style={{ backgroundColor: statusColor || "#64748b" }} />
        </div>
      )}

      {/* Name + HP bar */}
      <div className="relative z-20 w-[94%] bg-[#020617] border border-slate-600 shadow-sm flex flex-col p-0.5">
        <div className="flex justify-between items-center mb-0.5 px-0.5">
          <span className="font-pixel text-[9px] text-slate-200 tracking-tight uppercase truncate">
            {state?.battleForm || poke.displayName || poke.name}
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 border border-slate-700 relative overflow-hidden">
          {!isFainted && (
            <div className="h-full transition-all duration-300" style={{ width: `${hpPercent}%`, background: hpColor }} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Bench Row
   ═══════════════════════════════════════════════ */

function BenchRow({ roster, align }: { roster: RosterPokemon[]; align: "left" | "right" }) {
  const isLeft = align === "left";
  return (
    <div className={`slide-poke-card px-2 py-1.5 flex items-center gap-2 w-fit ${isLeft ? "shadow-left" : "flex-row-reverse"}`}>
      <span className="font-pixel text-[10px] text-slate-500 uppercase">Bench</span>
      <div className="h-4 w-px bg-slate-700" />
      <div className="flex gap-1.5">
        {roster.map((p) => (
          <div
            key={p.pokemonId}
            className="w-9 h-9 bg-[#020617] border border-slate-700 flex items-center justify-center opacity-50 grayscale hover:opacity-100 hover:grayscale-0 transition-all"
            title={p.displayName || p.name}
          >
            {p.spriteUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.spriteUrl} className="w-8 h-8 object-contain" alt="" />
            ) : (
              <div className="w-4 h-4 bg-slate-600 rounded-full" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Footer (Caster Cam, Battle Log, Live Comms)
   ═══════════════════════════════════════════════ */

function OverlayFooter({ chat, color, players }: {
  chat: { user: string; message: string; timestamp: number }[];
  color: string;
  players: string[];
}) {
  return (
    <div className="w-full h-full flex gap-4">

      {/* Left: Caster Cam */}
      <div className="slide-poke-card w-[340px] h-full flex flex-col p-1.5">
        <div className="flex-1 bg-[#020617] border border-slate-700 relative flex items-center justify-center">
          <div className="text-center opacity-40">
            <span className="font-pixel text-[10px] text-slate-500 block mb-1">CASTER CAM</span>
            <span className="font-sans text-[8px] text-slate-600 uppercase">Place Webcams Here</span>
          </div>
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 border border-slate-800">
            <div className="w-1.5 h-1.5 bg-[#ef4444] rounded-full animate-pulse" />
            <span className="font-pixel text-[6px] text-white">LIVE</span>
          </div>
        </div>
      </div>

      {/* Middle: Battle Chat */}
      <div className="slide-poke-card flex-1 h-full flex flex-col p-3 bg-[#0f172a] relative overflow-hidden">
        <div
          className="absolute top-0 left-0 px-2 py-0.5 border-b border-r border-black z-10 shadow-sm"
          style={{ backgroundColor: color }}
        >
          <span className="font-pixel text-[7px] text-white">BATTLE CHAT</span>
        </div>
        <div className="mt-3 flex-1 overflow-hidden">
          <ChatList messages={chat} color={color} players={players} />
        </div>
      </div>

      {/* Right: Jumbotron */}
      <div className="slide-poke-card w-[400px] h-full flex flex-col p-3 bg-[#0f172a] relative overflow-hidden">
        <div
          className="absolute top-0 left-0 px-2 py-0.5 border-b border-r border-black z-10 shadow-sm"
          style={{ backgroundColor: color }}
        >
          <span className="font-pixel text-[7px] text-white">JUMBOTRON</span>
        </div>
        <div className="flex-1 bg-[#020617] border border-slate-700 mt-3 flex items-center justify-center">
          <span className="font-pixel text-[10px] text-slate-500 opacity-40">ALERTS &amp; HIGHLIGHTS</span>
        </div>
      </div>

      {/* Right: Live Comms */}
      <div className="slide-poke-card w-[340px] h-full flex flex-col p-1.5 bg-[#0f172a]">
        <div className="flex-1 bg-[#020617] border border-slate-700 relative flex items-center justify-center">
          <div className="text-center opacity-40">
            <Mic className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <span className="font-pixel text-[10px] text-slate-500 block mb-1">LIVE COMMS</span>
            <span className="font-sans text-[8px] text-slate-600 uppercase">Voice Overlay Here</span>
          </div>
        </div>
      </div>

    </div>
  );
}

/* ═══════════════════════════════════════════════
   Chat List
   ═══════════════════════════════════════════════ */

function ChatList({ messages, color, players }: {
  messages: { user: string; message: string; timestamp: number }[];
  color: string;
  players: string[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const playerSet = new Set(players.map(p => p.toLowerCase()));
  // Showdown prefixes chat usernames with rank chars (☆, +, etc.) — strip them for comparison & display
  const stripRank = (name: string) => name.replace(/^[^a-zA-Z0-9]+/, "");

  return (
    <div className="w-full h-full relative flex flex-col justify-end" ref={scrollRef}>
      <div className="space-y-2 overflow-y-auto font-sans">
        {messages.length === 0 ? (
          <div className="text-center text-slate-600 italic text-lg font-sans py-8">Waiting for battle chat...</div>
        ) : messages.map((msg, i) => {
          const cleanName = stripRank(msg.user);
          const isPlayer = playerSet.has(cleanName.toLowerCase());
          return (
            <div key={i} className="flex gap-2 border-b border-slate-800 pb-1">
              <span style={{ color: isPlayer ? color : "#64748b" }} className="font-bold shrink-0 text-lg">{cleanName}:</span>
              <span className="text-slate-300 text-lg">{msg.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
