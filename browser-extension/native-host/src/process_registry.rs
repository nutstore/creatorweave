//! Process registry — tracks detached background processes (dev servers etc).
//!
//! STATUS.md §17: the NM host is stateless (a new process per message), so
//! background-process state must live on disk. This module owns
//! `~/.creatorweave/processes.json` plus a lock file for read-modify-write
//! serialization across concurrent host processes.
//!
//! Record lifecycle:
//!   started (spawn) → running → exited (observed dead) | stopped (we killed it)
//! Records are kept after exit for auditability; `exec_start` enforces the
//! concurrent-running cap and reuses names uniquely per scope.

use std::fs;
use std::io;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Max concurrently-running managed processes (STATUS.md §17.1).
pub const MAX_RUNNING: usize = 10;

/// Finished records (and their log files) older than this are pruned.
pub const RETENTION_SECS: u64 = 24 * 3600;

/// Hard cap on total registry records regardless of age (running excluded).
pub const MAX_FINISHED_RECORDS: usize = 50;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcState {
    Running,
    Exited,
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessRecord {
    pub process_id: String,
    pub pid: u32,
    pub pgid: u32,
    pub command: Vec<String>,
    pub scope_id: String,
    #[serde(default)]
    pub name: Option<String>,
    pub started_at: u64,
    pub log_path: String,
    pub state: ProcState,
    #[serde(default)]
    pub exit_code: Option<i32>,
    #[serde(default)]
    pub ended_at: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProcessesFile {
    #[serde(default)]
    pub processes: Vec<ProcessRecord>,
}

pub fn registry_path() -> PathBuf {
    crate::scope::dirs_home()
        .join(".creatorweave")
        .join("processes.json")
}

pub fn logs_dir() -> PathBuf {
    crate::scope::dirs_home().join(".creatorweave").join("logs")
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Generate a process id (no external deps).
fn rand_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let pid = std::process::id();
    format!("proc_{pid:x}{nanos:08x}")
}

// ── Locking ──────────────────────────────────────────────────────────────

/// Advisory lock guard over `<registry>.lock`, held for the duration of a
/// read-modify-write cycle. Acquired with retry; gives up after `timeout`.
pub struct RegistryLock {
    _file: fs::File,
}

impl RegistryLock {
    pub fn acquire(timeout: Duration) -> io::Result<RegistryLock> {
        let lock_path = registry_path().with_extension("lock");
        if let Some(parent) = lock_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let deadline = std::time::Instant::now() + timeout;
        loop {
            match fs::OpenOptions::new()
                .create(true)
                .truncate(false)
                .write(true)
                .open(&lock_path)
            {
                Ok(file) => {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::MetadataExt;
                        // Stale lock (older than 30s with no writer) — break it.
                        if let Ok(meta) = file.metadata() {
                            let age = now_secs().saturating_sub(meta.ctime().max(0) as u64);
                            if age > 30 {
                                let _ = fs::remove_file(&lock_path);
                                continue;
                            }
                        }
                        // O_EXCL-style exclusivity: try to take a flock.
                        use std::os::unix::io::AsRawFd;
                        let rc = unsafe { libc_flock(file.as_raw_fd()) };
                        if rc == 0 {
                            return Ok(RegistryLock { _file: file });
                        }
                    }
                    #[cfg(windows)]
                    {
                        // STATUS.md §8.2 (3): LockFileEx exclusive + fail-fast,
                        // same retry/timeout loop as Unix flock. No stale-lock
                        // breaking needed: the OS releases the lock when the
                        // owning (crashed) process's handle is closed.
                        use std::os::windows::io::AsRawHandle;
                        if lock_file_exclusive(file.as_raw_handle()) {
                            return Ok(RegistryLock { _file: file });
                        }
                    }
                }
                Err(e) => return Err(e),
            }
            if std::time::Instant::now() > deadline {
                return Err(io::Error::new(
                    io::ErrorKind::WouldBlock,
                    "process registry lock timeout",
                ));
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }
}

#[cfg(unix)]
unsafe fn libc_flock(fd: i32) -> i32 {
    // flock(2) via libc; LOCK_EX = 2, LOCK_NB = 4 on macOS/Linux.
    extern "C" {
        fn flock(fd: i32, operation: i32) -> i32;
    }
    flock(fd, 2 | 4) // LOCK_EX | LOCK_NB
}

/// STATUS.md §8.2 (3): LockFileEx(LOCKFILE_EXCLUSIVE_LOCK |
/// LOCKFILE_FAIL_IMMEDIATELY) over the whole file (offsets 0..u32::MAX).
#[cfg(windows)]
fn lock_file_exclusive(handle: std::os::windows::io::RawHandle) -> bool {
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Storage::FileSystem::{
        LockFileEx, LOCKFILE_EXCLUSIVE_LOCK, LOCKFILE_FAIL_IMMEDIATELY,
    };

    let handle = HANDLE(handle as _);
    unsafe {
        LockFileEx(
            handle,
            LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY,
            None,
            u32::MAX,
            u32::MAX,
            std::ptr::null_mut(),
        )
        .is_ok()
    }
}

// ── Registry operations (all take the lock for write paths) ──────────────

fn load_unlocked() -> ProcessesFile {
    match fs::read_to_string(registry_path()) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => ProcessesFile::default(),
    }
}

fn save_unlocked(file: &ProcessesFile) -> io::Result<()> {
    let path = registry_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    // Write via temp + rename for atomicity.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(file)?)?;
    fs::rename(&tmp, &path)
}

/// Read-only snapshot (no lock needed).
pub fn load() -> ProcessesFile {
    load_unlocked()
}

/// Is a pid still alive? Unix: kill(pid, 0) probe. Windows: OpenProcess +
/// GetExitCodeProcess (STATUS.md §8.2 (2)).
pub fn pid_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // kill -0 semantics via std: not available; call libc kill directly.
        extern "C" {
            fn kill(pid: i32, sig: i32) -> i32;
        }
        unsafe { kill(pid as i32, 0) == 0 }
    }
    #[cfg(windows)]
    {
        crate::win::pid_alive(pid)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        false
    }
}

