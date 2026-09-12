import { supabase } from "./supabase/client";

export function login(
    email: string,
    password: string,
): ReturnType<typeof supabase.auth.signInWithPassword> {
    return supabase.auth.signInWithPassword({
        email,
        password,
    });
}

export function signup(email: string, password: string): ReturnType<typeof supabase.auth.signUp> {
    return supabase.auth.signUp({
        email,
        password,
    });
}

export function getUser(): ReturnType<typeof supabase.auth.getUser> {
    return supabase.auth.getUser();
}

export async function getUidFromEmail(email: string): Promise<string> {
    const { data, error } = await supabase.rpc("get_uid_from_email", {
        input_email: email.trim(),
    });

    if (error) {
        throw error;
    }

    if (!data) {
        throw new Error("No user was found with that email address.");
    }

    return data;
}