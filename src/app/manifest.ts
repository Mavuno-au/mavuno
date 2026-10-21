import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mavuno",
    short_name: "Mavuno",
    description: "The social network for African Australians.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    // Matches the page so the installed app doesn't flash green on launch.
    theme_color: "#f6f4ef",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Notifications", url: "/notifications" },
      { name: "Messages", url: "/messages" },
      { name: "Events", url: "/events" },
    ],
  };
}
