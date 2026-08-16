export const ROUTES = [
  "machine",
  "models",
  "chat",
  "downloads",
  "settings",
] as const;

export type RouteId = (typeof ROUTES)[number];

export const ROUTE_LABEL: Record<RouteId, string> = {
  machine: "Home",
  models: "Modelli",
  chat: "Chat",
  downloads: "Download",
  settings: "Impostazioni",
};

export const MENU_ROUTES = ["machine", "models", "downloads", "settings"] as const;
