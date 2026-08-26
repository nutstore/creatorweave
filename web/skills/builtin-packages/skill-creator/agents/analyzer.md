# Post-hoc Analyzer Agent

Analyze results to understand WHY the winner won and generate improvement suggestions.

## Two Modes

### Mode 1: Blind Comparison Analysis

After the blind comparator determines a winner, analyze the skills and transcripts.

#### Inputs

- **winner**: "A" or "B"
- **winner_skill_path**: Path to the winning skill
- **winner_transcript_path**: Path to the winner's transcript
- **loser_skill_path**: Path to the losing skill
- **loser_transcript_path**: Path to the loser's transcript
- **comparison_result_path**: Path to the comparator's output JSON

#### Process

1. Read the comparison result
2. Read both skills (SKILL.md + key files)
3. Read both transcripts
4. Compare instruction following (score 1-10)
5. Identify winner strengths and loser weaknesses
6. Generate prioritized improvement suggestions
7. Save structured analysis to `analysis.json`

#### Output

```json
{
  "comparison_summary": {
    "winner": "A",
    "winner_skill": "path/to/winner",
    "loser_skill": "path/to/loser",
    "comparator_reasoning": "Brief summary"
  },
  "winner_strengths": ["Clear step-by-step instructions", "Validation script"],
  "loser_weaknesses": ["Vague instructions", "No validation"],
  "instruction_following": {
    "winner": {"score": 9, "issues": ["Minor: skipped optional step"]},
    "loser": {"score": 6, "issues": ["Did not use formatting template"]}
  },
  "improvement_suggestions": [
    {
      "priority": "high",
      "category": "instructions",
      "suggestion": "Replace vague instruction with explicit steps",
      "expected_impact": "Would eliminate ambiguity"
    }
  ]
}
```

### Mode 2: Benchmark Analysis

Review benchmark run results to surface patterns and anomalies.

#### Inputs

- **benchmark_data_path**: Path to benchmark.json
- **skill_path**: Path to the skill being benchmarked

#### Process

1. Read the benchmark data
2. Analyze per-assertion patterns:
   - Always pass in both configs? → may not differentiate
   - Always fail in both? → may be broken
   - Always pass with skill but fail without? → skill adds clear value
   - Highly variable? → may be flaky
3. Analyze cross-eval patterns
4. Analyze metrics patterns (time, tokens)
5. Generate freeform notes

#### Output

```json
[
  "Assertion 'Output is a PDF file' passes 100% in both configurations - may not differentiate skill value",
  "Eval 3 shows high variance (50% ± 40%) - may be flaky",
  "Without-skill runs consistently fail on table extraction expectations",
  "Skill adds 13s average execution time but improves pass rate by 50%"
]
```

## Suggestion Categories

| Category | Description |
|----------|-------------|
| `instructions` | Changes to the skill's prose instructions |
| `tools` | Scripts, templates, or utilities to add/modify |
| `examples` | Example inputs/outputs to include |
| `error_handling` | Guidance for handling failures |
| `structure` | Reorganization of skill content |
| `references` | External docs or resources to add |

## Priority Levels

- **high**: Would likely change the outcome
- **medium**: Would improve quality but may not change win/loss
- **low**: Nice to have, marginal improvement
