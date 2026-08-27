//! Windows platform helpers.
//!
//! Hosts the Windows-specific primitives so action modules stay readable:
//!   - `pid_alive`          — OpenProcess + GetExitCodeProcess liveness probe
//!   - `kill_tree`          — taskkill /PID <pid> /T (graceful) or /T /F (force)
//!   - `resolve_command`    — bare-name PATH×PATHEXT resolution (pnpm → pnpm.cmd)
//!   - `pick_folder_dialog` — IFileDialog COM folder picker (FOS_PICKFOLDERS)
//!   - `CommandExtNoWindow` — CREATE_NO_WINDOW so children don't flash consoles
//!
//! This module is gated `#[cfg(target_os = "windows")]` in main.rs; Unix
//! builds never see it. Rust std already wraps .cmd/.bat spawns with cmd.exe
//! (BatBadBut fix, 1.77+), so returning a .cmd path from `resolve_command`
//! is safe to spawn directly.

use std::path::{Path, PathBuf};

// ── creation flags ────────────────────────────────────────────────────────

/// CREATE_NEW_PROCESS_GROUP = 0x00000200.
/// Used by exec_start so the child can be tree-killed independently.
pub const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

/// CREATE_NO_WINDOW = 0x08000000.
/// The NM host has no console; without this every spawned console app
/// (git, pnpm, taskkill, …) would allocate and flash its own console window.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Extension trait: spawn with `CREATE_NO_WINDOW`.
pub trait CommandExtNoWindow {
    fn creation_flags_no_window(&mut self) -> &mut Self;
}

impl CommandExtNoWindow for std::process::Command {
    fn creation_flags_no_window(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt;
        CommandExt::creation_flags(self, CREATE_NO_WINDOW);
        self
    }
}

// ── pid liveness ─────────────────────────────────────────────────────────

/// Is a pid still alive?
///
/// `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` + `GetExitCodeProcess`
/// != STILL_ACTIVE. Replaces the Unix `kill(pid, 0)` probe. Conservative on
/// access-denied: a process we can't query is treated as alive so the
/// registry never reaps a live process by mistake.
pub fn pid_alive(pid: u32) -> bool {
    use windows::Win32::Foundation::{CloseHandle, GetLastError, STILL_ACTIVE, WIN32_ERROR};
    use windows::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe {
        let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(h) => h,
            Err(_) => {
                // ERROR_ACCESS_DENIED (5): process exists but is elevated /
                // protected. Treat as alive (conservative).
                return GetLastError() == WIN32_ERROR(5);
            }
        };
        let mut exit_code: u32 = 0;
        let ok = GetExitCodeProcess(handle, &mut exit_code);
        let _ = CloseHandle(handle);
        ok.is_ok() && exit_code == STILL_ACTIVE.0 as u32
    }
}

// ── process tree termination ─────────────────────────────────────────────

/// Kill a process tree. `force` escalates to a hard kill.
///
/// `taskkill /PID <pid> /T` posts WM_CLOSE (GUI) / CTRL_CLOSE_EVENT (console)
/// first — the graceful half of the SIGTERM→SIGKILL escalation; `/F`
/// force-terminates. `/T` walks the child tree via the toolhelp snapshot
/// (works regardless of process groups). taskkill lives in System32 so bare
/// name resolution is fine.
///
/// Returns `true` when taskkill exits 0.
pub fn kill_tree(pid: u32, force: bool) -> bool {
    let mut cmd = std::process::Command::new("taskkill");
    cmd.args(["/PID", &pid.to_string(), "/T"]);
    if force {
        cmd.arg("/F");
    }
    cmd.creation_flags_no_window();
    match cmd.output() {
        Ok(out) => out.status.success(),
        Err(_) => false,
    }
}

// ── command resolution (PATH × PATHEXT) ──────────────────────────────────

/// Resolve a bare command name against `PATH` + `PATHEXT`.
///
/// Windows `Command::new` resolves only `.exe`; node/pnpm/git shims are
/// `.cmd`. Mirrors Unix PATH search semantics deliberately:
///   - No path separator / drive letter → PATH-only probe (cwd NOT searched,
///     matching Unix behavior — a planted `git.cmd` in the project dir must
///     not shadow the real git).
///   - `program` already carries an extension → probe that exact name.
///   - No extension → probe `program` + each PATHEXT entry per PATH dir
///     (default `.COM;.EXE;.BAT;.CMD` when the var is unset).
///   - No hit → returned unchanged; spawn then fails with the usual
///     "command not found" error the web UI already handles.
///
/// Applied AFTER execpolicy checks (policy matches the user-facing name,
/// e.g. `pnpm`, not the resolved `...\pnpm.cmd`).
pub fn resolve_command(program: &str) -> String {
    if program.contains('/') || program.contains('\\') || program.contains(':') {
        return program.to_string();
    }

    let path_env = std::env::var("PATH").unwrap_or_default();
    let pathext = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
    let dirs: Vec<PathBuf> = path_env
        .split(';')
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .collect();

    // Exact name (with its extension) first — matches CreateProcess order.
    if Path::new(program).extension().is_some() {
        for dir in &dirs {
            let candidate = dir.join(program);
            if candidate.is_file() {
                return candidate.to_string_lossy().into_owned();
            }
        }
    } else {
        for dir in &dirs {
            for ext in pathext.split(';').filter(|s| !s.is_empty()) {
                let candidate = dir.join(format!("{program}{ext}"));
                if candidate.is_file() {
                    return candidate.to_string_lossy().into_owned();
                }
            }
        }
    }

    program.to_string()
}

