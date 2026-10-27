export interface AiStatus {
  mode: "local" | "mock" | "disabled";
  available: boolean;
  model: string | null;
  runtime: "ollama" | "embedded" | null;
  publicDemo: boolean;
  detail: string;
}
