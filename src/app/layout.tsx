import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_LOCALE, messages } from "@/i18n";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: {
    default: messages.app.name,
    template: `%s · ${messages.app.name}`,
  },
  description: messages.app.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={DEFAULT_LOCALE}
      className={`${inter.variable} ${lora.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-svh">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
