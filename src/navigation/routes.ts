export const ROUTES = [
  "machine",
  "models",
  "chat",
  "code",
  "downloads",
  "settings",
  "debug",
] as const;

export type RouteId = (typeof ROUTES)[number];

export const ROUTE_LABEL: Record<RouteId, string> = {
  machine: "Home",
  models: "Modelli",
  chat: "Chat",
  code: "Codice",
  downloads: "Download",
  settings: "Impostazioni",
  debug: "Diagnostica",
};

export const MENU_ROUTES = ["machine", "models", "downloads", "settings"] as const;
