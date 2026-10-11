import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Présence QR",
  description: "Gestion de l'assiduité universitaire par QR code",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Polices système (pas de police téléchargée) : pages plus légères sur un
// réseau mobile faible.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
