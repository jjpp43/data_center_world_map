import { ImageResponse } from "next/og";

// Static build-time OG image, inherited by every route that doesn't define its
// own. `twitter.card` was already `summary_large_image` with no image to show,
// so every share and every `max-image-preview: large` SERP slot rendered blank.
// Emitted once at build as a CDN asset — no function invocation, no ISR entry.
// ponytail: system sans, not Geist — brand font would mean bundling a .ttf
// read; swap in a loaded font here if the card needs to match site type.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "datacenters.world — every data center on the map";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#09090b",
          padding: 72,
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa", letterSpacing: 2 }}>
          DATACENTERS.WORLD
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 78,
              lineHeight: 1.05,
              fontWeight: 700,
            }}
          >
            <div>Every data center</div>
            <div>on the map</div>
          </div>
          <div style={{ fontSize: 34, color: "#a1a1aa" }}>
            Open, sourced, free to explore
          </div>
        </div>
        <div style={{ display: "flex", gap: 56, fontSize: 30 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ color: "#818cf8" }}>5,675</span>
            <span style={{ color: "#a1a1aa" }}>facilities</span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ color: "#818cf8" }}>148</span>
            <span style={{ color: "#a1a1aa" }}>countries</span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ color: "#818cf8" }}>1,309</span>
            <span style={{ color: "#a1a1aa" }}>IXPs</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
