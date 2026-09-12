"use client";

import { useRouter } from "next/navigation";

import { createClient } from "../../lib/supabase/client";
import styles from "./page.module.css";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  return (
    <button className={styles.signOut} type="button" onClick={signOut}>
      Sign out
    </button>
  );
}
