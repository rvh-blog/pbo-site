// Stargazer S9 replay manifest transcribed from the supplied Discord/Google
// Sheet context. Week 101-103 are the playoff rounds. The week hints follow
// the canonical Stargazer S9 fixtures when a replay was posted late.
export const stargazerS9ReplayEntries = [
  // Week 1
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2403366059" },
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2403375106" },
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2403716914" },
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2406129644" },
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2406178858" },
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2406310819" },
  { week: 1, url: "https://replay.pokemonshowdown.com/gen9draft-2407520727" },

  // Week 2
  { week: 2, url: "https://replay.pokemonshowdown.com/gen9draft-2409130851" },
  { week: 2, url: "https://replay.pokemonshowdown.com/gen9draft-2409916619" },
  { week: 2, url: "https://replay.pokemonshowdown.com/gen9draft-2410352930" },
  { week: 2, url: "https://replay.pokemonshowdown.com/gen9draft-2410369129" },
  { week: 2, url: "https://replay.pokemonshowdown.com/gen9draft-2410495302" },

  // Week 3
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2411619551" },
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2412900931" },
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2414292676" },
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2414454703" },
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2414543965" },
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2414636774" },
  // Posted with the Week 4 source context, but the canonical fixture is W3.
  { week: 3, url: "https://replay.pokemonshowdown.com/gen9draft-2419187869" },

  // Week 4
  { week: 4, url: "https://replay.pokemonshowdown.com/gen9draft-2418880511" },
  { week: 4, url: "https://replay.pokemonshowdown.com/gen9draft-2418952311" },
  { week: 4, url: "https://replay.pokemonshowdown.com/gen9draft-2419163828" },
  { week: 4, url: "https://replay.pokemonshowdown.com/gen9draft-2419227477" },
  { week: 4, url: "https://replay.pokemonshowdown.com/gen9draft-2419273268" },
  { week: 4, url: "https://replay.pokemonshowdown.com/gen9draft-2419865470" },
  { week: 4, url: "https://replay.pokemonshowdown.com/gen9draft-2420210316" },

  // Week 5
  { week: 5, url: "https://replay.pokemonshowdown.com/gen9draft-2422395367" },
  { week: 5, url: "https://replay.pokemonshowdown.com/gen9draft-2422442163" },
  { week: 5, url: "https://replay.pokemonshowdown.com/gen9draft-2422916231" },
  { week: 5, url: "https://replay.pokemonshowdown.com/gen9draft-2423290557" },
  { week: 5, url: "https://replay.pokemonshowdown.com/gen9draft-2423506130" },
  { week: 5, url: "https://replay.pokemonshowdown.com/gen9draft-2423576201-miy1cmkn2gulrkn4if6d1oqxsevwdbvpw" },

  // Week 6
  { week: 6, url: "https://replay.pokemonshowdown.com/gen9draft-2426977899" },
  { week: 6, url: "https://replay.pokemonshowdown.com/gen9draft-2427320447" },
  { week: 6, url: "https://replay.pokemonshowdown.com/gen9draft-2427576636" },
  { week: 6, url: "https://replay.pokemonshowdown.com/gen9draft-2427842410" },
  { week: 6, url: "https://replay.pokemonshowdown.com/gen9draft-2428650338" },

  // Week 7
  { week: 7, url: "https://replay.pokemonshowdown.com/gen9draft-2431303368" },
  { week: 7, url: "https://replay.pokemonshowdown.com/gen9draft-2431687819" },
  { week: 7, url: "https://replay.pokemonshowdown.com/gen9draft-2432524054" },
  { week: 7, url: "https://replay.pokemonshowdown.com/gen9draft-2433023177" },
  { week: 7, url: "https://replay.pokemonshowdown.com/gen9draft-2433374750" },
  { week: 7, url: "https://replay.pokemonshowdown.com/gen9draft-2433389620-ddataouqlex4jtyvnrmd9chlxiglwf6pw" },

  // Week 8
  { week: 8, url: "https://replay.pokemonshowdown.com/gen9draft-2434443411" },
  { week: 8, url: "https://replay.pokemonshowdown.com/gen9draft-2436637899-yukt2x1uvrhja92cnqux5av57mfx2mnpw" },
  { week: 8, url: "https://replay.pokemonshowdown.com/gen9draft-2436643217" },

  // Playoff quarterfinals
  { week: 101, url: "https://replay.pokemonshowdown.com/gen9draft-2441074216" },
  { week: 101, url: "https://replay.pokemonshowdown.com/gen9draft-2441291166" },
  { week: 101, url: "https://replay.pokemonshowdown.com/gen9draft-2441542940-mh5sgmtes544tufb6qhyf3njqje1ldrpw" },

  // Playoff semifinals
  { week: 102, url: "https://replay.pokemonshowdown.com/gen9draft-2445677608" },
  { week: 102, url: "https://replay.pokemonshowdown.com/gen9draft-2445682982" },

  // Championship
  { week: 103, url: "https://replay.pokemonshowdown.com/gen9draft-2450446386" },
];

