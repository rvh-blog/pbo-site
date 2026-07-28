import { ImageResponse } from "next/og";

export const alt = "Pokémon Battle Organization Draft League";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          color: "white",
          backgroundColor: "#090b14",
          backgroundImage:
            "radial-gradient(circle at 85% 15%, #7c3aed 0, transparent 32%), radial-gradient(circle at 10% 90%, #dc143c 0, transparent 38%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
            fontSize: "28px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "5px solid white",
              borderRadius: "50%",
              background: "#dc143c",
              fontWeight: 900,
            }}
          >
            P
          </div>
          PBO Draft League
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ fontSize: "72px", fontWeight: 900, lineHeight: 1.05 }}>
            Pokémon Battle Organization
          </div>
          <div style={{ maxWidth: "940px", fontSize: "30px", color: "#cbd5e1" }}>
            Live standings, schedules, rosters, match tools, fantasy, and the
            complete PBO league archive.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: "24px", color: "#fbbf24" }}>
          pokemonbattle.org
        </div>
      </div>
    ),
    size
  );
}
