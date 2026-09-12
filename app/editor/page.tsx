import { Suspense } from "react";
import EditorPage from "./editor-page";

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
