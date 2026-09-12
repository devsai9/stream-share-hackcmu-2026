import { Suspense } from "react";
import type { Metadata } from "next";
import EditorPage from "./editor-page";

export const metadata: Metadata = {
    title: "WavSync / Editor",
    description: "Edit your music in real-time with WavSync.",
};

function EditorLoading() {
    return <main aria-busy="true">Loading editor...</main>;
}

export default function Page() {
    return (
        <Suspense fallback={<EditorLoading />}>
            <EditorPage />
        </Suspense>
    );
}
