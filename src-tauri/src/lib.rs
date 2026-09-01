use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // 启动时按当前显示器的工作区自适应窗口大小，适配 Windows 缩放 (DPI)。
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    // monitor.size() 为物理像素；换算成逻辑像素以适配缩放
                    let scale = monitor.scale_factor();
                    let phys = monitor.size();
                    let logical = phys.to_logical::<u32>(scale);

                    let mut w = logical.width;
                    let mut h = logical.height;

                    // 宽度：取工作区宽度的 ~96%，上限 1440
                    w = (w as f64 * 0.96) as u32;
                    w = w.min(1440).max(900);
                    // 高度：取工作区高度的 ~92%，上限 980
                    h = (h as f64 * 0.92) as u32;
                    h = h.min(980).max(640);

                    let _ = window.set_size(tauri::LogicalSize::new(w, h));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
