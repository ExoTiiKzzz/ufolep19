import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";

import { SiteNav } from "@/components/site-nav";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "UFOLEP 19 — Volley",
  description: "Championnats de volley-ball de l'UFOLEP 19 : calendriers, résultats, classements.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="fr">
        <body className="antialiased">
          <Providers>
            <SiteNav />
            {children}
          </Providers>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
