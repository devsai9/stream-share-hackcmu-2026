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
