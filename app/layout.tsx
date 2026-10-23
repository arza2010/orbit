import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Aurora } from "@/components/motion/aurora";
import { PointerFx } from "@/components/motion/pointer-fx";
import { ShaderBg } from "@/components/motion/shader-bg";
import { SmoothScroll } from "@/components/motion/smooth-scroll";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Orbit",
  description: "A personal dashboard for Mesa students: classes, deadlines and life, in one place.",
  // Lets iPhone open it full-screen from the Home Screen, which web push on iOS requires.
  appleWebApp: { capable: true, title: "Orbit", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#05050a",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Marks the intro as already seen for this browser session, before the first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(sessionStorage.getItem('orbit-intro'))document.documentElement.classList.add('intro-seen');else sessionStorage.setItem('orbit-intro','1')}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full">
        <div className="intro" aria-hidden>
          <div className="intro-rings">
            <span />
            <span />
            <span />
          </div>
          <div className="intro-dot" />
          <div className="intro-word text-gradient">Orbit</div>
        </div>
        <ShaderBg />
        <Aurora />
        <PointerFx />
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
