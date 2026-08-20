//! Scope management — maps opaque `scope_id` strings to real filesystem paths.
//!
//! Security model (STATUS.md §8):
//!   - The web page / Agent NEVER sees real disk paths — only `scope_id`.
//!   - Real path mapping lives in `~/.creatorweave/native-host-scopes.json`.
//!   - Four-layer defense:
//!     1. Extension-side action whitelist + field forwarding
//!     2. Web tool layer rejects absolute paths
//!     3. Host-side canonicalize + starts_with (this module)
//!     4. Search results re-validated against scope

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// On-disk format for the scopes file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScopeRecord {
    pub scope_id: String,
    pub path: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ScopesFile {
    pub scopes: Vec<ScopeRecord>,
}

/// Get the path to the scopes file: `~/.creatorweave/native-host-scopes.json`
pub fn scopes_file_path() -> PathBuf {
    let home = dirs_home();
    home.join(".creatorweave").join("native-host-scopes.json")
}

/// Best-effort home directory resolution.
/// Public so other modules (e.g. execpolicy) can locate `~/.creatorweave/`.
pub fn dirs_home() -> PathBuf {
    // Prefer $HOME on Unix
    if let Ok(home) = std::env::var("HOME") {
        if !home.is_empty() {
            return PathBuf::from(home);
        }
    }
    // Fallback: USERPROFILE on Windows
    if let Ok(home) = std::env::var("USERPROFILE") {
        if !home.is_empty() {
            return PathBuf::from(home);
        }
    }
    // Last resort
    PathBuf::from(".")
}

/// Load all scopes from the scopes file.
/// Returns empty list if the file doesn't exist yet.
pub fn load_scopes() -> ScopesFile {
    let path = scopes_file_path();
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => ScopesFile::default(),
    }
}

/// Save scopes to the scopes file, creating parent dirs if needed.
pub fn save_scopes(scopes: &ScopesFile) -> io::Result<()> {
    let path = scopes_file_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(scopes)?;
    fs::write(&path, json)?;
    Ok(())
}

/// Add a new scope and return its generated `scope_id`.
pub fn add_scope(path: &Path, display_name: &str) -> io::Result<String> {
    let mut scopes = load_scopes();

    // Check if this path is already scoped (return existing id)
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    for record in &scopes.scopes {
        if let Ok(existing) = PathBuf::from(&record.path).canonicalize() {
            if existing == canonical {
                return Ok(record.scope_id.clone());
            }
        }
    }

    let scope_id = format!("scope_{}", rand_id());
    scopes.scopes.push(ScopeRecord {
        scope_id: scope_id.clone(),
        path: path.to_string_lossy().into_owned(),
        display_name: display_name.to_string(),
    });
    save_scopes(&scopes)?;
    Ok(scope_id)
}

/// Remove a scope by `scope_id`.
pub fn remove_scope(scope_id: &str) -> io::Result<bool> {
    let mut scopes = load_scopes();
    let before = scopes.scopes.len();
    scopes.scopes.retain(|s| s.scope_id != scope_id);
    let removed = scopes.scopes.len() < before;
    if removed {
        save_scopes(&scopes)?;
    }
    Ok(removed)
}

/// Look up the real path for a `scope_id`.
pub fn resolve_scope_path(scope_id: &str) -> Option<PathBuf> {
    let scopes = load_scopes();
    scopes
        .scopes
        .iter()
        .find(|s| s.scope_id == scope_id)
        .map(|s| PathBuf::from(&s.path))
}

/// **Core security function**: resolve `scope_id` + `relative_path` to a safe
/// absolute path, rejecting path traversal attempts.
///
/// Returns `Ok(path)` if the resolved path is inside the scope root,
/// or `Err(message)` if traversal is detected.
pub fn resolve_safe_relative(scope_id: &str, relative_path: &str) -> Result<PathBuf, String> {
    let root = resolve_scope_path(scope_id).ok_or_else(|| {
        format!("unknown scope_id: {scope_id}")
    })?;

    // Canonicalize the root (resolves symlinks, removes .. and .)
    let canonical_root = root
        .canonicalize()
        .map_err(|e| format!("cannot canonicalize scope root {:?}: {e}", root))?;

    // Join root + relative path
    let joined = canonical_root.join(relative_path);

    // Canonicalize the joined path (may not exist yet for writes — canonicalize parent instead)
    // For safety, we check that the path does NOT escape the root via ..
    let normalized = normalize_path(&joined);

    // Verify the normalized path starts with the canonical root
    if !normalized.starts_with(&canonical_root) {
        return Err(format!(
            "path traversal detected: {:?} is outside scope root {:?}",
            normalized, canonical_root
        ));
    }

    Ok(normalized)
}

/// Normalize a path without requiring it to exist on disk.
/// Resolves `.` and `..` components lexically.
///
/// `..` at the root level is a no-op (cannot escape past root).
fn normalize_path(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        use std::path::Component;
        match component {
            Component::ParentDir => {
                // Only pop if the last component is a normal name
                // (never pop past RootDir or Prefix).
                let last_is_normal = result
                    .components()
                    .next_back()
                    .map_or(false, |c| matches!(c, Component::Normal(_)));
                if last_is_normal {
                    result.pop();
                }
                // If last is RootDir or empty, `..` is a no-op (stay at root).
            }
            Component::CurDir => {} // skip "."
            other => result.push(other.as_os_str()),
        }
    }
    result
}

/// Generate a short random ID (no external dep needed).
fn rand_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let pid = std::process::id();
    format!("{pid:x}{nanos:08x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_resolves_dotdot() {
        let p = normalize_path(&PathBuf::from("/a/b/../c"));
        assert_eq!(p, PathBuf::from("/a/c"));
    }

    #[test]
    fn normalize_resolves_dot() {
        let p = normalize_path(&PathBuf::from("/a/./b"));
        assert_eq!(p, PathBuf::from("/a/b"));
    }

    #[test]
    fn normalize_dotdot_at_root_is_noop() {
        // /a/../../etc resolves to /etc — correct lexical normalization.
        // `..` at filesystem root `/` is a no-op (can't go above `/`).
        // Scope containment is enforced separately by resolve_safe_relative()
        // via canonicalize + starts_with(scope_root), NOT by normalize_path.
        let p = normalize_path(&PathBuf::from("/a/../../etc/passwd"));
        assert_eq!(p, PathBuf::from("/etc/passwd"));
    }

    #[test]
    fn normalize_dotdot_cannot_go_above_root() {
        // Repeated `..` at root stays at root, doesn't produce nonsense.
        let p = normalize_path(&PathBuf::from("/../../../.."));
        assert_eq!(p, PathBuf::from("/"));
    }
}
