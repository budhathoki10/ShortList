import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cvFontVariables } from "@/components/cv/cv-fonts";
import { ToastProvider } from "@/components/toast";
import { DEFAULT_DESCRIPTION, HOME_TITLE, publicRobots } from "@/lib/seo";
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
  title: { default: HOME_TITLE, template: "%s · Shortlist Job Radar" },
  description: DEFAULT_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      // Google shows a favicon only when its size is a multiple of 48px, so 48 and 96 are listed for its crawler.
      { url: "/icons/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/shortlist-icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Job Radar", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  category: "career",
  robots: publicRobots,
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE.name,
    url: "/",
    title: HOME_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  verification: {
    // Public by design (it is printed in every page's head). The env var overrides it if the Search Console property changes.
    google: process.env.GOOGLE_SITE_VERIFICATION || "CtrvgZZwPQbVRFyGRCR3jXI3-nF9PkOl0Mot3YM4aEg",
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
