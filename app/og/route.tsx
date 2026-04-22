import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "64px",
          background: "linear-gradient(135deg, #09090b 0%, #18181b 50%, #1d4ed8 100%)",
          color: "white",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 700 }}>YT Studio Analyzer</div>
        <div style={{ marginTop: 18, fontSize: 32, opacity: 0.9 }}>
          AI insights for channel growth and thumbnails
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
