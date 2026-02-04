// app/layout.jsx
import "./globals.css";
import { Providers } from "./providers";
import MobileOnlyGuard from "@/components/guards/MobileOnlyGuard";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata = {
  title: "GDS Attendance Portal",
  description: "Global Digital Solutions Attendance & HR Portal",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {/* ✅ Mobile-only restriction guard */}
        <MobileOnlyGuard>
          {/* ✅ Now the whole app (including /login) is wrapped in SessionProvider */}
          <Providers>{children}</Providers>
        </MobileOnlyGuard>
        <SpeedInsights />
      </body>
    </html>
  );
}
