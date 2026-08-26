#!/usr/bin/env python3
"""
Quick validation script for CreatorWeave skills.

Adapted from Anthropic's skill-creator for the CreatorWeave platform.
Validates SKILL.md frontmatter format including CreatorWeave-specific fields
(cw- prefix, category, tags, triggers).
"""

import json
import os
import re
import sys


def validate_skill(skill_path: str) -> tuple[bool, str]:
    """Validate a CreatorWeave skill directory.

    Checks:
    - SKILL.md exists
    - Valid YAML frontmatter
    - Required fields: name (with cw- prefix), description
    - Name is kebab-case, max 64 chars
    - Description under 1024 chars, no angle brackets
    - Optional fields: category, tags, triggers

    Args:
        skill_path: Path to the skill directory.

    Returns:
        (is_valid, message) tuple.
    """
    skill_md = os.path.join(skill_path, "SKILL.md")

    # Check SKILL.md exists
    if not os.path.exists(skill_md):
        return False, "SKILL.md not found"

    # Read content
    with open(skill_md, "r", encoding="utf-8") as f:
        content = f.read()

    # Check frontmatter
    if not content.startswith("---"):
        return False, "No YAML frontmatter found"

    # Extract frontmatter
    match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return False, "Invalid frontmatter format"

    frontmatter_text = match.group(1)

    # Parse YAML frontmatter manually (avoids pyyaml dependency in Pyodide)
    frontmatter = _parse_simple_yaml(frontmatter_text)

    if not isinstance(frontmatter, dict):
        return False, "Frontmatter must be a YAML dictionary"

    # Define allowed properties
    ALLOWED_PROPERTIES = {
        "name", "description", "category", "tags", "triggers",
        "license", "allowed-tools", "metadata", "compatibility",
    }

    # Check for unexpected properties
    unexpected_keys = set(frontmatter.keys()) - ALLOWED_PROPERTIES
    if unexpected_keys:
        return False, (
            f"Unexpected key(s) in SKILL.md frontmatter: {', '.join(sorted(unexpected_keys))}. "
            f"Allowed properties are: {', '.join(sorted(ALLOWED_PROPERTIES))}"
        )

    # Check required fields
    if "name" not in frontmatter:
        return False, "Missing 'name' in frontmatter"
    if "description" not in frontmatter:
        return False, "Missing 'description' in frontmatter"

    # Validate name
    name = frontmatter.get("name", "")
    if not isinstance(name, str):
        return False, f"Name must be a string, got {type(name).__name__}"
    name = name.strip()
    if not name:
        return False, "Name cannot be empty"

    # Check cw- prefix (recommended for CreatorWeave skills)
    if not name.startswith("cw-"):
        return False, f"Name '{name}' should have 'cw-' prefix (e.g., 'cw-my-skill')"

    # Check name part after prefix (kebab-case)
    name_part = name[3:]  # strip "cw-"
    if not re.match(r"^[a-z0-9-]+$", name_part):
        return False, (
            f"Name part '{name_part}' should be kebab-case "
            "(lowercase letters, digits, and hyphens only)"
        )
    if name_part.startswith("-") or name_part.endswith("-") or "--" in name_part:
        return False, (
            f"Name '{name}' cannot start/end with hyphen or contain consecutive hyphens"
        )
    if len(name) > 64:
        return False, f"Name is too long ({len(name)} characters). Maximum is 64 characters."

    # Validate description
    description = frontmatter.get("description", "")
    if not isinstance(description, str):
        return False, f"Description must be a string, got {type(description).__name__}"
    description = description.strip()
    if not description:
        return False, "Description cannot be empty"
    if "<" in description or ">" in description:
        return False, "Description cannot contain angle brackets (< or >)"
    if len(description) > 1024:
        return False, f"Description is too long ({len(description)} characters). Maximum is 1024 characters."

    # Validate category (optional)
    category = frontmatter.get("category", "")
    if category and not isinstance(category, str):
        return False, f"Category must be a string, got {type(category).__name__}"

    # Validate tags (optional)
    tags = frontmatter.get("tags")
    if tags is not None:
        if not isinstance(tags, list):
            return False, f"Tags must be an array, got {type(tags).__name__}"

    # Validate triggers (optional)
    triggers = frontmatter.get("triggers")
    if triggers is not None:
        if not isinstance(triggers, dict):
            return False, f"Triggers must be an object, got {type(triggers).__name__}"
        if "keywords" in triggers:
            if not isinstance(triggers["keywords"], list):
                return False, "triggers.keywords must be an array"

    # Validate compatibility (optional)
    compatibility = frontmatter.get("compatibility", "")
    if compatibility:
        if not isinstance(compatibility, str):
            return False, f"Compatibility must be a string, got {type(compatibility).__name__}"
        if len(compatibility) > 500:
            return False, f"Compatibility is too long ({len(compatibility)} characters). Maximum is 500 characters."

    # Check SKILL.md body is not empty
    body_match = re.match(r"^---\n.*?\n---\s*\n?(.*)", content, re.DOTALL)
    if body_match:
        body = body_match.group(1).strip()
        if not body:
            return False, "SKILL.md body is empty — skill must contain instructions"

    return True, "Skill is valid! ✅"


