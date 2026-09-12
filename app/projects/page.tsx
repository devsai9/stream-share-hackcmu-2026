import type { Metadata } from "next";
import ProjectsPage from "./projects-page";

export const metadata: Metadata = {
    title: "WavSync / Projects",
    description: "Manage your projects in WavSync.",
};

export default function Page() {
    return <ProjectsPage />;
}
