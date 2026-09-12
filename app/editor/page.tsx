"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Play, Pause, Square, Mic, Music2, Plus, Users, Trash2 } from "lucide-react";
import { getUser } from "../../lib/auth";
import {
    getTracks,
    createTrack,
    renameTrack,
    deleteTrack,
    getTrackBlocks,
    createMidiBlock,
    updateMidiBlock,
    deleteMidiBlock,
    getBlockNotes,
    replaceBlockNotes,
    type MidiBlock,
    type Track,
} from "../../lib/editor";
import { loadProject, type Project } from "../../lib/projects";
import { useAudioEngine } from "../../hooks/useAudioEngine";
import {
    useRealTimeSync,
    type BlockDeletedPayload,
    type TrackAddedPayload,
} from "../../hooks/useRealTimeSync";
import type { NoteBlock, PeerPresence } from "../../types/music";

const PITCHES = ["C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4"];
const STEPS_PER_BAR = 4;
const TRACK_BAR_COUNT = 100;
const TRACK_TOTAL_STEPS = TRACK_BAR_COUNT * STEPS_PER_BAR;
const MIDI_TOTAL_STEPS = 16;

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

interface NoteCreationState {
    pitch: string;
    startStep: number;
    currentStep: number;
}

interface ClipDragState {
    blockId: string;
    trackId: string;
    pointerStartStep: number;
    clipStartStep: number;
    currentStartStep: number;
}

interface TrackContextMenuState {
    trackId: string;
    blockId?: string;
    x: number;
    y: number;
}