def _parse_simple_yaml(text: str) -> dict:
    """Simple YAML parser for frontmatter.

    Handles: string values, arrays, and nested objects (one level).
    Does NOT handle: numbers, booleans, complex nesting, multiline strings with |.

    This avoids the pyyaml dependency for Pyodide compatibility.
    """
    result = {}
    lines = text.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Skip empty lines and comments
        if not stripped or stripped.startswith("#"):
            i += 1
            continue

        # Key: value
        if ":" in stripped and not stripped.startswith("-"):
            key, _, value = stripped.partition(":")
            key = key.strip()
            value = value.strip()

            if not value:
                # Could be an array or object on next lines
                # Peek at next line
                if i + 1 < len(lines):
                    next_line = lines[i + 1]
                    if next_line.strip().startswith("- "):
                        # Array
                        arr = []
                        j = i + 1
                        while j < len(lines):
                            item_line = lines[j]
                            if item_line.strip().startswith("- "):
                                item_val = item_line.strip()[2:].strip()
                                # Strip quotes
                                item_val = item_val.strip('"').strip("'")
                                arr.append(item_val)
                                j += 1
                            else:
                                break
                        result[key] = arr
                        i = j
                        continue
                    elif ":" in next_line and next_line.startswith("  "):
                        # Nested object
                        obj = {}
                        j = i + 1
                        while j < len(lines):
                            obj_line = lines[j]
                            if obj_line.startswith("  ") and ":" in obj_line:
                                obj_key, _, obj_val = obj_line.strip().partition(":")
                                obj_val = obj_val.strip().strip('"').strip("'")
                                if obj_val:
                                    # Could be array inline like [a, b, c]
                                    if obj_val.startswith("[") and obj_val.endswith("]"):
                                        items = [
                                            x.strip().strip('"').strip("'")
                                            for x in obj_val[1:-1].split(",")
                                            if x.strip()
                                        ]
                                        obj[obj_key.strip()] = items
                                    else:
                                        obj[obj_key.strip()] = obj_val
                                else:
                                    # Nested array
                                    arr = []
                                    k = j + 1
                                    while k < len(lines):
                                        sub_line = lines[k]
                                        if sub_line.strip().startswith("- ") and sub_line.startswith("    "):
                                            arr.append(sub_line.strip()[2:].strip().strip('"').strip("'"))
                                            k += 1
                                        else:
                                            break
                                    if arr:
                                        obj[obj_key.strip()] = arr
                                j += 1
                            else:
                                break
                        result[key] = obj
                        i = j
                        continue
                result[key] = ""
                i += 1
                continue
            else:
                # Inline value
                # Handle inline arrays like [a, b, c]
                if value.startswith("[") and value.endswith("]"):
                    items = [
                        x.strip().strip('"').strip("'")
                        for x in value[1:-1].split(",")
                        if x.strip()
                    ]
                    result[key] = items
                else:
                    result[key] = value.strip('"').strip("'")
                i += 1
                continue
        else:
            i += 1

    return result


def validate_skill_json(skill_path: str) -> str:
    """Validate and return result as JSON string."""
    valid, message = validate_skill(skill_path)
    return json.dumps({
        "valid": valid,
        "message": message,
        "skill_path": skill_path,
    }, indent=2)


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python quick_validate.py <skill_directory>")
        sys.exit(1)

    valid, message = validate_skill(sys.argv[1])
    print(message)
    sys.exit(0 if valid else 1)
