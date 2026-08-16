import { invoke } from "@tauri-apps/api/core";
import type { CatalogFile, RecommendationSet } from "./catalog";
import type { DownloadJob } from "./download";
import type { LibrarySnapshot } from "./library";
import type { HardwareReport } from "./hardware";
import type { HardwareProfile } from "./profile";
import type { ChatMessage, ChatSnapshot } from "./chat";
import type { ChatTurn, RuntimeSnapshot } from "./runtime";
import type { ApiStatus, AppSettings, ExpertSettings, PerfProfile } from "./settings";

export type AppInfo = {
  name: string;
  version: string;
};

export type {
  HardwareReport,
  HardwareProfile,
  CatalogFile,
  RecommendationSet,
  AppSettings,
  DownloadJob,
  LibrarySnapshot,
  RuntimeSnapshot,
  ChatSnapshot,
};

export async function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}

export async function getHardware(): Promise<HardwareReport> {
  return invoke<HardwareReport>("get_hardware");
}

export async function getHardwareProfile(): Promise<HardwareProfile> {
  return invoke<HardwareProfile>("get_hardware_profile");
}

export async function getCatalog(): Promise<CatalogFile> {
  return invoke<CatalogFile>("get_catalog");
}

export async function getRecommendations(): Promise<RecommendationSet> {
  return invoke<RecommendationSet>("get_recommendations");
}

export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

export async function setDownloadRoot(path: string): Promise<AppSettings> {
  return invoke<AppSettings>("set_download_root", { path });
}

export async function addLibraryRoot(path: string): Promise<AppSettings> {
  return invoke<AppSettings>("add_library_root", { path });
}

export async function removeLibraryRoot(path: string): Promise<AppSettings> {
  return invoke<AppSettings>("remove_library_root", { path });
}

export async function setPerfProfile(profile: PerfProfile): Promise<AppSettings> {
  return invoke<AppSettings>("set_perf_profile", { profile });
}

export async function setExpert(expert: ExpertSettings): Promise<AppSettings> {
  return invoke<AppSettings>("set_expert", { expert });
}

export async function setThinking(enabled: boolean): Promise<AppSettings> {
  return invoke<AppSettings>("set_thinking", { enabled });
}

export async function getApiStatus(): Promise<ApiStatus> {
  return invoke<ApiStatus>("get_api_status");
}

export async function setApiEnabled(enabled: boolean): Promise<ApiStatus> {
  return invoke<ApiStatus>("set_api_enabled", { enabled });
}

export async function startDownload(
  modelId: string,
  variantId: string,
  manual = false,
): Promise<DownloadJob> {
  return invoke<DownloadJob>("start_download", { modelId, variantId, manual });
}

export async function cancelDownload(id: string): Promise<DownloadJob> {
  return invoke<DownloadJob>("cancel_download", { id });
}

export async function discardDownload(id: string): Promise<DownloadJob[]> {
  return invoke<DownloadJob[]>("discard_download", { id });
}

export async function listDownloads(): Promise<DownloadJob[]> {
  return invoke<DownloadJob[]>("list_downloads");
}

export async function listLibrary(): Promise<LibrarySnapshot> {
  return invoke<LibrarySnapshot>("list_library");
}

export async function setActiveModel(
  modelId: string,
  variantId: string,
): Promise<LibrarySnapshot> {
  return invoke<LibrarySnapshot>("set_active_model", { modelId, variantId });
}

export async function clearActiveModel(): Promise<LibrarySnapshot> {
  return invoke<LibrarySnapshot>("clear_active_model");
}

export async function removeInstalled(variantId: string): Promise<LibrarySnapshot> {
  return invoke<LibrarySnapshot>("remove_installed", { variantId });
}

export async function getRuntime(): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>("get_runtime");
}

export async function loadRuntime(): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>("load_runtime");
}

export async function unloadRuntime(): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>("unload_runtime");
}

export async function startCompletion(messages: ChatTurn[]): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>("start_completion", { messages });
}

export async function stopCompletion(): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>("stop_completion");
}

export async function listChats(): Promise<ChatSnapshot> {
  return invoke<ChatSnapshot>("list_chats");
}

export async function createChat(model?: {
  modelId?: string | null;
  modelName?: string | null;
  variantId?: string | null;
}): Promise<ChatSnapshot> {
  return invoke<ChatSnapshot>("create_chat", {
    modelId: model?.modelId ?? null,
    modelName: model?.modelName ?? null,
    variantId: model?.variantId ?? null,
  });
}

export async function openChat(id: string): Promise<ChatSnapshot> {
  return invoke<ChatSnapshot>("open_chat", { id });
}

export async function deleteChat(id: string): Promise<ChatSnapshot> {
  return invoke<ChatSnapshot>("delete_chat", { id });
}

export async function archiveChat(id: string, archived: boolean): Promise<ChatSnapshot> {
  return invoke<ChatSnapshot>("archive_chat", { id, archived });
}

export async function saveChatMessages(
  id: string | null,
  messages: ChatMessage[],
  model?: {
    modelId?: string | null;
    modelName?: string | null;
    variantId?: string | null;
  },
): Promise<ChatSnapshot> {
  return invoke<ChatSnapshot>("save_chat_messages", {
    id,
    messages,
    modelId: model?.modelId ?? null,
    modelName: model?.modelName ?? null,
    variantId: model?.variantId ?? null,
  });
}
