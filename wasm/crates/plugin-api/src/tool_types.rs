//! Tool system types for WASM Agent tools.
//!
//! Plugins that implement the Tool ABI can be invoked as Agent tools,
//! receiving structured inputs and returning structured outputs.

use serde::{Deserialize, Serialize};

//=============================================================================
// Tool Schema (returned by get_tool_schema)
//=============================================================================

/// JSON Schema property definition (subset of JSON Schema)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSchemaProperty {
    /// Property type
    #[serde(rename = "type")]
    pub prop_type: String,

    /// Property description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Allowed enum values
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "enum")]
    pub enum_values: Option<Vec<String>>,

    /// Array item schema
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<Box<ToolSchemaProperty>>,

    /// Default value
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<serde_json::Value>,
}

/// Tool parameter schema (JSON Schema object type)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolParameterSchema {
    /// Always "object"
    #[serde(rename = "type")]
    pub schema_type: String,

    /// Property definitions
    pub properties: std::collections::HashMap<String, ToolSchemaProperty>,

    /// Required property names
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
}

/// Complete tool schema returned by `get_tool_schema()`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSchema {
    /// Tool name (unique identifier, e.g., "my_custom_tool")
    pub name: String,

    /// Human-readable description of what this tool does
    pub description: String,

    /// Parameter definitions in JSON Schema format
    pub parameters: ToolParameterSchema,
}

//=============================================================================
// Tool Input/Output (used with execute_tool)
//=============================================================================

/// Input passed to `execute_tool()`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInput {
    /// Tool arguments as key-value pairs
    pub args: serde_json::Value,

    /// Working directory path (root of user-selected folder)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
}

/// Output returned by `execute_tool()`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutput {
    /// Whether execution succeeded
    pub success: bool,

    /// Result content (text or structured data)
    pub result: String,

    /// Error message if success is false
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ToolOutput {
    /// Create a successful output
    pub fn ok(result: String) -> Self {
        Self {
            success: true,
            result,
            error: None,
        }
    }

    /// Create an error output
    pub fn err(error: String) -> Self {
        Self {
            success: false,
            result: String::new(),
            error: Some(error),
        }
    }
}

//=============================================================================
// Builder Patterns
//=============================================================================

/// Builder for constructing ToolSchema
pub struct ToolSchemaBuilder {
    name: String,
    description: String,
    properties: std::collections::HashMap<String, ToolSchemaProperty>,
    required: Vec<String>,
}

impl ToolSchemaBuilder {
    pub fn new(name: &str, description: &str) -> Self {
        Self {
            name: name.to_string(),
            description: description.to_string(),
            properties: std::collections::HashMap::new(),
            required: Vec::new(),
        }
    }

    /// Add a string parameter
    pub fn string_param(mut self, name: &str, description: &str, required: bool) -> Self {
        self.properties.insert(
            name.to_string(),
            ToolSchemaProperty {
                prop_type: "string".to_string(),
                description: Some(description.to_string()),
                enum_values: None,
                items: None,
                default: None,
            },
        );
        if required {
            self.required.push(name.to_string());
        }
        self
    }

    /// Add a number parameter
    pub fn number_param(mut self, name: &str, description: &str, required: bool) -> Self {
        self.properties.insert(
            name.to_string(),
            ToolSchemaProperty {
                prop_type: "number".to_string(),
                description: Some(description.to_string()),
                enum_values: None,
                items: None,
                default: None,
            },
        );
        if required {
            self.required.push(name.to_string());
        }
        self
    }

    /// Add a boolean parameter
    pub fn boolean_param(mut self, name: &str, description: &str, required: bool) -> Self {
        self.properties.insert(
            name.to_string(),
            ToolSchemaProperty {
                prop_type: "boolean".to_string(),
                description: Some(description.to_string()),
                enum_values: None,
                items: None,
                default: None,
            },
        );
        if required {
            self.required.push(name.to_string());
        }
        self
    }

    /// Add a string enum parameter
    pub fn enum_param(
        mut self,
        name: &str,
        description: &str,
        values: &[&str],
        required: bool,
    ) -> Self {
        self.properties.insert(
            name.to_string(),
            ToolSchemaProperty {
                prop_type: "string".to_string(),
                description: Some(description.to_string()),
                enum_values: Some(values.iter().map(|v| v.to_string()).collect()),
                items: None,
                default: None,
            },
        );
        if required {
            self.required.push(name.to_string());
        }
        self
    }

    /// Add a string array parameter
    pub fn string_array_param(mut self, name: &str, description: &str, required: bool) -> Self {
        self.properties.insert(
            name.to_string(),
            ToolSchemaProperty {
                prop_type: "array".to_string(),
                description: Some(description.to_string()),
                enum_values: None,
                items: Some(Box::new(ToolSchemaProperty {
                    prop_type: "string".to_string(),
                    description: None,
                    enum_values: None,
                    items: None,
                    default: None,
                })),
                default: None,
            },
        );
        if required {
            self.required.push(name.to_string());
        }
        self
    }

    /// Build the ToolSchema
    pub fn build(self) -> ToolSchema {
        ToolSchema {
            name: self.name,
            description: self.description,
            parameters: ToolParameterSchema {
                schema_type: "object".to_string(),
                properties: self.properties,
                required: if self.required.is_empty() {
                    None
                } else {
                    Some(self.required)
                },
            },
        }
    }
}

//=============================================================================
// Tests
//=============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_schema_builder() {
        let schema = ToolSchemaBuilder::new("word_count", "Count words in a file")
            .string_param("path", "File path to analyze", true)
            .boolean_param("include_comments", "Include comments in count", false)
            .build();

        assert_eq!(schema.name, "word_count");
        assert_eq!(schema.description, "Count words in a file");
        assert_eq!(schema.parameters.schema_type, "object");
        assert_eq!(schema.parameters.properties.len(), 2);
        assert_eq!(schema.parameters.required, Some(vec!["path".to_string()]));
    }

    #[test]
    fn test_tool_schema_serialization() {
        let schema = ToolSchemaBuilder::new("test_tool", "A test tool")
            .string_param("input", "Input text", true)
            .enum_param("format", "Output format", &["json", "text"], false)
            .build();

        let json = serde_json::to_string(&schema).unwrap();
        let deserialized: ToolSchema = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test_tool");
    }

    #[test]
    fn test_tool_output_constructors() {
        let ok = ToolOutput::ok("result text".to_string());
        assert!(ok.success);
        assert_eq!(ok.result, "result text");
        assert!(ok.error.is_none());

        let err = ToolOutput::err("something went wrong".to_string());
        assert!(!err.success);
        assert!(err.result.is_empty());
        assert_eq!(err.error, Some("something went wrong".to_string()));
    }

    #[test]
    fn test_tool_input_serialization() {
        let input = ToolInput {
            args: serde_json::json!({ "path": "src/main.rs" }),
            working_dir: Some("/project".to_string()),
        };

        let json = serde_json::to_string(&input).unwrap();
        let deserialized: ToolInput = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.args["path"], "src/main.rs");
    }
}
