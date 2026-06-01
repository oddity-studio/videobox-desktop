import type { Metadata } from "next";
import "./globals.css";
import { assetUrl } from "@/src/config";

export const metadata: Metadata = {
  title: "VIDEOBOX 2.0",
  description: "VIDEOBOX 2.0",
  icons: { icon: assetUrl("abicon.png") },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
