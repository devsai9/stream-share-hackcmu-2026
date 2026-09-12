"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Ellipsis, LogOut, Music2, Plus, Share2, X } from "lucide-react";

import { getUidFromEmail, getUser, signOut } from "../../lib/auth";
import { createProject, getProjects, shareProject, type Project } from "../../lib/projects";

import styles from "./page.module.css";

function getDisplayName(email: string | undefined) {
    return email?.split("@")[0] || "there";
}

export default function ProjectsPage() {
    const router = useRouter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [email, setEmail] = useState<string>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [projectName, setProjectName] = useState("");
    const [projectDescription, setProjectDescription] = useState("");
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);
    const [shareProjectId, setShareProjectId] = useState<string | null>(null);
    const [shareEmail, setShareEmail] = useState("");
    const [sharing, setSharing] = useState(false);
    const [shareMessage, setShareMessage] = useState<string | null>(null);
    const [signingOut, setSigningOut] = useState(false);

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

    async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const name = projectName.trim();

        if (!name) {
            setCreateError("Add a name for your project.");
            return;
        }

        setCreating(true);
        setCreateError(null);

        try {
            const project = await createProject(name, projectDescription.trim());
            setProjects((currentProjects) => [project, ...currentProjects]);
            setProjectName("");
            setProjectDescription("");
            setShowCreateForm(false);
        } catch (createProjectError) {
            setCreateError(
                createProjectError instanceof Error
                    ? createProjectError.message
                    : "We could not create your project. Please try again.",
            );
        } finally {
            setCreating(false);
        }
    }

    async function handleShareProject(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!shareProjectId || !shareEmail.trim()) {
            setShareMessage("Enter an email address to share this project.");
            return;
        }

        setSharing(true);
        setShareMessage(null);

        try {
            const userId = await getUidFromEmail(shareEmail.trim());
            await shareProject(shareProjectId, userId);
            setShareEmail("");
            setShareMessage("Project shared.");
        } catch (shareError) {
            setShareMessage(
                shareError instanceof Error
                    ? shareError.message
                    : "We could not share this project. Please try again.",
            );
        } finally {
            setSharing(false);
        }
    }

    async function handleSignOut() {
        setSigningOut(true);

        try {
            const { error: signOutError } = await signOut();
            if (signOutError) throw signOutError;
            router.push("/auth");
        } catch (signOutError) {
            setError(
                signOutError instanceof Error
                    ? signOutError.message
                    : "We could not sign you out. Please try again.",
            );
            setSigningOut(false);
        }
    }

    return (
        <main className={styles.page}>
            <div className={styles.content}>
                <header className={styles.header}>
                    <div>
                        <p className={styles.eyebrow}>WavSync / Projects</p>
                        <h1>Welcome back, {getDisplayName(email)}.</h1>
                        <p className={styles.description}>
                            Pick a project and jump into the session.
                        </p>
                    </div>
                    <div className={styles.headerActions}>
                        <div className={styles.identity} aria-label={email || "Signed in user"}>
                            <span className={styles.identityDot} />
                            {getDisplayName(email)}
                        </div>
                        <button className={styles.signOut} type="button" onClick={() => void handleSignOut()} disabled={signingOut}>
                            <LogOut size={16} aria-hidden="true" />
                            {signingOut ? "Signing out..." : "Sign out"}
                        </button>
                    </div>
                </header>

                <section className={styles.projectsSection} aria-labelledby="projects-heading">
                    <div className={styles.sectionHeader}>
                        <h2 id="projects-heading">Your projects</h2>
                        <div className={styles.sectionActions}>
                            {!loading && <span className={styles.count}>{projects.length} total</span>}
                            <button
                                className={styles.createButton}
                                type="button"
                                onClick={() => {
                                    setCreateError(null);
                                    setShowCreateForm((isVisible) => !isVisible);
                                }}
                                aria-expanded={showCreateForm}
                            >
                                {showCreateForm ? <X size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
                                {showCreateForm ? "Close" : "New project"}
                            </button>
                        </div>
                    </div>

                    {showCreateForm && (
                        <form className={styles.createForm} onSubmit={handleCreateProject}>
                            <div className={styles.formFields}>
                                <label className={styles.formField}>
                                    <span>Project name</span>
                                    <input
                                        type="text"
                                        value={projectName}
                                        onChange={(event) => setProjectName(event.target.value)}
                                        placeholder="e.g. Late Night Session"
                                        autoFocus
                                        required
                                    />
                                </label>
                                <label className={styles.formField}>
                                    <span>Description <small>optional</small></span>
                                    <input
                                        type="text"
                                        value={projectDescription}
                                        onChange={(event) => setProjectDescription(event.target.value)}
                                        placeholder="What are you making?"
                                    />
                                </label>
                            </div>
                            <button className={styles.submitButton} type="submit" disabled={creating}>
                                {creating ? "Creating..." : "Create project"}
                            </button>
                            {createError && <p className={styles.formError}>{createError}</p>}
                        </form>
                    )}

                    {loading && <p className={styles.status}>Loading projects...</p>}

                    {!loading && error && <p className={styles.error}>{error}</p>}

                    {!loading && !error && projects.length === 0 && (
                        <div className={styles.emptyState}>
                            <Music2 size={24} aria-hidden="true" />
                            <p>No projects yet.</p>
                            <span>Projects you join will appear here.</span>
                        </div>
                    )}

                    {!loading && !error && projects.length > 0 && (
                        <div className={styles.projectGrid}>
                            {projects.map((project) => (
                                <article className={styles.projectCard} key={project.id}>
                                    <a className={styles.projectLink} href={`/editor?projectId=${encodeURIComponent(project.id)}`}>
                                        <div className={styles.cardIcon}>
                                            <Music2 size={22} aria-hidden="true" />
                                        </div>
                                        <div className={styles.cardContent}>
                                            <h3>{project.name}</h3>
                                            <p>{project.description || "No description yet."}</p>
                                        </div>
                                        <ArrowUpRight className={styles.cardArrow} size={20} aria-hidden="true" />
                                    </a>
                                    <button
                                        className={styles.menuButton}
                                        type="button"
                                        aria-label={`Options for ${project.name}`}
                                        aria-expanded={openMenuProjectId === project.id}
                                        onClick={() => {
                                            setOpenMenuProjectId((openId) => openId === project.id ? null : project.id);
                                            setShareMessage(null);
                                        }}
                                    >
                                        <Ellipsis size={20} aria-hidden="true" />
                                    </button>
                                    {openMenuProjectId === project.id && (
                                        <div className={styles.projectMenu}>
                                            <button
                                                className={styles.menuItem}
                                                type="button"
                                                onClick={() => {
                                                    setShareProjectId(project.id);
                                                    setOpenMenuProjectId(null);
                                                    setShareMessage(null);
                                                }}
                                            >
                                                <Share2 size={16} aria-hidden="true" />
                                                Share project
                                            </button>
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
            {shareProjectId && (
                <div className={styles.dialogBackdrop} onClick={() => setShareProjectId(null)}>
                    <form className={styles.shareDialog} onSubmit={handleShareProject} onClick={(event) => event.stopPropagation()}>
                        <div className={styles.dialogHeader}>
                            <div>
                                <p className={styles.eyebrow}>Project access</p>
                                <h2>Share this project</h2>
                            </div>
                            <button className={styles.closeButton} type="button" aria-label="Close share dialog" onClick={() => setShareProjectId(null)}>
                                <X size={18} aria-hidden="true" />
                            </button>
                        </div>
                        <label className={styles.formField}>
                            <span>Email address</span>
                            <input
                                type="email"
                                value={shareEmail}
                                onChange={(event) => setShareEmail(event.target.value)}
                                placeholder="teammate@example.com"
                                autoFocus
                                required
                            />
                        </label>
                        <button className={styles.submitButton} type="submit" disabled={sharing}>
                            {sharing ? "Sharing..." : "Share project"}
                        </button>
                        {shareMessage && <p className={styles.formError}>{shareMessage}</p>}
                    </form>
                </div>
            )}
        </main>
    );
}
