export interface AiStatus {
  mode: "local" | "mock" | "disabled";
  available: boolean;
  model: string | null;
  detail: string;
}
