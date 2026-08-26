"""
Skill Packager - Creates a distributable .skill file of a skill folder.

Adapted from Anthropic's skill-creator for the CreatorWeave platform.
Pyodide-compatible: uses zipfile (built-in), no argparse.

Usage:
    from scripts.package_skill import package_skill
    result = package_skill("path/to/skill-folder", "output-directory")
"""

import fnmatch
import os
import zipfile


# Patterns to exclude when packaging skills.
EXCLUDE_DIRS = {"__pycache__", "node_modules"}
EXCLUDE_GLOBS = {"*.pyc"}
EXCLUDE_FILES = {".DS_Store"}
# Directories excluded only at the skill root (not when nested deeper).
ROOT_EXCLUDE_DIRS = {"evals"}


def should_exclude(rel_path: str) -> bool:
    """Check if a path should be excluded from packaging."""
    parts = rel_path.replace("\\", "/").split("/")
    if any(part in EXCLUDE_DIRS for part in parts):
        return True
    # rel_path parts[0] is the skill folder name, parts[1] is first subdir
    if len(parts) > 1 and parts[1] in ROOT_EXCLUDE_DIRS:
        return True
    name = parts[-1]
    if name in EXCLUDE_FILES:
        return True
    return any(fnmatch.fnmatch(name, pat) for pat in EXCLUDE_GLOBS)


def _rglob_files(directory: str) -> list[str]:
    """Recursively find all files in a directory, returning relative paths."""
    files = []
    for root, dirs, filenames in os.walk(directory):
        for filename in filenames:
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, os.path.dirname(directory))
            files.append((full_path, rel_path))
    return files


def package_skill(skill_path: str, output_dir: str = None) -> str | None:
    """Package a skill folder into a .skill file (zip format).

    Args:
        skill_path: Path to the skill folder.
        output_dir: Optional output directory for the .skill file.

    Returns:
        Path to the created .skill file, or None if error.
    """
    skill_path = os.path.abspath(skill_path)

    # Validate skill folder exists
    if not os.path.exists(skill_path):
        print(f"❌ Error: Skill folder not found: {skill_path}")
        return None

    if not os.path.isdir(skill_path):
        print(f"❌ Error: Path is not a directory: {skill_path}")
        return None

    # Validate SKILL.md exists
    skill_md = os.path.join(skill_path, "SKILL.md")
    if not os.path.exists(skill_md):
        print(f"❌ Error: SKILL.md not found in {skill_path}")
        return None

    # Run validation before packaging
    print("🔍 Validating skill...")
    from scripts.quick_validate import validate_skill
    valid, message = validate_skill(skill_path)
    if not valid:
        print(f"❌ Validation failed: {message}")
        print("   Please fix the validation errors before packaging.")
        return None
    print(f"✅ {message}\n")

    # Determine output location
    skill_name = os.path.basename(skill_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    else:
        output_dir = os.getcwd()

    skill_filename = os.path.join(output_dir, f"{skill_name}.skill")

    # Create the .skill file (zip format)
    try:
        with zipfile.ZipFile(skill_filename, "w", zipfile.ZIP_DEFLATED) as zipf:
            for full_path, rel_path in _rglob_files(skill_path):
                norm_rel = rel_path.replace("\\", "/")
                if should_exclude(norm_rel):
                    print(f"  Skipped: {norm_rel}")
                    continue
                zipf.write(full_path, norm_rel)
                print(f"  Added: {norm_rel}")

        print(f"\n✅ Successfully packaged skill to: {skill_filename}")
        return skill_filename

    except Exception as e:
        print(f"❌ Error creating .skill file: {e}")
        return None
