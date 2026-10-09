import { mkdir, writeFile } from "node:fs/promises";
import { createTextPdf } from "./pdf-fixtures.mjs";

const react = [
  "React hooks let function components use state and other React features.",
  "The useState hook stores component state, such as a counter or form input.",
  "Calling the state setter schedules a render with the updated state value.",
  "The useEffect hook synchronizes components with external systems.",
  "An effect can subscribe to events and return a cleanup function.",
  "Hooks must be called at the top level, before any conditional returns.",
  "Custom hooks share stateful logic between reusable function components.",
];
const ocean = [
  "Whales are marine mammals that breathe air at the ocean surface.",
  "Baleen whales filter tiny animals called krill from seawater.",
  "Coral reefs support many fish species in warm shallow seas.",
  "Ocean currents carry nutrients and influence marine habitats.",
  "Dolphins communicate using whistles and underwater clicks.",
  "Sea turtles migrate across oceans to reach their nesting beaches.",
  "Protecting coastal ecosystems helps marine animals thrive.",
];
const directory = new URL("../.setup-cache/retrieval-tests/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, topic] of [["phase-9-react.pdf", react], ["phase-9-ocean.pdf", ocean]]) {
  const bytes = createTextPdf([
    ["Page one: learning passages", ...topic, ...topic, ...topic].join("\n"),
    "",
    ["Page three: additional passages", ...topic, ...topic].join("\n"),
  ]);
  await writeFile(new URL(name, directory), bytes);
  console.log(`${name}: ${bytes.length} bytes (generated disposable fixture)`);
}
