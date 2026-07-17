import { ImageResponse } from "next/og";

import { site } from "@/lib/site";

/**
 * The shared Open Graph card template (spec 9.1).
 *
 * Deliberately plain: no custom font is loaded. ImageResponse cannot read our
 * `next/font` Geist instance (that is a CSS artefact, not a file it can embed),
 * so a branded typeface would mean shipping a .ttf and fetching it per render —
 * cost and a failure mode, in exchange for a nicer card. The system sans stack
 * satori falls back to is legible, and a card that always renders beats a
 * prettier one that occasionally 500s.
 *
 * Colours are literal hex rather than tokens on purpose: this is rendered by
 * satori, not by a browser, so there is no CSS cascade, no custom properties and
 * no `.dark` class here. These are the light-theme token values, copied. If the
 * brand palette changes, this is the one place outside globals.css to update —
 * which is the cost of an image that is not a web page.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export function ogImage({ title, eyebrow }: { title: string; eyebrow?: string }): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#ffffff",
        padding: "80px",
        fontFamily: "sans-serif",
      }}
    >
      {eyebrow ? (
        <div style={{ fontSize: 28, color: "#737373", letterSpacing: "0.05em" }}>
          {eyebrow.toUpperCase()}
        </div>
      ) : (
        <div />
      )}

      <div
        style={{
          display: "flex",
          fontSize: title.length > 60 ? 60 : 76,
          fontWeight: 600,
          color: "#171717",
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: "#171717",
          }}
        />
        <div style={{ fontSize: 30, color: "#171717", fontWeight: 500 }}>{site.name}</div>
      </div>
    </div>,
    OG_SIZE,
  );
}