/// Find a record by process_id or by (scope_id, name).
pub fn find(file: &ProcessesFile, process_id: &str, name: &str, scope_id: &str) -> Option<ProcessRecord> {
    file.processes
        .iter()
        .rev() // latest first (name reuse)
        .find(|p| {
            if !process_id.is_empty() {
                p.process_id == process_id
            } else if !name.is_empty() {
                p.name.as_deref() == Some(name) && (scope_id.is_empty() || p.scope_id == scope_id)
            } else {
                false
            }
        })
        .cloned()
}

pub struct StartParams {
    pub pid: u32,
    pub pgid: u32,
    pub command: Vec<String>,
    pub scope_id: String,
    pub name: Option<String>,
    pub log_path: String,
}

/// Register a newly spawned detached process. Enforces the running cap and
/// name-uniqueness; returns the generated process_id or an error message.
pub fn register(params: StartParams) -> Result<String, String> {
    let _lock = RegistryLock::acquire(Duration::from_secs(5))
        .map_err(|e| format!("registry lock: {e}"))?;
    let mut file = load_unlocked();

    let running: Vec<&ProcessRecord> = file
        .processes
        .iter()
        .filter(|p| matches!(p.state, ProcState::Running) && pid_alive(p.pid))
        .collect();
    if running.len() >= MAX_RUNNING {
        let list = running
            .iter()
            .map(|p| {
                format!(
                    "{} ({})",
                    p.name.clone().unwrap_or_else(|| p.process_id.clone()),
                    p.command.join(" ")
                )
            })
            .collect::<Vec<_>>()
            .join("; ");
        return Err(format!("max {MAX_RUNNING} running processes exceeded; currently running: {list}"));
    }

    // Name uniqueness among running procs in the same scope.
    if let Some(name) = &params.name {
        let clash = file.processes.iter().any(|p| {
            matches!(p.state, ProcState::Running)
                && pid_alive(p.pid)
                && p.name.as_deref() == Some(name.as_str())
                && p.scope_id == params.scope_id
        });
        if clash {
            return Err(format!("a running process named \"{name}\" already exists in this scope"));
        }
    }

    let process_id = rand_id();
    file.processes.push(ProcessRecord {
        process_id: process_id.clone(),
        pid: params.pid,
        pgid: params.pgid,
        command: params.command,
        scope_id: params.scope_id,
        name: params.name,
        started_at: now_secs(),
        log_path: params.log_path,
        state: ProcState::Running,
        exit_code: None,
        ended_at: None,
    });
    save_unlocked(&file).map_err(|e| format!("registry save: {e}"))?;
    Ok(process_id)
}

/// Update state for a record (mark exited/stopped).
pub fn mark(process_id: &str, state: ProcState, exit_code: Option<i32>) -> Result<(), String> {
    let _lock = RegistryLock::acquire(Duration::from_secs(5))
        .map_err(|e| format!("registry lock: {e}"))?;
    let mut file = load_unlocked();
    if let Some(rec) = file
        .processes
        .iter_mut()
        .rev()
        .find(|p| p.process_id == process_id)
    {
        rec.state = state;
        rec.exit_code = exit_code;
        rec.ended_at = Some(now_secs());
        save_unlocked(&file).map_err(|e| format!("registry save: {e}"))?;
    }
    Ok(())
}

