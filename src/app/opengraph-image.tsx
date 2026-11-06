import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Built in code rather than as a static file — no image-editing step
// needed, and it can never drift out of sync with the brand colours in
// globals.css (re-typed here since this renders outside Next's normal CSS
// pipeline, in Satori's own layout engine).
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#faf9f6",
          backgroundImage:
            "linear-gradient(rgba(27,31,36,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(27,31,36,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          padding: "80px 90px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              backgroundColor: "#e8a93a",
              display: "flex",
            }}
          />
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#1b1f24",
            }}
          >
            Booktight
          </div>
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.2,
            color: "#1b1f24",
            maxWidth: 920,
          }}
        >
          Book the next job where it saves you the most driving.
        </div>
        <div style={{ marginTop: 32, fontSize: 26, color: "#6b7280" }}>
          Scheduling for solo UK tradespeople.
        </div>
      </div>
    ),
    { ...size }
  );
}
