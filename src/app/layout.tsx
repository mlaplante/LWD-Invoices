import type { Metadata } from "next";
import { Poppins, Roboto_Mono } from "next/font/google";
import { TRPCReactProvider } from "@/trpc/client";
import { Toaster } from "sonner";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// La Plante system: Poppins carries display (300), body (400), row titles
// (500), buttons (600) and stat numbers (700). No other typefaces.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// Roboto Mono carries eyebrows, meta lines, table headers, footer stats.
//
// 400 and 500 only. next/font emits an @font-face per declared weight and
// preloads the files, so a weight nothing asks for is a download nobody uses.
// Audited 2026-08-13: the mono rules in globals.css use 400 (.eyebrow, .meta)
// and 500 (.data-table th), and the `font-mono` elements pair with
// font-normal/font-medium/font-semibold — nothing requests 700. If you add a
// bold mono style, add the weight back here in the same change.
const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LaPlante Web Development Invoices",
  description: "Modern invoicing for freelancers and small teams",
  appleWebApp: {
    capable: true,
    title: "LWD Invoices",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html>
    // before hydration, which React would otherwise flag as a mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
      </head>
      <body
        className={`${poppins.variable} ${robotoMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TRPCReactProvider>{children}</TRPCReactProvider>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
