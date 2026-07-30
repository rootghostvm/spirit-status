import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";
import { BRAND_NAME, SITE_URL, STATUS_TITLE } from "@/lib/config";
import "./globals.css";

const display = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const body = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND_NAME} Status`,
    template: `%s · ${BRAND_NAME}`,
  },
  description: `Live system status and uptime monitoring for ${BRAND_NAME}.`,
  applicationName: `${BRAND_NAME} Status`,
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
  },
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": "/api/feed",
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: `${BRAND_NAME} Status`,
    title: `${BRAND_NAME} · ${STATUS_TITLE}`,
    description: `Live availability across ${BRAND_NAME} services.`,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND_NAME} · ${STATUS_TITLE}`,
    description: `Live availability across ${BRAND_NAME} services.`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
