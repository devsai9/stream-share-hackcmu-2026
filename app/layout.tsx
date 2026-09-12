import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// const geistSans = Geist({
//     variable: "--font-geist-sans",
//     subsets: ["latin"],
// });

const interSans = Inter({
    variable: "--font-inter-sans",
    subsets: ["latin"],
});

// const geistMono = Geist_Mono({
//     variable: "--font-geist-mono",
//     subsets: ["latin"],
// });

export const metadata: Metadata = {
    title: "WavSync: The Best Way to Collaborate on Music in Real-Time",
    description: "WavSync is a real-time collaborative music editor that allows multiple users to work on the same project simultaneously. Create, edit, and share your music with others in a seamless and interactive environment.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html lang="en" className={`${interSans.variable}`}>
            <body>{children}</body>
        </html>
    );
}