// ── IFileDialog folder picker ────────────────────────────────────────────

/// Show a folder picker dialog (IFileDialog with FOS_PICKFOLDERS).
/// Returns the chosen path, or None on cancel/failure.
///
/// Thread model: the NM host is a single-threaded CLI process; we
/// CoInitializeEx(STA) on this thread, run the modal dialog (blocks until
/// the user decides), then CoUninitialize if we initialized.
pub fn pick_folder_dialog() -> Option<PathBuf> {
    use windows::Win32::Foundation::{S_FALSE, S_OK};
    use windows::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED,
    };
    use windows::core::HRESULT;

    unsafe {
        // S_OK (first init) or S_FALSE (already initialized) — both success.
        let hr: HRESULT = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if hr != S_OK && hr != S_FALSE {
            eprintln!("[cw-native-host] pick_folder: CoInitializeEx failed: {}", hr.0);
            return None;
        }
        let need_uninit = hr == S_OK;

        let result = pick_folder_dialog_inner();

        if need_uninit {
            CoUninitialize();
        }
        result
    }
}

unsafe fn pick_folder_dialog_inner() -> Option<PathBuf> {
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
    use windows::Win32::UI::Shell::{
        FileOpenDialog, IFileOpenDialog, FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
    };

    let dialog: IFileOpenDialog =
        match CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[cw-native-host] pick_folder: CoCreateInstance failed: {e}");
                return None;
            }
        };

    // Folder-only picker over the real filesystem.
    let mut options = dialog.GetOptions().unwrap_or_default();
    options |= FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM;
    if let Err(e) = dialog.SetOptions(options) {
        eprintln!("[cw-native-host] pick_folder: SetOptions failed: {e}");
        return None;
    }

    // Modal — blocks until the user picks or cancels. ERROR_CANCELLED comes
    // back as 0x800704C5; treat any non-OK as cancellation.
    if dialog.Show(None).is_err() {
        return None;
    }

    let item = match dialog.GetResult() {
        Ok(item) => item,
        Err(_) => return None,
    };

    let path = match item.GetDisplayName(SIGDN_FILESYSPATH) {
        Ok(p) => p.to_string().ok()?,
        Err(_) => return None,
    };

    Some(PathBuf::from(path))
}

#[cfg(test)]
mod tests {
    use super::*;

    // PATH is process-global; serialize tests that mutate it.
    static PATH_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn resolve_command_leaves_paths_alone() {
        assert_eq!(resolve_command(r"C:\Tools\pnpm.cmd"), r"C:\Tools\pnpm.cmd");
        assert_eq!(resolve_command("./local/tool"), "./local/tool");
        assert_eq!(resolve_command(r"sub\dir\run"), r"sub\dir\run");
    }

    #[test]
    fn resolve_command_finds_cmd_shim() {
        let _guard = PATH_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = std::env::temp_dir().join(format!("cw-resolve-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("faketool.cmd"), "@echo off\r\n").unwrap();

        let old = std::env::var("PATH").unwrap_or_default();
        unsafe {
            std::env::set_var("PATH", dir.to_str().unwrap());
        }
        let resolved = resolve_command("faketool");
        unsafe {
            std::env::set_var("PATH", &old);
        }
        assert!(
            resolved.to_lowercase().ends_with("faketool.cmd"),
            "expected .cmd resolution, got: {resolved}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_command_unknown_returns_unchanged() {
        let _guard = PATH_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let old = std::env::var("PATH").unwrap_or_default();
        unsafe {
            std::env::set_var("PATH", "");
        }
        let resolved = resolve_command("definitely-not-a-real-tool-xyz");
        unsafe {
            std::env::set_var("PATH", &old);
        }
        assert_eq!(resolved, "definitely-not-a-real-tool-xyz");
    }

    #[test]
    fn pid_alive_for_current_and_bogus() {
        assert!(pid_alive(std::process::id()));
        assert!(!pid_alive(999_999_999));
    }
}
