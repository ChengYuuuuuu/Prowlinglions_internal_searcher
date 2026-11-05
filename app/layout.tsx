import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prowling Lions — Procurement Intelligence",
  description: "Private, source-traceable procurement knowledge base.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
