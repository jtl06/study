import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Study Lab",
  description: "A focused workspace for algorithms, systems, and proofs.",
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
