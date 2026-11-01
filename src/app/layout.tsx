import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cvFontVariables } from "@/components/cv/cv-fonts";
import { ToastProvider } from "@/components/toast";
import { DEFAULT_DESCRIPTION, publicRobots } from "@/lib/seo";
import { SITE } from "@/lib/site";
import "./globals.css";

// The Content-Security-Policy in src/proxy.ts carries a fresh nonce per request, and Next can only stamp it
// onto the scripts of a page it renders per request. A prerendered page would have none, and the browser
// would block its scripts. So every page renders on demand.
export const dynamic = "force-dynamic";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,
  title: { default: "Shortlist Job Radar — Find jobs that fit your CV", template: "%s · Shortlist Job Radar" },
  description: DEFAULT_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  category: "career",
  robots: publicRobots,
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE.name,
    url: "/",
    title: "Shortlist Job Radar — Find jobs that fit your CV",
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Shortlist Job Radar — Find jobs that fit your CV",
    description: DEFAULT_DESCRIPTION,
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e10" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${cvFontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans text-sm leading-normal">
        <a
          href="#main"
          className="sr-only rounded bg-ink px-3 py-2 text-on-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
