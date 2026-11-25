/// The desktop shell: one window showing the bundled web app. The app needs no native commands
/// or plugins (no IPC): storage, media and export all run in the WebView like in the browser.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running Recap Studio");
}
