//! `pick_folder` — show OS folder picker, authorize a new scope.
//!
//! macOS: NSOpenPanel via objc2-app-kit (localized copy).
//! Windows: IFileDialog via crate::win (STATUS.md §8.2 (1)).

use serde_json::{json, Value};

use crate::scope;

#[cfg(target_os = "macos")]
struct PickerCopy {
    title: &'static str,
    message: &'static str,
    prompt: &'static str,
}

#[cfg(target_os = "macos")]
fn picker_copy(language: &str) -> PickerCopy {
    let language = language.replace('_', "-").to_ascii_lowercase();
    if language.starts_with("zh") {
        PickerCopy {
            title: "连接本地文件夹",
            message: "选择要通过本机连接访问的文件夹",
            prompt: "连接",
        }
    } else if language.starts_with("ja") {
        PickerCopy {
            title: "ローカルフォルダーに接続",
            message: "ローカル接続でアクセスするフォルダーを選択",
            prompt: "接続",
        }
    } else if language.starts_with("ko") {
        PickerCopy {
            title: "로컬 폴더 연결",
            message: "로컬 연결로 접근할 폴더를 선택하세요",
            prompt: "연결",
        }
    } else {
        PickerCopy {
            title: "Connect Local Folder",
            message: "Choose a folder to access through the local connection",
            prompt: "Connect",
        }
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::picker_copy;

    #[test]
    fn picker_copy_uses_the_macos_primary_language() {
        let copy = picker_copy("zh-Hans-US");
        assert_eq!(copy.title, "连接本地文件夹");
        assert_eq!(copy.prompt, "连接");
    }

    #[test]
    fn picker_copy_defaults_to_english_for_unsupported_languages() {
        let copy = picker_copy("de-DE");
        assert_eq!(copy.title, "Connect Local Folder");
        assert_eq!(copy.prompt, "Connect");
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy, NSOpenPanel};
    use objc2_foundation::{MainThreadMarker, NSLocale, NSString};

    use super::picker_copy;

    /// NSModalResponseOK = 1 (AppKit enum value)
    const NS_MODAL_RESPONSE_OK: isize = 1;

    /// Show a folder picker and return the selected path, or None if cancelled.
    pub fn pick_folder() -> Option<std::path::PathBuf> {
        unsafe {
            // Native Messaging starts the host as a plain CLI process. Create an
            // AppKit application explicitly so NSOpenPanel owns a visible UI
            // context instead of opening behind the browser without activation.
            let mtm = MainThreadMarker::new()?;
            // Native Messaging hosts inherit Chrome's process locale (which can
            // be C/en_US). Query macOS's global language preference directly
            // instead, before AppKit creates the panel.
            let preferred_languages = NSLocale::preferredLanguages();
            let system_language = if preferred_languages.count() > 0 {
                preferred_languages.objectAtIndex(0).to_string()
            } else {
                "en".to_string()
            };
            let copy = picker_copy(&system_language);

            let app = NSApplication::sharedApplication(mtm);
            app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
            app.activate();

            let panel = NSOpenPanel::openPanel(mtm);
            panel.setCanChooseDirectories(true);
            panel.setCanChooseFiles(false);
            panel.setAllowsMultipleSelection(false);
            panel.setCanCreateDirectories(true);
            panel.setTitle(Some(&NSString::from_str(copy.title)));
            panel.setMessage(Some(&NSString::from_str(copy.message)));
            panel.setPrompt(Some(&NSString::from_str(copy.prompt)));

            let response = panel.runModal();

            if response == NS_MODAL_RESPONSE_OK {
                let urls = panel.URLs();
                if urls.count() == 0 {
                    return None;
                }
                let url = urls.objectAtIndex(0);
                let path = url.path().map(|s| s.to_string()).unwrap_or_default();
                if path.is_empty() {
                    None
                } else {
                    Some(std::path::PathBuf::from(path))
                }
            } else {
                None
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    #[cfg(target_os = "windows")]
    pub fn pick_folder() -> Option<std::path::PathBuf> {
        // STATUS.md §8.2 (1): IFileDialog COM folder picker.
        crate::win::pick_folder_dialog()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    pub fn pick_folder() -> Option<std::path::PathBuf> {
        None
    }
}

pub fn handle(_request: &Value) -> Value {
    let path = match platform::pick_folder() {
        Some(p) => p,
        None => return json!({ "ok": true, "cancelled": true }),
    };

    let display_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "folder".to_string());

    match scope::add_scope(&path, &display_name) {
        Ok(scope_id) => json!({
            "ok": true,
            "scope_id": scope_id,
            "display_name": display_name,
        }),
        Err(e) => json!({ "ok": false, "error": format!("failed to add scope: {e}") }),
    }
}
