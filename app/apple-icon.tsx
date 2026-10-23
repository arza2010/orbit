import { ImageResponse } from "next/og";

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
          background: "linear-gradient(135deg, #8b6cff 0%, #ff5c9d 55%, #35e0ff 100%)",
        }}
      >
        <svg width="180" height="180" viewBox="0 0 512 512">
          <circle cx="256" cy="256" r="136" fill="none" stroke="#05050a" strokeWidth="64" />
          <circle cx="372" cy="140" r="52" fill="#ffffff" />
        </svg>
      </div>
    ),
    size,
  );
}
