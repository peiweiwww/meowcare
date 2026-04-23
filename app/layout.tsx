import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeowCare",
  description: "A RAG-powered cat care knowledge assistant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

