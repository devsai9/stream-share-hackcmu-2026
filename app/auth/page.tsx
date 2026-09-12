"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { login, signup } from "../../lib/auth";

import styles from "./page.module.css";

type Mode = "login" | "signup";

export default function AuthPage() {
    const router = useRouter();
    const [mode, setMode] = useState<Mode>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [confirmationSent, setConfirmationSent] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    function switchMode(next: Mode) {
        setMode(next);
        setError(null);
        setConfirmationSent(false);
    }

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setConfirmationSent(false);
        setSubmitting(true);

        try {
            if (mode === "login") {
                const { error: signInError } = await login(email, password);

                if (signInError) throw signInError;
                router.push("/projects");
                router.refresh();
            } else {
                const { data, error: signUpError } = await signup(email, password);

                if (signUpError) throw signUpError;

                if (data.session) {
                    router.push("/projects");
                    router.refresh();
                } else {
                    setConfirmationSent(true);
                }
            }
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : "Something went wrong. Please try again.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className={styles.page}>
            <section className={styles.panel}>
                <p className={styles.eyebrow}>Stream Share</p>
                <h1>{mode === "login" ? "Let's Groove :0" : "Sign up :-)"}</h1>
                <p className={styles.description}>
                    {mode === "login"
                        ? "Sign in to continue to your workspace."
                        : "Start sharing your workspace with your team."}
                </p>

                <div className={styles.tabs}>
                    <button
                        type="button"
                        className={mode === "login" ? styles.activeTab : styles.tab}
                        onClick={() => switchMode("login")}
                    >
                        Log in
                    </button>
                    <button
                        type="button"
                        className={mode === "signup" ? styles.activeTab : styles.tab}
                        onClick={() => switchMode("signup")}
                    >
                        Sign up
                    </button>
                </div>

                <form className={styles.form} onSubmit={handleSubmit}>
                    <label className={styles.label} htmlFor="email">Email</label>
                    <input
                        className={styles.input}
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />

                    <label className={styles.label} htmlFor="password">Password</label>
                    <input
                        className={styles.input}
                        id="password"
                        type="password"
                        placeholder="At least 6 characters"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    {error && <p className={styles.error}>{error}</p>}
                    {confirmationSent && (
                        <p className={styles.success}>
                            Check your email to confirm your account, then come back to log in.
                        </p>
                    )}

                    <button className={styles.submit} type="submit" disabled={submitting}>
                        {submitting ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
                    </button>
                </form>
            </section>
        </main>
    );
}
