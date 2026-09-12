import { supabase } from "./supabase/client";
import { getUser } from "./auth";
import type { Tables } from "./supabase/supabase";

export type Project = Pick<Tables<"projects">, "id" | "name" | "description" | "bpm">;
export type ProjectMember = Pick<Tables<"profiles">, "id" | "email">;

export class ProjectAccessError extends Error {
    constructor() {
        super("You do not have access to this project.");
        this.name = "ProjectAccessError";
    }
}

export async function getProjectMembers(projectId: string, excludeUserId?: string): Promise<ProjectMember[]> {
    const { data: memberships, error: membershipError } = await supabase
        .from("project_members")
        .select("user_id")
        .eq("project_id", projectId);

    if (membershipError) {
        throw membershipError;
    }

    const userIds = (memberships ?? [])
        .map((membership) => membership.user_id)
        .filter((userId) => userId !== excludeUserId);

    if (userIds.length === 0) return [];

    const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds)
        .order("email");

    if (profileError) {
        throw profileError;
    }

    return profiles ?? [];
}

export async function getProjects(): Promise<Project[]> {
    const { data: userData, error: userError } = await getUser();

    if (userError) {
        throw userError;
    }

    if (!userData.user) {
        throw new Error("You must be signed in to view your projects.");
    }

    const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, bpm, project_members!inner(user_id)")
        .eq("project_members.user_id", userData.user.id);

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
        .select("id, name, description, bpm")
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
        .select("id, name, description, bpm")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function updateProjectBpm(id: string, bpm: number): Promise<Project> {
    const { data, error } = await supabase
        .from("projects")
        .update({ bpm })
        .eq("id", id)
        .select("id, name, description, bpm")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function deleteProject(id: string): Promise<void> {
    const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", id);

    if (error) {
        throw error;
    }
}

export async function shareProject(id: string, userId: string): Promise<void> {
    const { data: userData, error: userError } = await getUser();

    if (userError) {
        throw userError;
    }

    if (!userData.user) {
        throw new Error("You must be signed in to create a project.");
    }

    const { error: memberError } = await supabase
        .from("project_members")
        .insert({ project_id: id, user_id: userId });

    if (memberError) {
        throw memberError;
    }
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
    const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);

    if (error) {
        throw error;
    }
}

export async function loadProject(id: string): Promise<Project> {
    const { data: userData, error: userError } = await getUser();

    if (userError) {
        throw userError;
    }

    if (!userData.user) {
        throw new Error("You must be signed in to open the editor.");
    }

    const { data: membership, error: membershipError } = await supabase
        .from("project_members")
        .select("user_id")
        .eq("project_id", id)
        .eq("user_id", userData.user.id)
        .maybeSingle();

    if (membershipError) {
        throw membershipError;
    }

    if (!membership) {
        throw new ProjectAccessError();
    }

    const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, bpm")
        .eq("id", id)
        .single();

    if (error) {
        throw error;
    }

    if (!data) {
        throw new Error("Project not found.");
    }

    return data;
}
