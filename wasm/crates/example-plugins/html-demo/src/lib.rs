//! HTML Demo Plugin
//!
//! This plugin demonstrates how to return custom HTML from a WASM plugin
//! for rendering in the host application's iframe.

use serde::{Deserialize, Serialize};
use serde_json::json;
use wasm_bindgen::prelude::*;

// =============================================================================
// Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInput {
    pub name: String,
    pub path: String,
    pub size: u64,
    #[serde(rename = "mimeType")]
    pub mime_type: Option<String>,
    #[serde(rename = "lastModified")]
    pub last_modified: u64,
    pub content: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOutput {
    pub path: String,
    pub status: String,
    pub data: serde_json::Value,
    #[serde(default)]
    pub error: Option<String>,
}

// =============================================================================
// Plugin Info
// =============================================================================

#[wasm_bindgen]
pub fn get_plugin_info() -> String {
    let info = json!({
        "id": "html-demo",
        "name": "HTML Demo Plugin",
        "version": env!("CARGO_PKG_VERSION"),
        "api_version": "2.0.0",
        "description": "Demonstrates custom HTML rendering in plugin output",
        "author": "CreatorWeave Team",
        "capabilities": {
            "metadata_only": false,
            "requires_content": true,
            "supports_streaming": false,
            "max_file_size": 10 * 1024 * 1024,
            "file_extensions": ["*.rs", "*.ts", "*.js", "*.py"]
        },
        "resource_limits": {
            "max_memory": 16 * 1024 * 1024,
            "max_execution_time": 5000,
            "worker_count": 1
        }
    });
    info.to_string()
}

// =============================================================================
// Process File
// =============================================================================

#[wasm_bindgen]
pub fn process_file(input_json: String) -> String {
    let file_input: FileInput = match serde_json::from_str(&input_json) {
        Ok(input) => input,
        Err(e) => {
            return json!({
                "path": "unknown",
                "status": "Error",
                "data": {},
                "error": format!("JSON parse error: {}", e)
            })
            .to_string();
        }
    };

    // Count lines in the file
    let content = file_input.content.unwrap_or_default();
    let line_count = content.iter().filter(|&&b| b == b'\n').count() as u64;
    let char_count = content.len() as u64;

    // Calculate complexity (simple heuristic)
    let complexity = if line_count > 0 {
        let braces = content.iter().filter(|&&b| b == b'{' || b == b'}').count() as u64;
        let avg_line_len = char_count / line_count;
        (braces * 2 + avg_line_len / 40) / 3
    } else {
        0
    };

    let complexity_label = match complexity {
        0..=10 => "Low",
        11..=30 => "Medium",
        _ => "High",
    };

    let complexity_badge = match complexity_label {
        "Low" => "creatorweave-badge-success",
        "Medium" => "creatorweave-badge-warning",
        _ => "creatorweave-badge-error",
    };

    let output = json!({
        "path": file_input.path,
        "status": "Success",
        "data": {
            "name": file_input.name,
            "lines": line_count,
            "chars": char_count,
            "complexity": complexity,
            "complexity_label": complexity_label,
            "complexity_badge": complexity_badge,
            "language": detect_language(&file_input.name)
        },
        "error": null
    });

    output.to_string()
}

// =============================================================================
// Finalize - Return Custom HTML
// =============================================================================

