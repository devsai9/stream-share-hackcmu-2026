"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Play, Pause, Square, Mic, Music2, Plus, Users, Trash2 } from "lucide-react";
import { getUser } from "../../lib/auth";
import { getTracks, createTrack, renameTrack, deleteTrack, getTrackNotes, replaceTrackNotes, type Track } from "../../lib/editor";
import { loadProject, type Project } from "../../lib/projects";
import { useAudioEngine } from "../../hooks/useAudioEngine";
import { useRealTimeSync } from "../../hooks/useRealTimeSync";
import type { NoteBlock, PeerPresence } from "../../types/music";

const PITCHES = ["C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4"];
const TOTAL_STEPS = 16;

interface DragState {
    noteId: string;
    stepOffset: number;
    rowOffset: number;
}

interface ResizeState {
    noteId: string;
    startStep: number;
    duration: number;
    pointerStartStep: number;
}

interface ClipDragState {
    trackId: string;
    pointerStartStep: number;
    clipStartStep: number;
}

interface TrackContextMenuState {
    trackId: string;
    x: number;
    y: number;
}

export default function EditorPage() {
    const searchParams = useSearchParams();
    const projectId = searchParams.get("projectId");
    const [project, setProject] = useState<Project | null>(null);
    const [tracks, setTracks] = useState<Track[]>([]);
    const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
    const [notes, setNotes] = useState<NoteBlock[]>([]);
    const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [creatingTrack, setCreatingTrack] = useState(false);
    const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
    const [renamingTrackId, setRenamingTrackId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [trackContextMenu, setTrackContextMenu] = useState<TrackContextMenuState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [resizeState, setResizeState] = useState<ResizeState | null>(null);
    const [clipDragState, setClipDragState] = useState<ClipDragState | null>(null);
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
    const [clipStartSteps, setClipStartSteps] = useState<Record<string, number>>({});
    const gridRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    const {
        isPlaying,
        bpm,
        currentStep,
        setBpm,
        playPreview,
        togglePlayback,
        stopPlayback,
        scheduleNotes,
    } = useAudioEngine();

    const presence = useMemo<PeerPresence | null>(() => {
        if (!user) return null;
        return {
            userId: user.id,
            userName: user.email ?? "Anonymous",
            color: "#f97316",
        };
    }, [user]);

    const { peers, isConnected, broadcastNotes } = useRealTimeSync({
        roomId: projectId ?? "",
        user: presence ?? { userId: "", userName: "", color: "" },
        onNotesUpdated: setNotes,
    });

    useEffect(() => {
        async function loadEditor() {
            if (!projectId) {
                setError("Choose a project before opening the editor.");
                setLoading(false);
                return;
            }

            try {
                const [{ data: userData }, loadedProject] = await Promise.all([
                    getUser(),
                    loadProject(projectId),
                ]);

                if (!userData.user) {
                    throw new Error("You must be signed in to open the editor.");
                }

                setUser({ id: userData.user.id, email: userData.user.email });
                setProject(loadedProject);

                let loadedTracks = await getTracks(projectId);
                if (loadedTracks.length === 0) {
                    loadedTracks = [await createTrack(projectId, "Track 1", 0)];
                }

                setTracks(loadedTracks);
                setActiveTrackId(loadedTracks[0].id);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Could not load the editor.");
            } finally {
                setLoading(false);
            }
        }

        void loadEditor();
    }, [projectId]);

    useEffect(() => {
        if (!activeTrackId) return;
        const trackId = activeTrackId;

        async function loadNotes() {
            try {
                setNotes(await getTrackNotes(trackId));
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Could not load notes.");
            }
        }

        void loadNotes();
    }, [activeTrackId]);

    useEffect(() => {
        scheduleNotes(notes);
    }, [notes, scheduleNotes]);

    const persistNotes = useCallback(async (nextNotes: NoteBlock[]) => {
        if (!activeTrackId || !user) return;

        await replaceTrackNotes(activeTrackId, nextNotes, user.id);
    }, [activeTrackId, user]);

    const updateNotes = useCallback(async (nextNotes: NoteBlock[]) => {
        setNotes(nextNotes);

        try {
            await persistNotes(nextNotes);
            await broadcastNotes(nextNotes);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Could not save notes.");
        }
    }, [broadcastNotes, persistNotes]);

    function addNote(pitch: string, startStep: number) {
        const note: NoteBlock = {
            id: crypto.randomUUID(),
            pitch,
            startStep,
            duration: 1,
            userId: user?.id,
        };

        void playPreview(note.pitch);
        void updateNotes([...notes, note]);
    }

    async function addTrack() {
        if (!projectId || creatingTrack) return;

        const trackName = window.prompt("Track name", `Track ${tracks.length + 1}`)?.trim();
        if (!trackName) return;

        setCreatingTrack(true);
        setError(null);

        try {
            const track = await createTrack(projectId, trackName, tracks.length);
            setTracks((currentTracks) => [...currentTracks, track]);
            setActiveTrackId(track.id);
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : "Could not create track.");
        } finally {
            setCreatingTrack(false);
        }
    }

    function beginTrackRename(track: Track) {
        setTrackContextMenu(null);
        setRenamingTrackId(track.id);
        setRenameValue(track.name);
    }

    async function saveTrackRename(track: Track) {
        const name = renameValue.trim();
        if (!name) {
            setRenameValue(track.name);
            setRenamingTrackId(null);
            return;
        }

        if (name === track.name) {
            setRenamingTrackId(null);
            return;
        }

        try {
            const renamedTrack = await renameTrack(track.id, name);
            setTracks((currentTracks) => currentTracks.map((currentTrack) =>
                currentTrack.id === renamedTrack.id ? renamedTrack : currentTrack,
            ));
            setRenamingTrackId(null);
        } catch (renameError) {
            setError(renameError instanceof Error ? renameError.message : "Could not rename track.");
        }
    }

    async function removeTrack(track: Track) {
        if (deletingTrackId) return;

        setTrackContextMenu(null);
        setDeletingTrackId(track.id);
        setError(null);

        try {
            await deleteTrack(track.id);
            setTracks((currentTracks) => {
                const remainingTracks = currentTracks.filter((currentTrack) => currentTrack.id !== track.id);
                if (activeTrackId === track.id) {
                    setActiveTrackId(remainingTracks[0]?.id ?? null);
                    if (remainingTracks.length === 0) setNotes([]);
                }
                return remainingTracks;
            });
            setClipStartSteps((current) => {
                const next = { ...current };
                delete next[track.id];
                return next;
            });
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Could not delete track.");
        } finally {
            setDeletingTrackId(null);
        }
    }

    const deleteNote = useCallback((noteId: string) => {
        setSelectedNoteId(null);
        void updateNotes(notes.filter((note) => note.id !== noteId));
    }, [notes, updateNotes]);

    function beginNoteResize(event: React.PointerEvent<HTMLButtonElement>, note: NoteBlock) {
        const grid = gridRef.current;
        if (!grid) return;

        event.preventDefault();
        event.stopPropagation();
        const rect = grid.getBoundingClientRect();
        const stepWidth = rect.width / TOTAL_STEPS;
        setSelectedNoteId(note.id);
        setResizeState({
            noteId: note.id,
            startStep: note.startStep,
            duration: note.duration,
            pointerStartStep: (event.clientX - rect.left) / stepWidth,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function beginNoteDrag(event: React.PointerEvent<HTMLDivElement>, note: NoteBlock) {
        const grid = gridRef.current;
        if (!grid) return;

        event.preventDefault();
        event.stopPropagation();
        const rect = grid.getBoundingClientRect();
        const stepWidth = rect.width / TOTAL_STEPS;
        const rowHeight = rect.height / PITCHES.length;
        const noteLeft = note.startStep * stepWidth;
        const noteTop = PITCHES.indexOf(note.pitch) * rowHeight;

        setDragState({
            noteId: note.id,
            stepOffset: (event.clientX - rect.left - noteLeft) / stepWidth,
            rowOffset: (event.clientY - rect.top - noteTop) / rowHeight,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    useEffect(() => {
        if (!dragState) return;
        const activeDrag = dragState;

        function moveNote(event: PointerEvent) {
            const grid = gridRef.current;
            if (!grid) return;

            const rect = grid.getBoundingClientRect();
            const stepWidth = rect.width / TOTAL_STEPS;
            const rowHeight = rect.height / PITCHES.length;
            const draggedNote = notes.find((note) => note.id === activeDrag.noteId);
            if (!draggedNote) return;

            const nextStartStep = Math.max(
                0,
                Math.min(
                    TOTAL_STEPS - draggedNote.duration,
                    Math.round((event.clientX - rect.left) / stepWidth - activeDrag.stepOffset),
                ),
            );
            const nextRow = Math.max(
                0,
                Math.min(
                    PITCHES.length - 1,
                    Math.round((event.clientY - rect.top) / rowHeight - activeDrag.rowOffset),
                ),
            );
            const nextNotes = notes.map((note) =>
                note.id === activeDrag.noteId
                    ? { ...note, startStep: nextStartStep, pitch: PITCHES[nextRow], isDragging: true }
                    : note,
            );

            setNotes(nextNotes);
            void broadcastNotes(nextNotes);
        }

        function finishNoteDrag() {
            const draggedNotes = notes.map((note) =>
                note.id === activeDrag.noteId ? { ...note, isDragging: false } : note,
            );
            setNotes(draggedNotes);
            void persistNotes(draggedNotes).catch((saveError) => {
                setError(saveError instanceof Error ? saveError.message : "Could not save notes.");
            });
            void broadcastNotes(draggedNotes);
            setDragState(null);
        }

        window.addEventListener("pointermove", moveNote);
        window.addEventListener("pointerup", finishNoteDrag, { once: true });

        return () => {
            window.removeEventListener("pointermove", moveNote);
            window.removeEventListener("pointerup", finishNoteDrag);
        };
    }, [broadcastNotes, dragState, notes, persistNotes]);

    useEffect(() => {
        if (!resizeState) return;
        const activeResize = resizeState;

        function resizeNote(event: PointerEvent) {
            const grid = gridRef.current;
            if (!grid) return;

            const rect = grid.getBoundingClientRect();
            const stepWidth = rect.width / TOTAL_STEPS;
            const currentStep = (event.clientX - rect.left) / stepWidth;
            const nextDuration = Math.max(
                1,
                Math.min(
                    TOTAL_STEPS - activeResize.startStep,
                    Math.round(activeResize.duration + currentStep - activeResize.pointerStartStep),
                ),
            );
            setNotes((currentNotes) => currentNotes.map((note) =>
                note.id === activeResize.noteId ? { ...note, duration: nextDuration, isDragging: true } : note,
            ));
        }

        function finishResize() {
            setNotes((currentNotes) => {
                const finishedNotes = currentNotes.map((note) =>
                    note.id === activeResize.noteId ? { ...note, isDragging: false } : note,
                );
                void persistNotes(finishedNotes).catch((saveError) => {
                    setError(saveError instanceof Error ? saveError.message : "Could not save note length.");
                });
                void broadcastNotes(finishedNotes);
                return finishedNotes;
            });
            setResizeState(null);
        }

        window.addEventListener("pointermove", resizeNote);
        window.addEventListener("pointerup", finishResize, { once: true });
        return () => {
            window.removeEventListener("pointermove", resizeNote);
            window.removeEventListener("pointerup", finishResize);
        };
    }, [broadcastNotes, persistNotes, resizeState]);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if ((event.key === "Backspace" || event.key === "Delete") && selectedNoteId) {
                event.preventDefault();
                deleteNote(selectedNoteId);
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [deleteNote, selectedNoteId]);

    function beginClipDrag(event: React.PointerEvent<HTMLDivElement>, track: Track) {
        const timeline = timelineRef.current;
        if (!timeline) return;

        event.preventDefault();
        event.stopPropagation();
        const rect = timeline.getBoundingClientRect();
        setActiveTrackId(track.id);
        setClipDragState({
            trackId: track.id,
            pointerStartStep: ((event.clientX - rect.left) / rect.width) * TOTAL_STEPS,
            clipStartStep: clipStartSteps[track.id] ?? 1,
        });
    }

    useEffect(() => {
        if (!clipDragState) return;
        const activeClipDrag = clipDragState;

        function moveClip(event: PointerEvent) {
            const timeline = timelineRef.current;
            if (!timeline) return;
            const rect = timeline.getBoundingClientRect();
            const pointerStep = ((event.clientX - rect.left) / rect.width) * TOTAL_STEPS;
            const nextStartStep = Math.max(0, Math.min(TOTAL_STEPS - 6, Math.round(
                activeClipDrag.clipStartStep + pointerStep - activeClipDrag.pointerStartStep,
            )));
            setClipStartSteps((current) => ({ ...current, [activeClipDrag.trackId]: nextStartStep }));
        }

        function finishClipDrag() {
            setClipDragState(null);
        }

        window.addEventListener("pointermove", moveClip);
        window.addEventListener("pointerup", finishClipDrag, { once: true });
        return () => {
            window.removeEventListener("pointermove", moveClip);
            window.removeEventListener("pointerup", finishClipDrag);
        };
    }, [clipDragState]);

    useEffect(() => {
        function closeTrackContextMenu() {
            setTrackContextMenu(null);
        }

        window.addEventListener("click", closeTrackContextMenu);
        window.addEventListener("scroll", closeTrackContextMenu, true);
        return () => {
            window.removeEventListener("click", closeTrackContextMenu);
            window.removeEventListener("scroll", closeTrackContextMenu, true);
        };
    }, []);

    if (loading) {
        return <main style={styles.statusPage}>Loading editor...</main>;
    }

    if (error && !project) {
        return <main style={styles.statusPage}>{error}</main>;
    }

    return (
        <div style={styles.pageContainer}>
            {/* 1. TOP CONTROL BAR */}
            <header style={styles.header}>
                {/* Transport Controls */}
                <div style={styles.flexCenterGap3}>
                    <button
                        onClick={() => void togglePlayback()}
                        style={styles.playButton}
                    >
                        {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: "2px" }} />}
                    </button>
                    <button style={styles.iconButton} onClick={stopPlayback}>
                        <Square size={16} />
                    </button>
                    <button style={{ ...styles.iconButton, color: "#ef4444" }}>
                        <Mic size={18} />
                    </button>

                    <div style={styles.divider} />

                    {/* BPM Input */}
                    <div style={styles.bpmContainer}>
                        <span style={{ color: "var(--accent)" }}>BPM</span>
                        <input
                            type="number"
                            value={bpm}
                            onChange={(e) => setBpm(Number(e.target.value))}
                            style={styles.bpmInput}
                        />
                    </div>
                </div>

                {/* Project Details */}
                <div style={{ fontSize: "14px", fontWeight: 600, letterSpacing: "0.025em" }}>
                    {project?.name ?? "Realtime Session"} <span style={{ color: "var(--accent)" }}>{isConnected ? "Online" : "Offline"}</span>
                </div>

                {/* Multiplayer Presence */}
                <div style={styles.flexCenterGap3}>
                    <div style={styles.presenceBadge}>
                        <Users size={14} style={{ color: "var(--accent)" }} />
                        <span>{peers.length + 1} Active</span>
                    </div>
                    <div style={{ display: "flex", marginInline: "-4px" }}>
                        <div style={{ ...styles.avatar, background: "var(--primary)" }}>You</div>
                        {peers.slice(0, 3).map((peer) => (
                            <div key={peer.userId} style={{ ...styles.avatar, background: peer.color, marginLeft: "-8px" }}>
                                {peer.userName.slice(0, 2).toUpperCase()}
                            </div>
                        ))}
                    </div>
                </div>
            </header>

            {/* MAIN WORKSPACE */}
            <div style={styles.workspace}>

                {/* 2. TRACKS TIMELINE VIEW */}
                <div style={styles.tracksSection}>
                    {tracks.map((track) => (
                        <div
                            key={track.id}
                            onClick={() => setActiveTrackId(track.id)}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                setTrackContextMenu({ trackId: track.id, x: event.clientX, y: event.clientY });
                            }}
                            style={{
                                ...styles.trackRow,
                                backgroundColor: activeTrackId === track.id ? "rgba(255, 255, 255, 0.03)" : "transparent"
                            }}
                        >
                            {/* Track Info Side Panel */}
                            <div
                                style={{
                                    ...styles.trackSidePanel,
                                    backgroundColor: activeTrackId === track.id ? "var(--secondary-accent)" : "transparent"
                                }}
                            >
                                <div style={styles.flexCenterGap2}>
                                    <Music2 size={14} style={{ color: "var(--accent)" }} />
                                    {renamingTrackId === track.id ? (
                                        <input
                                            autoFocus
                                            value={renameValue}
                                            onChange={(event) => setRenameValue(event.target.value)}
                                            onClick={(event) => event.stopPropagation()}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") void saveTrackRename(track);
                                                if (event.key === "Escape") setRenamingTrackId(null);
                                            }}
                                            onBlur={() => void saveTrackRename(track)}
                                            aria-label={`Rename ${track.name}`}
                                            style={styles.trackNameInput}
                                        />
                                    ) : (
                                        <span style={styles.trackName}>{track.name}</span>
                                    )}
                                    <button
                                        type="button"
                                        aria-label={`Delete ${track.name}`}
                                        title="Delete track"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            void removeTrack(track);
                                        }}
                                        disabled={deletingTrackId === track.id}
                                        style={styles.trackDeleteButton}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                                <div style={styles.trackControls}>
                                    <span>M</span> <span>S</span>
                                    <input type="range" style={styles.slider} />
                                </div>
                            </div>

                            {/* Timeline Track Lane */}
                            <div ref={track.id === tracks[0]?.id ? timelineRef : undefined} style={styles.timelineLane}>
                                <div
                                    onPointerDown={(event) => beginClipDrag(event, track)}
                                    style={{
                                        ...styles.midiClip,
                                        left: `${((clipStartSteps[track.id] ?? 1) / TOTAL_STEPS) * 100}%`,
                                        background: track.position % 2 === 0 ? "var(--secondary)" : "var(--primary)",
                                        outline: activeTrackId === track.id ? "2px solid #e9a82e" : "none",
                                    }}
                                >
                                    <span style={styles.clipTitle}>MIDI Clip</span>
                                    <span style={styles.clipPattern} aria-hidden="true">
                                        {[2, 4, 1, 5, 3, 6, 4, 2].map((height, index) => (
                                            <i key={index} style={{ ...styles.clipPatternBar, height: `${height * 3}px` }} />
                                        ))}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {trackContextMenu && (
                        <div
                            role="menu"
                            onClick={(event) => event.stopPropagation()}
                            style={{ ...styles.trackContextMenu, left: trackContextMenu.x, top: trackContextMenu.y }}
                        >
                            {(() => {
                                const track = tracks.find((item) => item.id === trackContextMenu.trackId);
                                if (!track) return null;
                                return (
                                    <>
                                        <button type="button" role="menuitem" onClick={() => beginTrackRename(track)} style={styles.contextMenuItem}>
                                            Rename track
                                        </button>
                                        <button type="button" role="menuitem" onClick={() => void removeTrack(track)} style={{ ...styles.contextMenuItem, color: "#f87171" }}>
                                            Delete track
                                        </button>
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    <button style={styles.addTrackButton} onClick={() => void addTrack()} disabled={creatingTrack}>
                        <Plus size={14} /> {creatingTrack ? "Adding..." : "Add Track"}
                    </button>
                </div>

                {/* 3. PIANO ROLL EDITOR */}
                <div style={styles.editorToolbar}>
                    <div style={styles.toolbarGroup}>
                        <button style={styles.toolButton} type="button">↖</button>
                        <button style={{ ...styles.toolButton, ...styles.activeToolButton }} type="button">✎</button>
                        <span style={styles.toolbarDivider} />
                        <span style={styles.toolbarLabel}>MIDI Notes</span>
                        <button
                            type="button"
                            aria-label="Delete selected note"
                            title="Delete selected note"
                            onClick={() => selectedNoteId && deleteNote(selectedNoteId)}
                            style={{ ...styles.toolButton, opacity: selectedNoteId ? 1 : 0.45 }}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                    <div style={styles.toolbarGroup}>
                        <span style={styles.toolbarLabel}>Snap</span>
                        <select defaultValue="1/16" style={styles.selectInput} aria-label="Snap interval">
                            <option>1/16</option>
                            <option>1/8</option>
                            <option>1/4</option>
                        </select>
                        <button style={styles.toolButton} type="button">−</button>
                        <button style={styles.toolButton} type="button">+</button>
                    </div>
                </div>
                <div style={styles.pianoRollSection}>

                    {/* Piano Keys Column */}
                    <div style={styles.pianoKeysColumn}>
                        {PITCHES.map((pitch) => (
                            <div
                                key={pitch}
                                style={{
                                    ...styles.pianoKey,
                                    backgroundColor: pitch.includes("#") ? "#0a0302" : "transparent"
                                }}
                            >
                                {pitch}
                            </div>
                        ))}
                    </div>

                    {/* Piano Grid Canvas */}
                    <div ref={gridRef} style={styles.gridCanvas}>
                        {currentStep >= 0 && (
                            <div
                                aria-hidden="true"
                                style={{
                                    ...styles.playhead,
                                    left: `${((currentStep + 0.5) / TOTAL_STEPS) * 100}%`,
                                }}
                            />
                        )}
                        {PITCHES.map((pitch) => (
                            <div key={pitch} style={styles.gridRow}>
                                {Array.from({ length: TOTAL_STEPS }).map((_, stepIndex) => (
                                    <button
                                        key={stepIndex}
                                        type="button"
                                        aria-label={`Add ${pitch} at step ${stepIndex + 1}`}
                                        onClick={() => addNote(pitch, stepIndex)}
                                        style={styles.gridCell}
                                    />
                                ))}
                            </div>
                        ))}

                        {/* Render Draggable Note Blocks */}
                        {notes.map((note) => {
                            const rowIndex = PITCHES.indexOf(note.pitch);
                            if (rowIndex === -1) return null;

                            return (
                                <div
                                    key={note.id}
                                    onPointerDown={(event) => beginNoteDrag(event, note)}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedNoteId(note.id);
                                    }}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        deleteNote(note.id);
                                    }}
                                    style={{
                                        ...styles.noteBlock,
                                        top: `${(rowIndex / PITCHES.length) * 100}%`,
                                        height: `${(1 / PITCHES.length) * 100}%`,
                                        left: `${(note.startStep / TOTAL_STEPS) * 100}%`,
                                        width: `${(note.duration / TOTAL_STEPS) * 100}%`,
                                        background: note.isDragging ? "var(--accent)" : "var(--primary)",
                                        boxShadow: note.isDragging ? "0 0 0 2px #facc15" : "0 2px 4px rgba(0,0,0,0.3)",
                                        cursor: note.isDragging ? "grabbing" : "grab",
                                        opacity: note.isDragging ? 0.8 : 1,
                                        zIndex: 1,
                                        outline: selectedNoteId === note.id ? "2px solid #f5c451" : "none",
                                    }}
                                >
                                    {note.userId && <span style={styles.userTag}>{note.userId}</span>}
                                    {note.pitch}
                                    <button
                                        type="button"
                                        aria-label={`Resize ${note.pitch} note`}
                                        onPointerDown={(event) => beginNoteResize(event, note)}
                                        style={styles.resizeHandle}
                                    />
                                </div>
                            );
                        })}
                    </div>

                </div>

            </div>
            {error && <div style={styles.errorBanner}>{error}</div>}
        </div>
    );
}

// STYLES OBJECT
const styles: Record<string, React.CSSProperties> = {
    statusPage: {
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--background)",
        color: "var(--foreground)",
    },
    errorBanner: {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        maxWidth: "360px",
        padding: "10px 14px",
        border: "1px solid #ef4444",
        background: "rgba(40, 8, 4, 0.95)",
        color: "var(--foreground)",
        fontSize: "12px",
    },
    pageContainer: {
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        userSelect: "none",
        background: "var(--background)",
        color: "var(--foreground)",
    },
    header: {
        height: "58px",
        borderBottom: "1px solid var(--secondary-accent)",
        backgroundColor: "#090a0c",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: "16px",
        paddingRight: "16px",
    },
    flexCenterGap3: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
    },
    flexCenterGap2: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
    },
    playButton: {
        padding: "8px",
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--primary)",
        color: "var(--foreground)",
    },
    iconButton: {
        padding: "8px",
        borderRadius: "50%",
        border: "none",
        background: "transparent",
        color: "var(--foreground)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    divider: {
        height: "20px",
        width: "1px",
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        margin: "0 8px",
    },
    bpmContainer: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "12px",
        fontFamily: "monospace",
    },
    bpmInput: {
        width: "56px",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "4px",
        padding: "4px 6px",
        textAlign: "center",
        fontWeight: "bold",
        color: "var(--foreground)",
    },
    presenceBadge: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        padding: "4px 10px",
        borderRadius: "9999px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        backgroundColor: "rgba(0, 0, 0, 0.3)",
    },
    avatar: {
        width: "28px",
        height: "28px",
        borderRadius: "50%",
        border: "2px solid #000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "12px",
        fontWeight: "bold",
    },
    workspace: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    },
    editorToolbar: {
        height: "48px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 14px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        backgroundColor: "#121416",
    },
    toolbarGroup: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
    },
    toolbarLabel: {
        color: "#a8adb5",
        fontSize: "11px",
        fontWeight: 600,
    },
    toolbarDivider: {
        height: "20px",
        width: "1px",
        backgroundColor: "rgba(255, 255, 255, 0.12)",
        margin: "0 4px",
    },
    toolButton: {
        width: "28px",
        height: "28px",
        display: "grid",
        placeItems: "center",
        border: "1px solid transparent",
        borderRadius: "4px",
        backgroundColor: "#1d2024",
        color: "#d7d9dc",
        cursor: "pointer",
        fontSize: "15px",
    },
    activeToolButton: {
        backgroundColor: "#b77a19",
        color: "#fff",
    },
    selectInput: {
        height: "28px",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "4px",
        backgroundColor: "#1d2024",
        color: "#d7d9dc",
        padding: "0 8px",
        fontSize: "11px",
    },
    tracksSection: {
        height: "30%",
        borderBottom: "1px solid var(--secondary-accent)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
    },
    trackRow: {
        display: "flex",
        height: "80px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        cursor: "pointer",
        transition: "background-color 0.2s",
    },
    trackSidePanel: {
        width: "192px",
        padding: "12px",
        borderRight: "1px solid var(--secondary-accent)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
    },
    trackName: {
        minWidth: 0,
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontSize: "12px",
        fontWeight: "bold",
    },
    trackNameInput: {
        minWidth: 0,
        flex: 1,
        width: "100%",
        padding: "3px 5px",
        border: "1px solid var(--accent)",
        borderRadius: "3px",
        background: "#101214",
        color: "var(--foreground)",
        font: "inherit",
        fontSize: "12px",
    },
    trackDeleteButton: {
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        padding: "4px",
        border: "none",
        background: "transparent",
        color: "#a8adb5",
        cursor: "pointer",
    },
    trackControls: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "10px",
        opacity: 0.6,
    },
    slider: {
        width: "64px",
        height: "4px",
        accentColor: "var(--primary)",
    },
    timelineLane: {
        flex: 1,
        position: "relative",
        backgroundColor: "#101214",
        display: "flex",
        alignItems: "center",
    },
    midiClip: {
        position: "absolute",
        height: "48px",
        width: "30%",
        borderRadius: "4px",
        border: "1px solid var(--accent)",
        padding: "8px",
        fontSize: "12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--foreground)",
        cursor: "grab",
        touchAction: "none",
        overflow: "hidden",
    },
    clipTitle: {
        alignSelf: "flex-start",
        fontSize: "10px",
        fontWeight: 700,
    },
    clipPattern: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        width: "100%",
        height: "20px",
        marginTop: "4px",
    },
    clipPatternBar: {
        display: "block",
        flex: 1,
        minWidth: "3px",
        backgroundColor: "rgba(255, 210, 93, 0.9)",
        borderRadius: "1px",
    },
    addTrackButton: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px",
        fontSize: "12px",
        fontWeight: "bold",
        opacity: 0.7,
        background: "none",
        border: "none",
        color: "inherit",
        cursor: "pointer",
    },
    trackContextMenu: {
        position: "fixed",
        zIndex: 10,
        minWidth: "140px",
        padding: "4px",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "4px",
        background: "#1d2024",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
    },
    contextMenuItem: {
        display: "block",
        width: "100%",
        padding: "8px 10px",
        border: "none",
        background: "transparent",
        color: "#d7d9dc",
        textAlign: "left",
        fontSize: "12px",
        cursor: "pointer",
    },
    pianoRollSection: {
        flex: 1,
        display: "flex",
        overflow: "hidden",
        backgroundColor: "#181a1d",
    },
    pianoKeysColumn: {
        width: "72px",
        flexShrink: 0,
        borderRight: "1px solid var(--secondary-accent)",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#111315",
    },
    pianoKey: {
        flex: 1,
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingRight: "8px",
        fontSize: "10px",
        fontFamily: "monospace",
        opacity: 0.6,
        color: "#b5bac2",
    },
    gridCanvas: {
        flex: 1,
        position: "relative",
        overflowX: "auto",
        display: "flex",
        flexDirection: "column",
        minWidth: "640px",
        backgroundColor: "#1a1c1e",
    },
    playhead: {
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "2px",
        backgroundColor: "var(--accent)",
        pointerEvents: "none",
        zIndex: 2,
    },
    gridRow: {
        flex: 1,
        display: "flex",
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        position: "relative",
    },
    gridCell: {
        flex: 1,
        borderRight: "1px solid rgba(255, 255, 255, 0.05)",
        appearance: "none",
        minWidth: 0,
        padding: 0,
        backgroundColor: "transparent",
        cursor: "crosshair",
    },
    noteBlock: {
        position: "absolute",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        paddingLeft: "4px",
        paddingRight: "4px",
        fontSize: "9px",
        fontWeight: "bold",
        color: "var(--foreground)",
        transition: "box-shadow 0.1s",
        touchAction: "none",
        userSelect: "none",
        overflow: "hidden",
    },
    resizeHandle: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: "7px",
        padding: 0,
        border: 0,
        background: "rgba(255, 255, 255, 0.3)",
        cursor: "ew-resize",
        opacity: 0.7,
    },
    userTag: {
        fontSize: "8px",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        padding: "0 4px",
        borderRadius: "2px",
        marginRight: "4px",
    },
};
