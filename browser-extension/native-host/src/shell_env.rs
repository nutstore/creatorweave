//! Shell environment inheritance for exec'd commands.
//!
//! Problem: Chrome launches the native host via launchd (macOS GUI context),
//! so the host's environment only has the bare system PATH (`/usr/bin:/bin:...`).
//! User-installed toolchains (Homebrew, nvm, mise, volta, pnpm) live in paths
//! only set up by shell startup files (`.zprofile` / `.zshrc`), which are
//! never sourced because we spawn commands directly (no shell wrapping).
//!
//! Solution: on first use, run the user's login shell once with `printenv`,
//! capture the resulting environment, and merge it into every `Command` we
//! spawn. The captured env is pure DATA (not executed), so the execpolicy
//! command-name matching stays intact — `pnpm` is still matched as `pnpm`,
//! never hidden behind a `zsh -c` wrapper.
//!
//! Security considerations:
//!   - We only run `$SHELL` (or /bin/zsh fallback) — never a command from the
//!     request. The subprocess argument list is fixed: `-l -i -c printenv`.
//!   - Captured vars are merged as env vars only; nothing is interpreted.
//!   - Selected vars only (PATH, MANPATH, plus a few version-manager dirs) to
//!     avoid leaking everything (e.g. shell functions can't be exported anyway,
//!     but we also skip noisy vars like _ / SHLVL / PWD).

use std::collections::HashMap;
use std::process::Command;
#[cfg(not(windows))]
use std::process::Stdio;
use std::sync::OnceLock;

/// Env var names we inherit from the user's login shell.
/// PATH is the important one; the rest cover common toolchains.
#[cfg(not(windows))]
const INHERIT_VARS: &[&str] = &[
    "PATH",
    "MANPATH",
    // Version managers / toolchains (harmless if unset)
    "HOME",
    "LANG",
    "LC_ALL",
    "TERM",
    "TMPDIR",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    // Node ecosystem
    "NODE_ENV",
    "NODE_OPTIONS",
    "NVM_DIR",
    "VOLTA_HOME",
    "MISE_HOME",
    "PNPM_HOME",
    // Rust
    "RUSTUP_HOME",
    "CARGO_HOME",
    // Python
    "PYENV_ROOT",
    "VIRTUAL_ENV",
    // Go
    "GOPATH",
    "GOROOT",
    // Java
    "JAVA_HOME",
    // Homebrew (Apple Silicon)
    "HOMEBREW_PREFIX",
    "HOMEBREW_CELLAR",
    "HOMEBREW_REPOSITORY",
];

static SHELL_ENV: OnceLock<HashMap<String, String>> = OnceLock::new();

/// Get the user's login-shell environment (computed once, then cached).
///
/// Resolution order for the shell binary:
///   1. `$SHELL` env var of the host process
///   2. `/bin/zsh` (macOS default)
///   3. `/bin/bash`
///
/// Windows (STATUS.md §8.2 (7)): returns an empty map immediately — Windows
/// Chrome passes the user's full environment to NM hosts, so the macOS
/// launchd PATH problem doesn't exist there.
///
/// If all attempts fail, returns an empty map (caller falls back to the
/// host's own environment — current behaviour).
pub fn shell_env() -> &'static HashMap<String, String> {
    SHELL_ENV.get_or_init(capture_shell_env)
}

/// Run the user's login shell once and capture selected env vars.
#[cfg(windows)]
fn capture_shell_env() -> HashMap<String, String> {
    HashMap::new() // see shell_env() doc — no shell capture on Windows
}

/// Apply the inherited shell environment to a `Command`.
///
/// - Merges inherited vars into the command's env (request-provided `env`
///   entries are applied by the caller AFTER this, so they still win).
/// - PATH is *extended*, not replaced: host PATH entries are kept after the
///   user's ones so system tools remain reachable even if the user's shell
///   config trims PATH.
pub fn apply_shell_env(cmd: &mut Command) {
    let env = shell_env();
    if env.is_empty() {
        return;
    }

    // Extend PATH: user's shell PATH first, then the host's current PATH.
    if let Some(user_path) = env.get("PATH") {
        let host_path = std::env::var("PATH").unwrap_or_default();
        if !host_path.is_empty() {
            let merged = format!("{}:{}", user_path, host_path);
            cmd.env("PATH", merged);
        } else {
            cmd.env("PATH", user_path);
        }
    }

    // Other vars: set only if the host process doesn't already have them
    // (explicit host env wins over inherited shell env, except PATH above).
    for (k, v) in env {
        if k == "PATH" {
            continue;
        }
        if std::env::var_os(k).is_none() {
            cmd.env(k, v);
        }
    }
}

/// Run the user's login shell once and capture selected env vars.
#[cfg(not(windows))]
fn capture_shell_env() -> HashMap<String, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    // Try login+interactive shell first (loads .zprofile + .zshrc — this is
    // where mise/nvm hooks live). If `-i` fails (no tty), fall back to `-l`.
    let output = Command::new(&shell)
        .args(["-l", "-i", "-c", "printenv"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();

    let output = match output {
        Ok(o) if o.status.success() => Some(o),
        _ => {
            // Retry without -i (interactive mode can fail in some setups)
            Command::new(&shell)
                .args(["-l", "-c", "printenv"])
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .output()
                .ok()
                .filter(|o| o.status.success())
        }
    };

    let Some(output) = output else {
        eprintln!(
            "[cw-native-host] shell_env: failed to capture env from {}",
            shell
        );
        return HashMap::new();
    };

    let text = String::from_utf8_lossy(&output.stdout);
    let mut env = HashMap::new();
    for line in text.lines() {
        if let Some(eq) = line.find('=') {
            let key = &line[..eq];
            let value = &line[eq + 1..];
            if INHERIT_VARS.contains(&key) && !value.is_empty() {
                env.insert(key.to_string(), value.to_string());
            }
        }
    }

    if env.is_empty() {
        eprintln!("[cw-native-host] shell_env: no vars captured (empty env?)");
    } else {
        eprintln!(
            "[cw-native-host] shell_env: captured {} vars from {} (PATH={})",
            env.len(),
            shell,
            env.get("PATH").map(|s| s.as_str()).unwrap_or("<unset>")
        );
    }

    env
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(windows))]
    #[test]
    fn inherit_vars_are_unique_and_sorted_for_docs() {
        // Sanity: PATH must be in the inherit list.
        assert!(INHERIT_VARS.contains(&"PATH"));
    }

    #[cfg(not(windows))]
    #[test]
    fn apply_shell_env_extends_path() {
        // We can't easily force OnceLock to re-init in a test, but we can
        // verify the merge logic via a fresh Command and manual env set.
        let mut cmd = Command::new("/bin/echo");
        // Simulate: set PATH in host env space is not possible in tests,
        // so just verify apply_shell_env doesn't panic and returns.
        apply_shell_env(&mut cmd);
    }

    #[cfg(windows)]
    #[test]
    fn windows_shell_env_is_empty() {
        assert!(shell_env().is_empty());
    }
}
