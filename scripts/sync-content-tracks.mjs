import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const contentRoot = join(root, "content");
const tracksPath = join(contentRoot, "tracks.json");
const document = JSON.parse(readFileSync(tracksPath, "utf8"));

function walk(directory) {
    const files = [];
    for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        const information = statSync(path);
        if (information.isDirectory()) {
            files.push(...walk(path));
        } else if (path.endsWith(".json")) {
            files.push(path);
        }
    }
    return files;
}

const missions = [];
for (const directory of ["campaigns", "tracks"]) {
    for (const path of walk(join(contentRoot, directory))) {
        const mission = JSON.parse(readFileSync(path, "utf8"));
        if (typeof mission.id === "string" && Array.isArray(mission.steps)) {
            missions.push({ mission, trackId: path.split(/[\\/]/).at(-2) });
        }
    }
}

const byCourse = new Map();
for (const entry of missions) {
    const list = byCourse.get(entry.trackId) ?? [];
    list.push(entry.mission);
    byCourse.set(entry.trackId, list);
}

const newTracks = [
    {
        id: "html",
        title: "HTML foundations",
        summary: "Build semantic, accessible documents with real browser checks.",
        kind: "language",
        interests: ["web"],
    },
    {
        id: "css",
        title: "CSS foundations",
        summary: "Master the cascade, layout, responsive design, and accessible color.",
        kind: "language",
        interests: ["web"],
    },
    {
        id: "javascript",
        title: "JavaScript foundations",
        summary: "Write, test, and debug real browser programs.",
        kind: "language",
        interests: ["web"],
    },
];

for (const track of newTracks) {
    if (
        byCourse.has(track.id) &&
        !document.tracks.some(function same(trackItem) {
            return trackItem.id === track.id;
        })
    ) {
        document.tracks.push({ ...track, missionIds: [] });
    }
}

for (const track of document.tracks) {
    const courseMissions = byCourse.get(track.id) ?? [];
    courseMissions.sort(function order(left, right) {
        if (left.sequence !== right.sequence) {
            return left.sequence - right.sequence;
        }
        return left.id.localeCompare(right.id);
    });
    track.missionIds = courseMissions.map(function idOf(mission) {
        return mission.id;
    });
}

document.tracks = document.tracks.filter(function hasMissions(track) {
    return track.missionIds.length > 0;
});

writeFileSync(tracksPath, `${JSON.stringify(document, null, 4)}\n`, "utf8");
console.log(`Synced ${document.tracks.length} tracks and ${missions.length} missions.`);
