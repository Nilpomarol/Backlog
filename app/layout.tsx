import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { AppShell } from "../components/app-shell";
import { ClientRouter } from "../components/client-router";
import { Providers } from "../components/providers";
import { ServiceWorker } from "../components/service-worker";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0d1226",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "Un espai compartit perquè amics i família ajudin a millorar les aplicacions que utilitzen.";

  return {
    metadataBase: new URL(origin),
    title: {
      default: "Backlog",
      template: "%s · Backlog",
    },
    description,
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon.png", type: "image/png", sizes: "64x64" },
      ],
      shortcut: "/favicon.ico",
      apple: "/icons/apple-touch-icon.png",
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Backlog",
    },
    openGraph: {
      title: "Backlog",
      description,
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "Backlog — Shape what’s next." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Backlog",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout() {
  return (
    <html lang="ca" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>
          <AppShell>
            <ClientRouter />
          </AppShell>
        </Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
