import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";
import SignOutButton from "./sign-out-button";
import styles from "./page.module.css";

export default async function EditorPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth");
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Stream Share</p>
            <h1>Your workspace</h1>
          </div>
          <SignOutButton />
        </div>
        <p className={styles.description}>
          You are signed in as {data.user.email}.
        </p>
        <div className={styles.emptyState}>
          <p>Editor coming soon.</p>
        </div>
      </section>
    </main>
  );
}
