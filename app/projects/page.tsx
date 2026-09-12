"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, FolderOpen } from "lucide-react";

import { getUser } from "../../lib/auth";
import { getProjects, type Project } from "../../lib/projects";

import styles from "./page.module.css";

function getDisplayName(email: string | undefined) {
    return email?.split("@")[0] || "there";
}

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [email, setEmail] = useState<string>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadProjects() {
            try {
                const [{ data: userData }, projectData] = await Promise.all([
                    getUser(),
                    getProjects(),
                ]);

                setEmail(userData.user?.email);
                setProjects(projectData);
            } catch (loadError) {
                setError(
                    loadError instanceof Error
                        ? loadError.message
                        : "We could not load your projects. Please try again.",
                );
            } finally {
                setLoading(false);
            }
        }

        void loadProjects();
    }, []);

    return (
        <main className={styles.page}>
            <div className={styles.content}>
                <header className={styles.header}>
                    <div>
                        <p className={styles.eyebrow}>Stream Share / Projects</p>
                        <h1>Welcome back, {getDisplayName(email)}.</h1>
                        <p className={styles.description}>
                            Pick a project and jump into the session.
                        </p>
                    </div>
                    <div className={styles.identity} aria-label={email || "Signed in user"}>
                        <span className={styles.identityDot} />
                        {getDisplayName(email)}
                    </div>
                </header>

                <section className={styles.projectsSection} aria-labelledby="projects-heading">
                    <div className={styles.sectionHeader}>
                        <h2 id="projects-heading">Your projects</h2>
                        {!loading && <span className={styles.count}>{projects.length} total</span>}
                    </div>

                    {loading && <p className={styles.status}>Loading projects...</p>}

                    {!loading && error && <p className={styles.error}>{error}</p>}

                    {!loading && !error && projects.length === 0 && (
                        <div className={styles.emptyState}>
                            <FolderOpen size={24} aria-hidden="true" />
                            <p>No projects yet.</p>
                            <span>Projects you join will appear here.</span>
                        </div>
                    )}

                    {!loading && !error && projects.length > 0 && (
                        <div className={styles.projectGrid}>
                            {projects.map((project) => (
                                <a className={styles.projectCard} href="/editor" key={project.id}>
                                    <div className={styles.cardIcon}>
                                        <FolderOpen size={22} aria-hidden="true" />
                                    </div>
                                    <div className={styles.cardContent}>
                                        <h3>{project.name}</h3>
                                        <p>{project.description || "No description yet."}</p>
                                    </div>
                                    <ArrowUpRight className={styles.cardArrow} size={20} aria-hidden="true" />
                                </a>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
