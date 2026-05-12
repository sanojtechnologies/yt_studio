import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #1d4ed8 0%, #7c3aed 55%, #d946ef 100%)",
          color: "#ffffff",
          fontFamily: "Inter, sans-serif",
          fontWeight: 700,
          fontSize: 96,
          letterSpacing: -2,
        }}
      >
        YT
      </div>
    ),
    { ...size },
  );
}
