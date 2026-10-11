import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Groundwork | Knowledge Assistant",
    template: "%s | Groundwork",
  },
  description:
    "A private document knowledge assistant with local AI, verifiable sources and saved conversations.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
