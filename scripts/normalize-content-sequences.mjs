import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const contentRoot = join(root, "content");
const tracksDocument = JSON.parse(readFileSync(join(contentRoot, "tracks.json"), "utf8"));
const campaignTracks = new Set(["before-code", "campus"]);

let sequence = 31;
let updated = 0;

for (const track of tracksDocument.tracks) {
    if (campaignTracks.has(track.id)) {
        continue;
    }
    const directory = join(contentRoot, "tracks", track.id);
    const names = readdirSync(directory)
        .filter(function isMission(name) {
            return name.endsWith(".json");
        })
        .sort();
    const missions = names.map(function load(name) {
        return {
            path: join(directory, name),
            value: JSON.parse(readFileSync(join(directory, name), "utf8")),
        };
    });
    missions.sort(function byCurrentSequence(left, right) {
        if (left.value.sequence !== right.value.sequence) {
            return left.value.sequence - right.value.sequence;
        }
        return left.value.id.localeCompare(right.value.id);
    });
    for (const mission of missions) {
        mission.value.courseId = track.id;
        mission.value.sequence = sequence;
        sequence += 1;
        writeFileSync(mission.path, `${JSON.stringify(mission.value, null, 4)}\n`, "utf8");
        updated += 1;
    }
}

console.log(`Normalized ${updated} track mission sequences through ${String(sequence - 1)}.`);
