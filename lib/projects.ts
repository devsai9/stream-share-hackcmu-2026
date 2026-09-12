import { supabase } from "./supabase/client";
import { getUser } from "./auth";
import type { Tables } from "./supabase/supabase";

type Project = Pick<Tables<"projects">, "id" | "name" | "description">;

export async function getProjects(): Promise<Project[]> {
    const { data, error } = await supabase
        .from("projects")
        .select("id, name, description");

    if (error) {
        throw error;
    }

    return data ?? [];
}

export async function createProject(name: string, description: string): Promise<Project> {
    const { data: userData, error: userError } = await getUser();

    if (userError) {
        throw userError;
    }

    if (!userData.user) {
        throw new Error("You must be signed in to create a project.");
    }

    const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
            id: crypto.randomUUID(),
            name,
            description,
        })
        .select("id, name, description")
        .single();

    if (projectError) {
        throw projectError;
    }

    const { error: memberError } = await supabase
        .from("project_members")
        .insert({ project_id: project.id, user_id: userData.user.id });

    if (memberError) {
        throw memberError;
    }

    return project;
}

export async function updateProject(id: string, name: string, description: string): Promise<Project> {
    const { data, error } = await supabase
        .from("projects")
        .update({ name, description })
        .eq("id", id)
        .select("id, name, description")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function shareProject(id: string, email: string): Promise<void> {
    void id;
    void email;
    throw new Error(
        "Sharing by email requires a server-side email-to-user-ID lookup. " +
        "Add a public profile table or a Supabase RPC before inserting into project_members.",
    );
}
