import { Route, Router } from "@solidjs/router";
import { lazy, type JSX } from "solid-js";
import { LearningProvider } from "../features/learning/learning-store.tsx";
import { HomeScreen } from "../features/learning/HomeScreen.tsx";
import { LearnScreen } from "../features/learning/LearnScreen.tsx";
import { PlacementScreen } from "../features/learning/PlacementScreen.tsx";
import { PracticeScreen } from "../features/practice/PracticeScreen.tsx";
import { WorldScreen } from "../features/world/WorldScreen.tsx";
import { ProjectsScreen } from "../features/projects/ProjectsScreen.tsx";
import { ClubScreen } from "../features/clubs/ClubScreen.tsx";
import { SettingsScreen } from "../features/settings/SettingsScreen.tsx";
import { AppShell } from "./AppShell.tsx";

const MissionScreen = lazy(function loadMissionScreen(): Promise<{ default: () => JSX.Element }> {
    return import("../features/missions/MissionScreen.tsx").then(function pick(module): { default: () => JSX.Element } {
        return { default: module.MissionScreen };
    });
});

const ProjectWorkspace = lazy(function loadProjectWorkspace(): Promise<{ default: () => JSX.Element }> {
    return import("../features/projects/ProjectWorkspace.tsx").then(function pick(module): { default: () => JSX.Element } {
        return { default: module.ProjectWorkspace };
    });
});

function NotFoundScreen(): JSX.Element {
    return (
        <main class="page page--narrow">
            <h1>Page not found</h1>
            <p class="lede">That address does not match a Praxbit screen.</p>
            <a class="button" href="/learn">
                Return to Learn
            </a>
        </main>
    );
}

export function App(): JSX.Element {
    return (
        <LearningProvider>
            <Router root={AppShell}>
                <Route path="/" component={HomeScreen} />
                <Route path="/learn" component={LearnScreen} />
                <Route path="/missions/:id" component={MissionScreen} />
                <Route path="/practice" component={PracticeScreen} />
                <Route path="/world" component={WorldScreen} />
                <Route path="/projects" component={ProjectsScreen} />
                <Route path="/projects/:id" component={ProjectWorkspace} />
                <Route path="/club" component={ClubScreen} />
                <Route path="/settings" component={SettingsScreen} />
                <Route path="/placement" component={PlacementScreen} />
                <Route path="*" component={NotFoundScreen} />
            </Router>
        </LearningProvider>
    );
}