// These source annotations preserve known team-label changes and late-posted
// replay context without changing canonical seasonal team identity.
export const stargazerS9SourceReviewHints = new Map([
  [
    "https://replay.pokemonshowdown.com/gen9draft-2419187869",
    "Source was posted with the Week 4 context and captioned Metal vs Nevada; canonical Stargazer S9 fixture is the Week 3 Clefemboys vs Nevada County Caterpies match.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2418880511",
    "Source caption uses coach labels Metal vs Merry; canonical Stargazer S9 fixture is Clefemboys vs Luscious Lopunnies.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2428650338",
    "Source post references Long Island Tyranitars while the replay is the canonical Week 6 Going Forward vs Cailleur fixture; verify source context manually.",
  ],
  [
    "https://replay.pokemonshowdown.com/gen9draft-2419227477",
    "Source includes a Porygon Bot result and an unrelated follow-up conversation; verify the saved replay evidence against the canonical Week 4 fixture.",
  ],
]);

export const stargazerS9SourceAliasHints = new Map([
  ["whitestraven", "Source player alias whitestraven maps to Raven / Boston Banettes."],
  ["nattii", "Source player alias nattii maps to Lemon / Worcester Woopers."],
  ["train3rblack", "Source player alias Train3rBlack maps to TripleStarHunter / Tottenham Hoothoots."],
  ["hinatahiromi", "Source player alias Hinata Hiromi maps to Merry / Luscious Lopunnies."],
  ["heyitsgrey", "Source player alias heyitsgrey maps to Grey / Blackthorn Crashers."],
  ["meeto", "Source player alias Meeto maps to Metal / Clefemboys."],
  ["iammug", "Source player alias IamMug maps to Mug / Sunnyside Suicunes."],
  ["libraries", "Source player alias Libraries maps to Shhnico / Monument Frostoms."],
  ["rizzadelphia", "Source player alias RIZZADELPHIA maps to Dr.Rizz / Philadelphia Flygons."],
  ["cailleur", "Source player alias Cailleur maps to Cai / Toronto Staraptors."],
  ["nccaterpies", "Source player alias nccaterpies maps to neutered_wallaby / Nevada County Caterpies."],
  ["alak250", "Source player alias alak250 maps to Ben / Alabama Alakazams."],
  ["zongg", "Source player alias zongg maps to Orange / Frederick Klefkis."],
  ["goingforward", "Source player alias Going Forward maps to Orange / Frederick Klefkis."],
  ["gooddaysareback", "Source player alias gooddaysareback maps to Za / New York Malamars."],
]);

// No force-win annotations were supplied. The shared importer flags the one
// completed non-forfeit fixture without supplied replay evidence.
export const stargazerS9ManualReviewMatchHints = new Map();