#[wasm_bindgen]
pub fn finalize(outputs_json: String) -> String {
    let outputs: Vec<FileOutput> = match serde_json::from_str(&outputs_json) {
        Ok(o) => o,
        Err(_) => {
            return error_result("Failed to parse outputs");
        }
    };

    if outputs.is_empty() {
        return error_result("No files to analyze");
    }

    // Calculate aggregates
    let total_lines: u64 = outputs
        .iter()
        .filter_map(|o| o.data["lines"].as_u64())
        .sum();

    let total_chars: u64 = outputs
        .iter()
        .filter_map(|o| o.data["chars"].as_u64())
        .sum();

    let avg_complexity = if !outputs.is_empty() {
        outputs
            .iter()
            .filter_map(|o| o.data["complexity"].as_u64())
            .sum::<u64>()
            / outputs.len() as u64
    } else {
        0
    };

    // Build custom HTML - construct piece by piece to avoid format! conflicts
    let mut html = String::from(
        r#"
<div class="creatorweave-card">
  <h3>📊 Code Analysis Results</h3>
  <p>Analyzed <strong>"#,
    );

    html.push_str(&outputs.len().to_string());
    html.push_str(r#"</strong> files with total of <strong>"#);
    html.push_str(&format_number(total_lines));
    html.push_str(
        r#"</strong> lines of code.</p>

  <div class="creatorweave-metrics">
    <div class="creatorweave-metric">
      <div class="creatorweave-metric-label">Total Files</div>
      <div class="creatorweave-metric-value">"#,
    );
    html.push_str(&outputs.len().to_string());
    html.push_str(
        r#"</div>
    </div>
    <div class="creatorweave-metric">
      <div class="creatorweave-metric-label">Total Lines</div>
      <div class="creatorweave-metric-value">"#,
    );
    html.push_str(&format_number(total_lines));
    html.push_str(
        r#"</div>
    </div>
    <div class="creatorweave-metric">
      <div class="creatorweave-metric-label">Total Chars</div>
      <div class="creatorweave-metric-value">"#,
    );
    html.push_str(&format_number(total_chars));
    html.push_str(
        r#"</div>
    </div>
    <div class="creatorweave-metric">
      <div class="creatorweave-metric-label">Avg Complexity</div>
      <div class="creatorweave-metric-value">"#,
    );
    html.push_str(&avg_complexity.to_string());
    html.push_str(
        r#"</div>
    </div>
  </div>

  <h4 style="margin-top: 20px;">File Details</h4>
  <table class="creatorweave-table">
    <thead>
      <tr>
        <th>File</th>
        <th>Lines</th>
        <th>Chars</th>
        <th>Complexity</th>
        <th>Language</th>
      </tr>
    </thead>
    <tbody>
"#,
    );

    html.push_str(&build_table_rows(&outputs));
    html.push_str(r#"
    </tbody>
  </table>

  <h4 style="margin-top: 24px;">🔌 CreatorWeave API Demo</h4>
  <p style="font-size: 13px; color: #6b7280;">Click these buttons to test the CreatorWeave Plugin API:</p>

  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 12px;">
    <!-- UI Operations -->
    <button class="creatorweave-btn creatorweave-btn-secondary" onclick="CreatorWeave.notify.toast(&quot;Hello from plugin!&quot;, &quot;success&quot;)">
      🔔 Show Toast
    </button>
    <button class="creatorweave-btn creatorweave-btn-secondary" onclick="CreatorWeave.notify.confirm(&quot;Do you want to proceed?&quot;).then(r => CreatorWeave.notify.toast(r ? &quot;Confirmed!&quot; : &quot;Cancelled&quot;, r ? &quot;success&quot; : &quot;info&quot;))">
      ❓ Confirm Dialog
    </button>
    <button class="creatorweave-btn creatorweave-btn-secondary" onclick="CreatorWeave.ui.resize(400)">
      📏 Resize Iframe
    </button>
    <button class="creatorweave-btn creatorweave-btn-secondary" onclick="CreatorWeave.ui.fullscreen()">
      🔲 Toggle Fullscreen
    </button>

    <!-- Data Operations -->
    <button class="creatorweave-btn creatorweave-btn-secondary" onclick="CreatorWeave.data.getResult().then(data => console.log(&quot;Analysis:&quot;, data))">
      📊 Get Analysis Data
    </button>
    <button class="creatorweave-btn creatorweave-btn-secondary" onclick="CreatorWeave.data.set(&quot;demoKey&quot;, {timestamp: Date.now()})">
      💾 Store Data
    </button>

    <!-- Export Operations -->
    <button class="creatorweave-btn creatorweave-btn-primary" onclick="CreatorWeave.export.json({demo: true, data: [1,2,3]}, &quot;plugin-export.json&quot;)">
      📥 Export JSON
    </button>
    <button class="creatorweave-btn creatorweave-btn-secondary" onclick="CreatorWeave.export.copy(&quot;Copied from plugin!&quot;).then(() => CreatorWeave.notify.toast(&quot;Copied!&quot;, &quot;success&quot;))">
      📋 Copy to Clipboard
    </button>
  </div>

  <p style="margin-top: 16px; font-size: 12px; color: #9ca3af;">
    Open browser console to see API responses. All CreatorWeave.* functions are available.
  </p>
</div>
"#);

    // Return PluginResult structure with HTML content in metrics
    json!({
        "summary": format!("Analyzed {} files with {} total lines", outputs.len(), total_lines),
        "filesProcessed": outputs.len(),
        "filesSkipped": 0,
        "filesWithErrors": 0,
        "metrics": {
            "render_type": "html",
            "content": html,
            "height": 600,
            "title": "Code Analysis"
        },
        "warnings": []
    })
    .to_string()
}

// =============================================================================
// Cleanup
// =============================================================================

#[wasm_bindgen]
pub fn cleanup() {
    // No-op with wasm-bindgen
}

// =============================================================================
// Helpers
// =============================================================================

fn error_result(message: &str) -> String {
    json!({
        "render_type": "html",
        "content": format!(r#"<div class="creatorweave-card" style="border-color: #fecaca; background: #fef2f2;">
  <h4 style="color: #991b1b;">⚠️ Error</h4>
  <p style="color: #b91c1c;">{}</p>
</div>"#, message),
        "height": 150
    }).to_string()
}

fn format_number(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.1}K", n as f64 / 1_000.0)
    } else {
        n.to_string()
    }
}

fn detect_language(filename: &str) -> &str {
    let lower = filename.to_lowercase();
    if lower.ends_with(".rs") {
        "Rust"
    } else if lower.ends_with(".ts") || lower.ends_with(".tsx") {
        "TypeScript"
    } else if lower.ends_with(".js") || lower.ends_with(".jsx") {
        "JavaScript"
    } else if lower.ends_with(".py") {
        "Python"
    } else if lower.ends_with(".go") {
        "Go"
    } else if lower.ends_with(".java") {
        "Java"
    } else if lower.ends_with(".c") || lower.ends_with(".h") {
        "C"
    } else if lower.ends_with(".cpp") || lower.ends_with(".hpp") || lower.ends_with(".cc") {
        "C++"
    } else if lower.ends_with(".cs") {
        "C#"
    } else if lower.ends_with(".php") {
        "PHP"
    } else if lower.ends_with(".rb") {
        "Ruby"
    } else if lower.ends_with(".swift") {
        "Swift"
    } else if lower.ends_with(".kt") || lower.ends_with(".kts") {
        "Kotlin"
    } else {
        "Unknown"
    }
}

fn build_table_rows(outputs: &[FileOutput]) -> String {
    outputs
        .iter()
        .map(|o| {
            let name = o.data["name"].as_str().unwrap_or("Unknown");
            let lines = o.data["lines"].as_u64().unwrap_or(0);
            let chars = o.data["chars"].as_u64().unwrap_or(0);
            let complexity_label = o.data["complexity_label"].as_str().unwrap_or("Unknown");
            let complexity_badge = o.data["complexity_badge"]
                .as_str()
                .unwrap_or("creatorweave-badge-info");
            let language = o.data["language"].as_str().unwrap_or("Unknown");

            format!(
                r#"
      <tr>
        <td>{}</td>
        <td>{}</td>
        <td>{}</td>
        <td><span class="creatorweave-badge {}">{}</span></td>
        <td>{}</td>
      </tr>"#,
                name,
                format_number(lines),
                format_number(chars),
                complexity_badge,
                complexity_label,
                language
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}