export default function EditorPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const projectId = searchParams.get("projectId");
    const [project, setProject] = useState<Project | null>(null);
    const [tracks, setTracks] = useState<Track[]>([]);
    const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
    const [blocks, setBlocks] = useState<MidiBlock[]>([]);
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const [notes, setNotes] = useState<NoteBlock[]>([]);
    const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [creatingTrack, setCreatingTrack] = useState(false);
    const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
    const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
    const [renamingTrackId, setRenamingTrackId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [trackContextMenu, setTrackContextMenu] = useState<TrackContextMenuState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [resizeState, setResizeState] = useState<ResizeState | null>(null);
    const [noteCreationState, setNoteCreationState] = useState<NoteCreationState | null>(null);
    const [clipDragState, setClipDragState] = useState<ClipDragState | null>(null);
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const clipTimelineRef = useRef<HTMLElement>(null);
    const trackNamesRef = useRef<HTMLDivElement>(null);
    const timelineScrollRef = useRef<HTMLDivElement>(null);
    const addBlockScrollRef = useRef<HTMLDivElement>(null);

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

    const handleTrackAdded = useCallback(({ track, block }: TrackAddedPayload) => {
        setTracks((currentTracks) => {
            if (currentTracks.some((currentTrack) => currentTrack.id === track.id)) {
                return currentTracks;
            }

            return [...currentTracks, track].sort((left, right) => left.position - right.position);
        });
        setBlocks((currentBlocks) =>
            currentBlocks.some((currentBlock) => currentBlock.id === block.id)
                ? currentBlocks
                : [...currentBlocks, block],
        );
    }, []);

    const handleTrackRenamed = useCallback((renamedTrack: Track) => {
        setTracks((currentTracks) => currentTracks.map((track) =>
            track.id === renamedTrack.id ? renamedTrack : track,
        ));
    }, []);

    const handleTrackDeleted = useCallback((trackId: string) => {
        setTracks((currentTracks) => {
            const remainingTracks = currentTracks.filter((track) => track.id !== trackId);
            if (activeTrackId === trackId) {
                setActiveTrackId(remainingTracks[0]?.id ?? null);
            }
            return remainingTracks;
        });
        setBlocks((currentBlocks) => {
            const remainingBlocks = currentBlocks.filter((block) => block.track_id !== trackId);
            if (activeTrackId === trackId) {
                setActiveBlockId(remainingBlocks[0]?.id ?? null);
                setNotes([]);
            }
            return remainingBlocks;
        });
    }, [activeTrackId]);

    const handleBlockAdded = useCallback((block: MidiBlock) => {
        setBlocks((currentBlocks) =>
            currentBlocks.some((currentBlock) => currentBlock.id === block.id)
                ? currentBlocks
                : [...currentBlocks, block],
        );
    }, []);

    const handleBlockDeleted = useCallback(({ blockId, trackId }: BlockDeletedPayload) => {
        setBlocks((currentBlocks) => {
            const remainingBlocks = currentBlocks.filter((block) => block.id !== blockId);
            if (activeBlockId === blockId) {
                const nextBlock = remainingBlocks.find((block) => block.track_id === trackId);
                setActiveBlockId(nextBlock?.id ?? null);
                setNotes([]);
            }
            return remainingBlocks;
        });
    }, [activeBlockId]);

    const handleBlockMoved = useCallback((movedBlock: MidiBlock) => {
        setBlocks((currentBlocks) => currentBlocks.map((block) =>
            block.id === movedBlock.id ? movedBlock : block,
        ));
    }, []);

    const {
        peers,
        isConnected,
        broadcastNotes,
        broadcastTrackAdded,
        broadcastTrackRenamed,
        broadcastTrackDeleted,
        broadcastBlockAdded,
        broadcastBlockDeleted,
        broadcastBlockMoved,
    } = useRealTimeSync({
        roomId: projectId ?? "",
        user: presence ?? { userId: "", userName: "", color: "" },
        onNotesUpdated: setNotes,
        onTrackAdded: handleTrackAdded,
        onTrackRenamed: handleTrackRenamed,
        onTrackDeleted: handleTrackDeleted,
        onBlockAdded: handleBlockAdded,
        onBlockDeleted: handleBlockDeleted,
        onBlockMoved: handleBlockMoved,
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

                const loadedBlocks = (await Promise.all(loadedTracks.map(async (track) => {
                    const trackBlocks = await getTrackBlocks(track.id);
                    return trackBlocks.length > 0
                        ? trackBlocks
                        : [await createMidiBlock(track.id, "MIDI Clip", 0, MIDI_TOTAL_STEPS)];
                }))).flat();

                setTracks(loadedTracks);
                setBlocks(loadedBlocks);
                setActiveTrackId(loadedTracks[0].id);
                setActiveBlockId(loadedBlocks.find((block) => block.track_id === loadedTracks[0].id)?.id ?? null);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Could not load the editor.");
            } finally {
                setLoading(false);
            }
        }

        void loadEditor();
    }, [projectId]);

    useEffect(() => {
        if (!activeBlockId) return;
        const blockId = activeBlockId;

        async function loadNotes() {
            try {
                setNotes(await getBlockNotes(blockId));
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Could not load notes.");
            }
        }

        void loadNotes();
    }, [activeBlockId]);

    useEffect(() => {
        scheduleNotes(notes);
    }, [notes, scheduleNotes]);

    const persistNotes = useCallback(async (nextNotes: NoteBlock[]) => {
        if (!activeBlockId || !user) return;

        await replaceBlockNotes(activeBlockId, nextNotes, user.id);
    }, [activeBlockId, user]);

    const updateNotes = useCallback(async (nextNotes: NoteBlock[]) => {
        setNotes(nextNotes);

        try {
            await persistNotes(nextNotes);
            await broadcastNotes(nextNotes);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Could not save notes.");
        }
    }, [broadcastNotes, persistNotes]);

    function getNotePlacement(pitch: string, startStep: number, endStep: number) {
        const placementStart = Math.min(startStep, endStep);
        const placementEnd = Math.max(startStep, endStep) + 1;
        const overlapsExistingNote = notes.some((note) =>
            note.pitch === pitch &&
            placementStart < note.startStep + note.duration &&
            placementEnd > note.startStep,
        );

        return overlapsExistingNote ? null : {
            startStep: placementStart,
            duration: placementEnd - placementStart,
        };
    }

    function beginNoteCreation(event: React.PointerEvent<HTMLButtonElement>, pitch: string, startStep: number) {
        event.preventDefault();
        event.stopPropagation();
        setNoteCreationState({ pitch, startStep, currentStep: startStep });
        void playPreview(pitch);
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function updateNoteCreation(event: React.PointerEvent<HTMLButtonElement>) {
        if (!noteCreationState) return;

        const grid = gridRef.current;
        if (!grid) return;

        const rect = grid.getBoundingClientRect();
        const stepWidth = rect.width / MIDI_TOTAL_STEPS;
        const currentStep = Math.max(
            0,
            Math.min(MIDI_TOTAL_STEPS - 1, Math.floor((event.clientX - rect.left) / stepWidth)),
        );
        setNoteCreationState((currentState) => currentState
            ? { ...currentState, currentStep }
            : currentState);
    }

    function finishNoteCreation(event: React.PointerEvent<HTMLButtonElement>) {
        if (!noteCreationState) return;

        event.preventDefault();
        event.stopPropagation();
        const placement = getNotePlacement(
            noteCreationState.pitch,
            noteCreationState.startStep,
            noteCreationState.currentStep,
        );
        setNoteCreationState(null);

        if (!placement) return;

        const note: NoteBlock = {
            id: crypto.randomUUID(),
            pitch: noteCreationState.pitch,
            startStep: placement.startStep,
            duration: placement.duration,
            userId: user?.id,
        };

        void updateNotes([...notes, note]);
    }

    function cancelNoteCreation() {
        setNoteCreationState(null);
    }

    async function addTrack() {
        if (!projectId || creatingTrack) return;

        const trackName = window.prompt("Track name", `Track ${tracks.length + 1}`)?.trim();
        if (!trackName) return;

        setCreatingTrack(true);
        setError(null);

        try {
            const track = await createTrack(projectId, trackName, tracks.length);
            const block = await createMidiBlock(track.id, "MIDI Clip", 0, MIDI_TOTAL_STEPS);
            setTracks((currentTracks) => [...currentTracks, track]);
            setBlocks((currentBlocks) => [...currentBlocks, block]);
            setActiveTrackId(track.id);
            setActiveBlockId(block.id);
            await broadcastTrackAdded({ track, block });
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : "Could not create track.");
        } finally {
            setCreatingTrack(false);
        }
    }

    async function addBlock(track: Track) {
        const trackBlocks = blocks.filter((block) => block.track_id === track.id);
        const startStep = trackBlocks.reduce(
            (latestEnd, block) => Math.max(latestEnd, block.start_step + block.length_steps),
            0,
        );

        try {
            const block = await createMidiBlock(track.id, `MIDI Clip ${trackBlocks.length + 1}`, startStep, MIDI_TOTAL_STEPS);
            setBlocks((currentBlocks) => [...currentBlocks, block]);
            setActiveTrackId(track.id);
            setActiveBlockId(block.id);
            await broadcastBlockAdded(block);
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : "Could not create MIDI block.");
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
            await broadcastTrackRenamed(renamedTrack);
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
                    const nextBlock = blocks.find((block) => block.track_id === remainingTracks[0]?.id);
                    setActiveBlockId(nextBlock?.id ?? null);
                    if (remainingTracks.length === 0) setNotes([]);
                }
                return remainingTracks;
            });
            setBlocks((currentBlocks) => currentBlocks.filter((block) => block.track_id !== track.id));
            await broadcastTrackDeleted(track.id);
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Could not delete track.");
        } finally {
            setDeletingTrackId(null);
        }
    }

    async function removeMidiBlock(block: MidiBlock) {
        if (deletingBlockId) return;

        setTrackContextMenu(null);
        setDeletingBlockId(block.id);
        setError(null);

        try {
            await deleteMidiBlock(block.id);
            const remainingTrackBlocks = blocks.filter((currentBlock) =>
                currentBlock.track_id === block.track_id && currentBlock.id !== block.id,
            );
            setBlocks((currentBlocks) => currentBlocks.filter((currentBlock) => currentBlock.id !== block.id));

            if (activeBlockId === block.id) {
                const nextBlock = remainingTrackBlocks[0];
                setActiveBlockId(nextBlock?.id ?? null);
                setNotes([]);
            }
            await broadcastBlockDeleted({ blockId: block.id, trackId: block.track_id });
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : "Could not delete MIDI block.");
        } finally {
            setDeletingBlockId(null);
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
        const stepWidth = rect.width / MIDI_TOTAL_STEPS;
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
        const stepWidth = rect.width / MIDI_TOTAL_STEPS;
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
            const stepWidth = rect.width / MIDI_TOTAL_STEPS;
            const rowHeight = rect.height / PITCHES.length;
            const draggedNote = notes.find((note) => note.id === activeDrag.noteId);
            if (!draggedNote) return;

            const nextStartStep = Math.max(
                0,
                Math.min(
                    MIDI_TOTAL_STEPS - draggedNote.duration,
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
            const stepWidth = rect.width / MIDI_TOTAL_STEPS;
            const currentStep = (event.clientX - rect.left) / stepWidth;
            const nextDuration = Math.max(
                1,
                Math.min(
                    MIDI_TOTAL_STEPS - activeResize.startStep,
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

    function beginClipDrag(event: React.PointerEvent<HTMLDivElement>, track: Track, block: MidiBlock) {
        const timeline = event.currentTarget.parentElement;
        if (!timeline) return;

        event.preventDefault();
        event.stopPropagation();
        clipTimelineRef.current = timeline;
        const rect = timeline.getBoundingClientRect();
        setActiveTrackId(track.id);
        setActiveBlockId(block.id);
        setClipDragState({
            blockId: block.id,
            trackId: track.id,
            pointerStartStep: ((event.clientX - rect.left) / rect.width) * TRACK_TOTAL_STEPS,
            clipStartStep: block.start_step,
            currentStartStep: block.start_step,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    useEffect(() => {
        if (!clipDragState) return;
        const activeClipDrag = clipDragState;

        function moveClip(event: PointerEvent) {
            const scrollContainer = timelineScrollRef.current;
            if (scrollContainer) {
                const scrollBounds = scrollContainer.getBoundingClientRect();
                const edgeThreshold = 48;
                if (event.clientX > scrollBounds.right - edgeThreshold) {
                    scrollContainer.scrollLeft += 12;
                } else if (event.clientX < scrollBounds.left + edgeThreshold) {
                    scrollContainer.scrollLeft -= 12;
                }
            }

            const timeline = clipTimelineRef.current;
            if (!timeline) return;
            const rect = timeline.getBoundingClientRect();
            const pointerStep = ((event.clientX - rect.left) / rect.width) * TRACK_TOTAL_STEPS;
            const draggedBlock = blocks.find((block) => block.id === activeClipDrag.blockId);
            if (!draggedBlock) return;

            const snappedStartStep = Math.round(
                (activeClipDrag.clipStartStep + pointerStep - activeClipDrag.pointerStartStep) / STEPS_PER_BAR,
            ) * STEPS_PER_BAR;
            const nextStartStep = Math.max(
                0,
                Math.min(
                    Math.floor((TRACK_TOTAL_STEPS - draggedBlock.length_steps) / STEPS_PER_BAR) * STEPS_PER_BAR,
                    snappedStartStep,
                ),
            );
            if (nextStartStep === activeClipDrag.currentStartStep) return;

            const nextEndStep = nextStartStep + draggedBlock.length_steps;
            const overlapsAnotherBlock = blocks.some((block) =>
                block.track_id === activeClipDrag.trackId &&
                block.id !== activeClipDrag.blockId &&
                nextStartStep < block.start_step + block.length_steps &&
                nextEndStep > block.start_step,
            );

            if (overlapsAnotherBlock) return;

            const movedBlock = { ...draggedBlock, start_step: nextStartStep };
            setBlocks((currentBlocks) => currentBlocks.map((block) =>
                block.id === activeClipDrag.blockId ? movedBlock : block,
            ));
            setClipDragState((currentState) => currentState
                ? { ...currentState, currentStartStep: nextStartStep }
                : currentState);
            void broadcastBlockMoved(movedBlock).catch((broadcastError) => {
                setError(broadcastError instanceof Error ? broadcastError.message : "Could not sync MIDI block movement.");
            });
        }

        async function finishClipDrag() {
            try {
                const movedBlock = await updateMidiBlock(activeClipDrag.blockId, {
                    start_step: activeClipDrag.currentStartStep,
                });
                await broadcastBlockMoved(movedBlock);
            } catch (moveError) {
                setError(moveError instanceof Error ? moveError.message : "Could not move MIDI block.");
            }
            setClipDragState(null);
        }

        window.addEventListener("pointermove", moveClip);
        window.addEventListener("pointerup", finishClipDrag, { once: true });
        return () => {
            window.removeEventListener("pointermove", moveClip);
            window.removeEventListener("pointerup", finishClipDrag);
        };
    }, [blocks, broadcastBlockMoved, clipDragState]);

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

    const activeBlock = blocks.find((block) => block.id === activeBlockId);
    const midiBarStart = activeBlock
        ? Math.floor(activeBlock.start_step / STEPS_PER_BAR) + 1
        : 1;
    const midiBarCount = Math.max(
        1,
        Math.ceil((activeBlock?.length_steps ?? MIDI_TOTAL_STEPS) / STEPS_PER_BAR),
    );

    return (
        <div style={styles.pageContainer}>
            {/* 1. TOP CONTROL BAR */}
            <header style={styles.header}>
                <button
                    type="button"
                    onClick={() => router.push("/projects")}
                    style={styles.backButton}
                    aria-label="Back to projects"
                    title="Back to projects"
                >
                    <ArrowLeft size={17} />
                </button>
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
                    <div style={styles.tracksViewport}>
                        <div style={styles.trackNamesColumn}>
                            <div style={styles.barRulerSpacer} />
                            <div ref={trackNamesRef} className="editor-scrollbar" style={styles.trackNamesScroll}>
                                {tracks.map((track) => (
                                    <div
                                        key={track.id}
                                        onClick={() => {
                                            setActiveTrackId(track.id);
                                            setActiveBlockId(blocks.find((block) => block.track_id === track.id)?.id ?? null);
                                        }}
                                        onContextMenu={(event) => {
                                            event.preventDefault();
                                            setTrackContextMenu({ trackId: track.id, x: event.clientX, y: event.clientY });
                                        }}
                                        style={{
                                            ...styles.trackRow,
                                            minWidth: "192px",
                                            backgroundColor: activeTrackId === track.id ? "var(--secondary-accent)" : "transparent",
                                        }}
                                    >
                                        <div style={styles.trackSidePanel}>
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
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div
                            ref={timelineScrollRef}
                            className="editor-scrollbar"
                            onScroll={(event) => {
                                if (trackNamesRef.current) {
                                    trackNamesRef.current.scrollTop = event.currentTarget.scrollTop;
                                }
                                if (addBlockScrollRef.current) {
                                    addBlockScrollRef.current.scrollTop = event.currentTarget.scrollTop;
                                }
                            }}
                            style={styles.timelineScrollColumn}
                        >
                            <div style={styles.trackBarRuler}>
                                {Array.from({ length: TRACK_BAR_COUNT }).map((_, barIndex) => (
                                    <div
                                        key={barIndex}
                                        style={{
                                            ...styles.barNumber,
                                            left: `${(barIndex / TRACK_BAR_COUNT) * 100}%`,
                                            width: `${(1 / TRACK_BAR_COUNT) * 100}%`,
                                        }}
                                    >
                                        {barIndex + 1}
                                    </div>
                                ))}
                            </div>
                            {tracks.map((track) => (
                                <div
                                    key={track.id}
                                    onClick={() => {
                                        setActiveTrackId(track.id);
                                        setActiveBlockId(blocks.find((block) => block.track_id === track.id)?.id ?? null);
                                    }}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        setTrackContextMenu({ trackId: track.id, x: event.clientX, y: event.clientY });
                                    }}
                                    style={{
                                        ...styles.trackRow,
                                        backgroundColor: activeTrackId === track.id ? "rgba(255, 255, 255, 0.03)" : "transparent",
                                    }}
                                >
                                    <div style={styles.timelineLane}>
                                        {blocks.filter((block) => block.track_id === track.id).map((block) => (
                                            <div
                                                key={block.id}
                                                onPointerDown={(event) => beginClipDrag(event, track, block)}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setActiveTrackId(track.id);
                                                    setActiveBlockId(block.id);
                                                }}
                                                onContextMenu={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    setActiveTrackId(track.id);
                                                    setActiveBlockId(block.id);
                                                    setTrackContextMenu({
                                                        trackId: track.id,
                                                        blockId: block.id,
                                                        x: event.clientX,
                                                        y: event.clientY,
                                                    });
                                                }}
                                                style={{
                                                    ...styles.midiClip,
                                                    left: `${(block.start_step / TRACK_TOTAL_STEPS) * 100}%`,
                                                    width: `${(block.length_steps / TRACK_TOTAL_STEPS) * 100}%`,
                                                    background: track.position % 2 === 0 ? "var(--secondary)" : "var(--primary)",
                                                    outline: activeBlockId === block.id ? "2px solid #e9a82e" : "none",
                                                }}
                                            >
                                                <span style={styles.clipTitle}>{block.name}</span>
                                                <span style={styles.clipPattern} aria-hidden="true">
                                                    {[2, 4, 1, 5, 3, 6, 4, 2].map((height, index) => (
                                                        <i key={index} style={{ ...styles.clipPatternBar, height: `${height * 3}px` }} />
                                                    ))}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={styles.addBlockColumn}>
                            <div style={styles.barRulerSpacer} />
                            <div ref={addBlockScrollRef} className="editor-scrollbar" style={styles.addBlockScroll}>
                                {tracks.map((track) => (
                                    <div key={track.id} style={styles.addBlockRow}>
                                        <button
                                            type="button"
                                            aria-label={`Add MIDI block to ${track.name}`}
                                            title="Add MIDI block"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                void addBlock(track);
                                            }}
                                            style={styles.addBlockButton}
                                        >
                                            <Plus size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {trackContextMenu && (
                        <div
                            role="menu"
                            onClick={(event) => event.stopPropagation()}
                            style={{ ...styles.trackContextMenu, left: trackContextMenu.x, top: trackContextMenu.y }}
                        >
                            {(() => {
                                const track = tracks.find((item) => item.id === trackContextMenu.trackId);
                                if (!track) return null;
                                const block = trackContextMenu.blockId
                                    ? blocks.find((item) => item.id === trackContextMenu.blockId)
                                    : null;

                                if (block) {
                                    return (
                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => void removeMidiBlock(block)}
                                            disabled={deletingBlockId === block.id}
                                            style={{ ...styles.contextMenuItem, color: "#f87171" }}
                                        >
                                            Delete MIDI block
                                        </button>
                                    );
                                }

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

                    <div className="editor-scrollbar" style={styles.gridScrollViewport}>
                        <div style={styles.gridContent}>
                            <div style={styles.midiBarRuler}>
                                {Array.from({ length: midiBarCount }).map((_, barIndex) => (
                                    <div
                                        key={barIndex}
                                        style={{
                                            ...styles.barNumber,
                                            left: `${(barIndex / midiBarCount) * 100}%`,
                                            width: `${(1 / midiBarCount) * 100}%`,
                                        }}
                                    >
                                        {midiBarStart + barIndex}
                                    </div>
                                ))}
                            </div>
                            <div ref={gridRef} style={styles.gridCanvas}>
                                {currentStep >= 0 && (
                                    <div
                                        aria-hidden="true"
                                        style={{
                                            ...styles.playhead,
                                            left: `${((currentStep + 0.5) / MIDI_TOTAL_STEPS) * 100}%`,
                                        }}
                                    />
                                )}
                                {PITCHES.map((pitch) => (
                                    <div key={pitch} style={styles.gridRow}>
                                        {Array.from({ length: MIDI_TOTAL_STEPS }).map((_, stepIndex) => (
                                            <button
                                                key={stepIndex}
                                                type="button"
                                                aria-label={`Add ${pitch} at step ${stepIndex + 1}`}
                                                onPointerDown={(event) => beginNoteCreation(event, pitch, stepIndex)}
                                                onPointerMove={updateNoteCreation}
                                                onPointerUp={finishNoteCreation}
                                                onPointerCancel={cancelNoteCreation}
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
                                                left: `${(note.startStep / MIDI_TOTAL_STEPS) * 100}%`,
                                                width: `${(note.duration / MIDI_TOTAL_STEPS) * 100}%`,
                                                background: note.isDragging ? "var(--accent)" : "var(--primary)",
                                                boxShadow: note.isDragging ? "0 0 0 2px #facc15" : "0 2px 4px rgba(0,0,0,0.3)",
                                                cursor: note.isDragging ? "grabbing" : "grab",
                                                opacity: note.isDragging ? 0.8 : 1,
                                                zIndex: 1,
                                                outline: selectedNoteId === note.id ? "2px solid #f5c451" : "none",
                                            }}
                                        >
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
                                {noteCreationState && (
                                    <div
                                        aria-hidden="true"
                                        style={{
                                            ...styles.noteBlock,
                                            top: `${(PITCHES.indexOf(noteCreationState.pitch) / PITCHES.length) * 100}%`,
                                            height: `${(1 / PITCHES.length) * 100}%`,
                                            left: `${(Math.min(noteCreationState.startStep, noteCreationState.currentStep) / MIDI_TOTAL_STEPS) * 100}%`,
                                            width: `${((Math.abs(noteCreationState.currentStep - noteCreationState.startStep) + 1) / MIDI_TOTAL_STEPS) * 100}%`,
                                            background: "var(--accent)",
                                            boxShadow: "0 0 0 2px #facc15",
                                            opacity: 0.8,
                                            cursor: "grabbing",
                                            pointerEvents: "none",
                                            zIndex: 2,
                                        }}
                                    >
                                        {noteCreationState.pitch}
                                    </div>
                                )}
                            </div>
                        </div>
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
    backButton: {
        padding: "8px",
        borderRadius: "4px",
        border: "1px solid var(--secondary)",
        background: "transparent",
        color: "var(--foreground)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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
        minHeight: 0,
        borderBottom: "1px solid var(--secondary-accent)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    },
    tracksViewport: {
        flex: 1,
        minHeight: 0,
        display: "flex",
        overflow: "hidden",
    },
    trackNamesColumn: {
        width: "192px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
    },
    trackNamesScroll: {
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
    },
    timelineScrollColumn: {
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: "auto",
    },
    addBlockColumn: {
        width: "48px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid var(--secondary-accent)",
        backgroundColor: "#101214",
    },
    addBlockScroll: {
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
    },
    addBlockRow: {
        height: "80px",
        display: "grid",
        placeItems: "center",
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    },
    barRulerSpacer: {
        height: "24px",
        flexShrink: 0,
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        backgroundColor: "#111315",
    },
    trackBarRuler: {
        position: "relative",
        width: "16000px",
        height: "24px",
        flexShrink: 0,
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        backgroundColor: "#111315",
    },
    midiBarRuler: {
        position: "relative",
        width: "100%",
        minWidth: "640px",
        height: "24px",
        flexShrink: 0,
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        backgroundColor: "#111315",
    },
    barNumber: {
        position: "absolute",
        top: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        paddingLeft: "6px",
        borderLeft: "1px solid rgba(255, 255, 255, 0.18)",
        color: "#b5bac2",
        fontFamily: "monospace",
        fontSize: "10px",
        fontWeight: 700,
    },
    trackRow: {
        display: "flex",
        height: "80px",
        minWidth: "16000px",
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
        width: "16000px",
        flexShrink: 0,
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
    addBlockButton: {
        width: "28px",
        height: "28px",
        display: "grid",
        placeItems: "center",
        border: "1px dashed rgba(255, 255, 255, 0.25)",
        borderRadius: "4px",
        background: "transparent",
        color: "#a8adb5",
        cursor: "pointer",
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
        borderRight: "1px solid rgba(255, 255, 255, 0.035)",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#111315",
    },
    gridScrollViewport: {
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: "auto",
    },
    gridContent: {
        width: "100%",
        minWidth: "640px",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
    },
    pianoKey: {
        flex: 1,
        borderBottom: "1px solid rgba(255, 255, 255, 0.025)",
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
        minHeight: 0,
        position: "relative",
        display: "flex",
        flexDirection: "column",
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
        position: "relative",
    },
    gridCell: {
        flex: 1,
        border: "none",
        borderRight: "1px solid rgba(210, 131, 42, 0.035)",
        borderBottom: "1px solid rgba(152, 49, 9, 0.045)",
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
        justifyContent: "center",
        paddingLeft: "8px",
        paddingRight: "8px",
        fontSize: "12px",
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
};
