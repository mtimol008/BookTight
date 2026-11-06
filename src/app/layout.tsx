import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Oswald } from "next/font/google";
import "./globals.css";

// Oswald for headings and labels, Inter for body and buttons, IBM Plex
// Mono for anything numeric — distances, times, figures. That last split
// is what makes the app read as a tool rather than a generic form.
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const SITE_URL = "https://booktight.co.uk";
const DESCRIPTION =
  "Booktight schedules your next job on the day that adds the least extra driving. Built for solo UK tradespeople.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Booktight — book jobs where they save you the most driving",
    template: "%s — Booktight",
  },
  description: DESCRIPTION,
  icons: {
    icon: "/favicon-96x96.png?v=2",
    apple: { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Booktight",
    title: "Booktight — book jobs where they save you the most driving",
    description: DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Booktight — book jobs where they save you the most driving",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${oswald.variable} ${inter.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
