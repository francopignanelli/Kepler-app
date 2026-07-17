import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Montserrat, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

// tipografía de marca: geométrica y abierta, como el wordmark del logo
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kepler — Explorador de satélites en tiempo real",
  description:
    "Kepler trackea la ISS y la Tiangong en un globo 3D, descubre los satélites sobre tu cabeza (Starlink, GPS y más), predice pasadas visibles desde tu ubicación y cruza todo con el clima.",
  applicationName: "Kepler",
  keywords: [
    "ISS",
    "Tiangong",
    "Starlink",
    "satélites",
    "astronomía",
    "pasadas visibles",
    "rastreo satelital",
  ],
};

export const viewport: Viewport = {
  themeColor: "#060f26",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-space-950">{children}</body>
    </html>
  );
}
