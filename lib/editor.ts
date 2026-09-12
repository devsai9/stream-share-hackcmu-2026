import { supabase } from "./supabase/client";
import type { Tables } from "./supabase/supabase";
import type { NoteBlock } from "../types/music";

export type Track = Pick<Tables<"tracks">, "id" | "project_id" | "name" | "position">;

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

export async function deleteTrack(trackId: string): Promise<void> {
    const { error } = await supabase
        .from("tracks")
        .delete()
        .eq("id", trackId);

    if (error) {
        throw error;
    }
}

export async function getTrackNotes(trackId: string): Promise<NoteBlock[]> {
    const { data, error } = await supabase
        .from("notes")
        .select("id, pitch, start_step, duration, user_id")
        .eq("track_id", trackId)
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

export async function replaceTrackNotes(
    trackId: string,
    notes: NoteBlock[],
    userId: string,
): Promise<void> {
    const { error: deleteError } = await supabase
        .from("notes")
        .delete()
        .eq("track_id", trackId);

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
                track_id: trackId,
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
