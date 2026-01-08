// app/providers.jsx
"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/lib/theme/ThemeContext";

export function Providers({ children }) {
  return (
    <SessionProvider>
      <ThemeProvider defaultTheme="dark">
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
