import type { Metadata } from "next";
import AuthPage from "./auth-page";

export const metadata: Metadata = {
    title: "WavSync / Sign In",
    description: "Sign in or create an account for WavSync.",
};

export default function Page() {
    return <AuthPage />;
}