/// Patch a record's log_path (used by exec_start after log-file rename).
pub fn update_log_path(process_id: &str, log_path: &str) -> Result<(), String> {
    let _lock = RegistryLock::acquire(Duration::from_secs(5))
        .map_err(|e| format!("registry lock: {e}"))?;
    let mut file = load_unlocked();
    if let Some(rec) = file
        .processes
        .iter_mut()
        .rev()
        .find(|p| p.process_id == process_id)
    {
        rec.log_path = log_path.to_string();
        save_unlocked(&file).map_err(|e| format!("registry save: {e}"))?;
    }
    Ok(())
}

/// Refresh: flip any `running` record whose pid is dead to `exited(unknown)`,
/// then prune finished records (and their log files) past retention.
/// Best-effort; called by read paths (status/list) so stale records heal.
pub fn reap_dead() {
    let mut changed = false;
    let mut removed_logs: Vec<String> = Vec::new();
    {
        let mut file = load_unlocked();
        for p in file.processes.iter_mut() {
            if matches!(p.state, ProcState::Running) && !pid_alive(p.pid) {
                p.state = ProcState::Exited;
                p.exit_code = None;
                p.ended_at = Some(now_secs());
                changed = true;
            }
        }

        // Prune: finished records older than RETENTION_SECS, or beyond the
        // MAX_FINISHED_RECORDS cap (oldest first). Delete their log files too.
        let now = now_secs();
        let mut finished: Vec<(usize, u64)> = file
            .processes
            .iter()
            .enumerate()
            .filter(|(_, p)| matches!(p.state, ProcState::Exited | ProcState::Stopped))
            .map(|(i, p)| (i, p.ended_at.unwrap_or(p.started_at)))
            .collect();
        finished.sort_by_key(|&(_, ended)| ended);

        let mut drop_ids: Vec<String> = Vec::new();
        // Over-cap entries (oldest first).
        let over_cap = finished.len().saturating_sub(MAX_FINISHED_RECORDS);
        for &(idx, _) in finished.iter().take(over_cap) {
            if let Some(p) = file.processes.get(idx) {
                drop_ids.push(p.process_id.clone());
            }
        }
        // Age-based entries not already dropped.
        for &(idx, ended) in &finished {
            if now.saturating_sub(ended) > RETENTION_SECS {
                if let Some(p) = file.processes.get(idx) {
                    let id = p.process_id.clone();
                    if !drop_ids.contains(&id) {
                        drop_ids.push(id);
                    }
                }
            }
        }

        if !drop_ids.is_empty() {
            for p in file.processes.iter() {
                if drop_ids.contains(&p.process_id) {
                    removed_logs.push(p.log_path.clone());
                }
            }
            file.processes.retain(|p| !drop_ids.contains(&p.process_id));
            changed = true;
        }

        if changed {
            let _ = save_unlocked(&file);
        }
    }
    // Remove pruned log files (best-effort, outside the lock-guarded scope).
    for log in removed_logs {
        let _ = fs::remove_file(&log);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // NOTE: the default test env points at the user's real ~/.creatorweave.
    // Tests redirect via HOME; a mutex serializes them because HOME is
    // process-global and rust runs test threads concurrently.
    static HOME_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn fresh_home(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cw-proc-reg-test-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn with_home<F: FnOnce()>(tag: &str, f: F) {
        let _guard = HOME_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let home = fresh_home(tag);
        let old = std::env::var("HOME").ok();
        unsafe { std::env::set_var("HOME", &home) };
        f();
        if let Some(o) = old {
            unsafe { std::env::set_var("HOME", o) }
        }
        let _ = fs::remove_dir_all(&home);
    }

    fn rec(pid: u32, name: Option<&str>, scope: &str) -> StartParams {
        StartParams {
            pid,
            pgid: pid,
            command: vec!["sleep".into(), "100".into()],
            scope_id: scope.into(),
            name: name.map(|s| s.into()),
            log_path: "/tmp/x.log".into(),
        }
    }

    #[test]
    fn register_and_find() {
        with_home("reg-find", || {
            let id = register(rec(9_999_001, Some("web"), "scope_a")).unwrap();
            let file = load();
            let found = find(&file, &id, "", "").unwrap();
            assert_eq!(found.name.as_deref(), Some("web"));
            assert!(matches!(found.state, ProcState::Running));
            assert_eq!(found.command, vec!["sleep", "100"]);
        });
    }

    #[test]
    fn name_clash_rejected() {
        with_home("name-clash", || {
            // Pretend both are alive by using our own pid.
            let my_pid = std::process::id();
            register(rec(my_pid, Some("web"), "scope_a")).unwrap();
            let err = register(rec(my_pid, Some("web"), "scope_a")).unwrap_err();
            assert!(err.contains("already exists"), "unexpected: {err}");
        });
    }

    #[test]
    fn cap_enforced() {
        with_home("cap", || {
            let my_pid = std::process::id();
            for i in 0..MAX_RUNNING {
                register(rec(my_pid, Some(&format!("p{i}")), "scope_a")).unwrap();
            }
            let err = register(rec(my_pid, Some("overflow"), "scope_a")).unwrap_err();
            assert!(err.contains("exceeded"), "unexpected: {err}");
        });
    }

    #[test]
    fn mark_and_reap() {
        with_home("mark-reap", || {
            let dead_pid = 999_999_999; // not alive
            let id = register(rec(dead_pid, Some("gone"), "scope_a")).unwrap();
            reap_dead();
            let file = load();
            let found = find(&file, &id, "", "").unwrap();
            assert!(matches!(found.state, ProcState::Exited));

            let id2 = register(rec(std::process::id(), Some("live"), "scope_a")).unwrap();
            mark(&id2, ProcState::Stopped, Some(0)).unwrap();
            let file = load();
            let found2 = find(&file, &id2, "", "").unwrap();
            assert!(matches!(found2.state, ProcState::Stopped));
            assert_eq!(found2.exit_code, Some(0));
        });
    }

    #[test]
    fn prune_old_finished_records_and_logs() {
        with_home("prune", || {
            // Seed registry directly with an old finished record + existing log file.
            let log_dir = logs_dir();
            fs::create_dir_all(&log_dir).unwrap();
            let old_log = log_dir.join("proc_old.log");
            fs::write(&old_log, "old").unwrap();

            let mut file = load_unlocked();
            file.processes.push(ProcessRecord {
                process_id: "proc_old".into(),
                pid: 1, pgid: 1,
                command: vec!["x".into()],
                scope_id: "scope_a".into(),
                name: Some("old".into()),
                started_at: now_secs().saturating_sub(RETENTION_SECS + 100),
                log_path: old_log.to_string_lossy().into_owned(),
                state: ProcState::Stopped,
                exit_code: Some(0),
                ended_at: Some(now_secs().saturating_sub(RETENTION_SECS + 100)),
            });
            // A fresh finished record stays.
            file.processes.push(ProcessRecord {
                process_id: "proc_fresh".into(),
                pid: 2, pgid: 2,
                command: vec!["y".into()],
                scope_id: "scope_a".into(),
                name: Some("fresh".into()),
                started_at: now_secs(),
                log_path: "/nonexistent/fresh.log".into(),
                state: ProcState::Stopped,
                exit_code: Some(0),
                ended_at: Some(now_secs()),
            });
            save_unlocked(&file).unwrap();

            reap_dead();

            let file = load_unlocked();
            let ids: Vec<&str> = file.processes.iter().map(|p| p.process_id.as_str()).collect();
            assert!(!ids.contains(&"proc_old"), "old record should be pruned: {ids:?}");
            assert!(ids.contains(&"proc_fresh"), "fresh record should stay: {ids:?}");
            assert!(!old_log.exists(), "old log file should be deleted");
        });
    }

    #[test]
    fn prune_over_cap() {
        with_home("prune-cap", || {
            let mut file = load_unlocked();
            for i in 0..(MAX_FINISHED_RECORDS + 5) {
                file.processes.push(ProcessRecord {
                    process_id: format!("proc_{i}"),
                    pid: (i + 1) as u32, pgid: (i + 1) as u32,
                    command: vec!["x".into()],
                    scope_id: "scope_a".into(),
                    name: Some(format!("p{i}")),
                    started_at: 1000 + i as u64,
                    log_path: "/nonexistent".into(),
                    state: ProcState::Exited,
                    exit_code: Some(0),
                    ended_at: Some(1000 + i as u64),
                });
            }
            save_unlocked(&file).unwrap();

            reap_dead();

            let file = load_unlocked();
            assert!(file.processes.len() <= MAX_FINISHED_RECORDS, "cap not enforced: {}", file.processes.len());
            // Oldest evicted first.
            let ids: Vec<&str> = file.processes.iter().map(|p| p.process_id.as_str()).collect();
            assert!(!ids.contains(&"proc_0"), "oldest should be evicted: {ids:?}");
        });
    }
}
