import type { MetadataRoute } from "next";

// Makes the site installable: "Add to Home Screen" on iPhone, "Install" on Mac and Android.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orbit",
    short_name: "Orbit",
    description: "A personal dashboard for Mesa students: classes, deadlines and life, in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#05050a",
    theme_color: "#05050a",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "maskable" },
    ],
  };
}
