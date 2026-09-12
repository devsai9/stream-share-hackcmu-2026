import { supabase } from "./supabase/client";
import type { Tables } from "./supabase/supabase";
import type { NoteBlock } from "../types/music";

export type Track = Pick<Tables<"tracks">, "id" | "project_id" | "name" | "position">;
export type MidiBlock = Pick<Tables<"midi_blocks">, "id" | "track_id" | "name" | "start_step" | "length_steps">;

export async function getTracks(projectId: string): Promise<Track[]> {
    const { data, error } = await supabase
        .from("tracks")
        .select("id, project_id, name, position")
        .eq("project_id", projectId)
        .order("position");

    if (error) {
        throw error;
    }

    return data ?? [];
}

export async function createTrack(
    projectId: string,
    name: string,
    position: number,
): Promise<Track> {
    const { data, error } = await supabase
        .from("tracks")
        .insert({ project_id: projectId, name, position })
        .select("id, project_id, name, position")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function renameTrack(trackId: string, name: string): Promise<Track> {
    const { data, error } = await supabase
        .from("tracks")
        .update({ name })
        .eq("id", trackId)
        .select("id, project_id, name, position")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function deleteTrack(trackId: string): Promise<void> {
    const { error: trackError } = await supabase
        .from("tracks")
        .delete()
        .eq("id", trackId);

    if (trackError) {
        throw trackError;
    }
}

export async function getTrackBlocks(trackId: string): Promise<MidiBlock[]> {
    const { data, error } = await supabase
        .from("midi_blocks")
        .select("id, track_id, name, start_step, length_steps")
        .eq("track_id", trackId)
        .order("start_step");

    if (error) throw error;
    return data ?? [];
}

export async function createMidiBlock(
    trackId: string,
    name: string,
    startStep: number,
    lengthSteps: number,
): Promise<MidiBlock> {
    const { data, error } = await supabase
        .from("midi_blocks")
        .insert({ track_id: trackId, name, start_step: startStep, length_steps: lengthSteps })
        .select("id, track_id, name, start_step, length_steps")
        .single();

    if (error) throw error;
    return data;
}

export async function updateMidiBlock(
    blockId: string,
    changes: Partial<Pick<MidiBlock, "name" | "start_step" | "length_steps">>,
): Promise<MidiBlock> {
    const { data, error } = await supabase
        .from("midi_blocks")
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", blockId)
        .select("id, track_id, name, start_step, length_steps")
        .single();

    if (error) throw error;
    return data;
}

export async function deleteMidiBlock(blockId: string): Promise<void> {
    const { error } = await supabase
        .from("midi_blocks")
        .delete()
        .eq("id", blockId);

    if (error) throw error;
}

export async function getBlockNotes(blockId: string): Promise<NoteBlock[]> {
    const { data, error } = await supabase
        .from("notes")
        .select("id, pitch, start_step, duration, user_id")
        .eq("block_id", blockId)
        .order("start_step");

    if (error) {
        throw error;
    }

    return (data ?? []).map((note) => ({
        id: note.id,
        pitch: note.pitch,
        startStep: note.start_step,
        duration: note.duration,
        userId: note.user_id ?? undefined,
    }));
}

export async function replaceBlockNotes(
    blockId: string,
    notes: NoteBlock[],
    userId: string,
): Promise<void> {
    const { error: deleteError } = await supabase
        .from("notes")
        .delete()
        .eq("block_id", blockId);

    if (deleteError) {
        throw deleteError;
    }

    if (notes.length === 0) {
        return;
    }

    const { error: insertError } = await supabase
        .from("notes")
        .insert(
            notes.map((note) => ({
                id: note.id,
                block_id: blockId,
                pitch: note.pitch,
                start_step: note.startStep,
                duration: note.duration,
                user_id: userId,
            })),
        );

    if (insertError) {
        throw insertError;
    }
}
