import { mkdir, writeFile } from "node:fs/promises";
import { createTextPdf } from "./pdf-fixtures.mjs";

// Synthetic public learning content only; no account or private PDF is read.
const topics = {
  "phase-11-react.pdf": [
    "The React training project in this handbook is named Cedar.",
    "React hooks let function components use state and other React features.",
    "The useState hook stores component state, such as a counter or form input.",
    "Calling the state setter schedules a render with the updated state value.",
    "The useEffect hook synchronizes components with external systems.",
    "An effect can subscribe to events and return a cleanup function.",
    "Hooks must be called at the top level, before any conditional returns.",
  ],
  "phase-11-ocean.pdf": [
    "The fictional marine sanctuary in this handbook is named Blue Lantern.",
    "Whales are marine mammals that breathe air at the ocean surface.",
    "Baleen whales filter tiny animals called krill from seawater.",
    "Coral reefs support many fish species in warm shallow seas.",
    "Ocean currents carry nutrients and influence marine habitats.",
    "Dolphins communicate using whistles and underwater clicks.",
    "Sea turtles migrate across oceans to reach their nesting beaches.",
  ],
};
const directory = new URL("../.setup-cache/phase-11/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, topic] of Object.entries(topics)) {
  const bytes = createTextPdf([
    ["Page one: learning handbook", ...topic, ...topic, ...topic].join("\n"), "",
    ["Page three: handbook continuation", ...topic, ...topic].join("\n"),
  ]);
  await writeFile(new URL(name, directory), bytes);
  console.log(`${name}: ${bytes.length} bytes (generated Phase 11 fixture)`);
}

