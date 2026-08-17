#![allow(dead_code)]

use tauri::Manager;

mod api;
mod catalog;
mod chat;
mod compatibility;
mod download;
mod hardware;
mod library;
mod runtime;
mod settings;
mod workspace;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "AInside".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(download::DownloadManager::default())
        .manage(runtime::RuntimeManager::default())
        .manage(api::ApiHub::default())
        .manage(workspace::WorkspaceHub::default())
        .setup(|app| {
            if settings::current(app.handle())
                .map(|current| current.api.enabled)
                .unwrap_or(false)
            {
                app.state::<api::ApiHub>().start(app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            hardware::get_hardware,
            hardware::get_hardware_profile,
            catalog::get_catalog,
            compatibility::get_recommendations,
            settings::get_settings,
            settings::set_download_root,
            settings::add_library_root,
            settings::remove_library_root,
            settings::set_perf_profile,
            settings::set_expert,
            settings::set_thinking,
            api::get_api_status,
            api::set_api_enabled,
            download::start_download,
            download::cancel_download,
            download::discard_download,
            download::list_downloads,
            library::list_library,
            library::set_active_model,
            library::clear_active_model,
            library::remove_installed,
            runtime::get_runtime,
            runtime::load_runtime,
            runtime::unload_runtime,
            runtime::start_completion,
            runtime::start_coding_turn,
            runtime::stop_completion,
            chat::list_chats,
            chat::create_chat,
            chat::open_chat,
            chat::delete_chat,
            chat::archive_chat,
            chat::save_chat_messages,
            chat::set_chat_workspace,
            workspace::workspace_tree,
            workspace::workspace_read,
            workspace::workspace_search,
            workspace::write::workspace_preview,
            workspace::write::workspace_apply,
            workspace::write::workspace_undo,
            workspace::write::coding_status,
            workspace::write::coding_grant,
            workspace::write::coding_revoke,
        ])
        .build(tauri::generate_context!())
        .expect("error while building AInside")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(hub) = app.try_state::<api::ApiHub>() {
                    hub.shutdown();
                }
                if let Some(runtime) = app.try_state::<runtime::RuntimeManager>() {
                    runtime.shutdown();
                }
            }
        });
}
