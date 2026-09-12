import { supabase } from "./supabase/client";
// import { auth } from "./auth";

export type Project = {
    id: number;
    name: string;
    description: string;
}

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
    // const { data, error } = await supabase
    //     .from("projects")
    //     .insert({
    //         name,
    //         description,
    //     })
    //     .select()
    //     .single();

    // if (error) {
    //     throw error;
    // }

    // return data;
    return new Promise((resolve) => {
        resolve({ id: 1, name, description });
    });
}

export async function updateProject(id: number, name: string, description: string): Promise<Project> {
    return new Promise((resolve) => {
        resolve({ id, name, description });
    });
}

export async function deleteProject(id: number): Promise<void> {
}

