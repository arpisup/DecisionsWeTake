# The Daily Reflection Tree

An end-of-day reflection tool that walks an employee through a structured, deterministic conversation using a decision tree. No LLM at runtime. No free text. Same answers → same path → same reflection. Every time.

## Project Structure

```
/tree/
  reflection-tree.json        ← The tree data (41 nodes, 15 questions, 10 decisions)
  tree-diagram.md             ← Mermaid visual diagram of the full tree

/agent/
  index.html                  ← Web UI entry point
  styles.css                  ← Design system (twilight theme)
  app.js                      ← Deterministic tree-walking engine

/transcripts/
  persona-1-transcript.md     ← "The Overwhelmed Newcomer" (external/entitled/self-centric)
  persona-2-transcript.md     ← "The Quiet Leader" (internal/contributing/altrocentric)

write-up.md                   ← Design rationale (question design, branching, sources)
README.md                     ← This file
```

## Reading the Tree

Open `tree/reflection-tree.json`. The tree is an array of 41 nodes, each with:

| Field | Description |
|-------|-------------|
| `id` | Unique node identifier |
| `type` | `start`, `question`, `decision`, `reflection`, `bridge`, `summary`, `end` |
| `text` | What the employee sees. Uses `{NodeId.answer}` for interpolation. |
| `options` | Array of `{ text, signal }` — fixed choices for question nodes |
| `next` | Default next node ID (for linear flow) |
| `rules` | Routing rules for decision nodes |
| `axis` | Which psychological axis this node belongs to |

### Decision Rules

Decision nodes evaluate rules in order. Three rule types:

```json
{ "type": "answer", "nodeId": "A1_OPEN", "matches": ["Productive"], "target": "..." }
{ "type": "signal_dominant", "axis": "axis1", "value": "internal", "target": "..." }
{ "type": "last_signal", "axis": "axis2", "value": "contribution", "target": "..." }
```

### Signals

Each option can carry a signal like `"axis1:internal"`. The engine tallies these per axis. Decision nodes route based on which pole has more tallies (dominant), or fall through to `"default"` on ties.

## Running the Agent

### Option 1: Local file server (recommended)

```bash
# From the project root
npx -y serve .

# Then open http://localhost:3000/agent/
```

### Option 2: Python

```bash
python -m http.server 8000

# Then open http://localhost:8000/agent/
```

### Option 3: VS Code Live Server

Open `agent/index.html` with the Live Server extension.

> **Note:** The agent loads `../tree/reflection-tree.json` via fetch, so it needs a local server — opening the HTML file directly won't work due to CORS.

## The Three Axes

| # | Axis | Spectrum | Psychology |
|---|------|----------|------------|
| 1 | **Locus** | External ↔ Internal | Rotter's Locus of Control, Dweck's Growth Mindset |
| 2 | **Orientation** | Entitlement ↔ Contribution | Campbell's Psychological Entitlement, Organ's OCB |
| 3 | **Radius** | Self-Centric ↔ Altrocentric | Maslow's Self-Transcendence, Batson's Perspective-Taking |

## Tree Statistics

| Metric | Count |
|--------|-------|
| Total nodes | 41 |
| Question nodes | 15 |
| Decision nodes | 10 |
| Reflection nodes | 10 |
| Bridge nodes | 3 |
| Summary nodes | 1 |
| Start/End nodes | 2 |
| Options per question | 4 |
| Unique end-state combinations | 27 |
| Distinct conversation paths | 50+ |

## Key Design Principles

1. **Deterministic.** No randomness, no LLM, no ambiguity. The tree is the product.
2. **Balanced options.** Every question has equal internal/external (or equivalent) option counts — no leading.
3. **Mirror questions.** After establishing a lean, the tree flips: contributors are asked about their unmet needs; entitled-leaning respondents are asked about their unnoticed giving.
4. **Compassionate tone.** The "worst" path gets the most careful language. No judgment, no grades — just a mirror.
5. **Narrative arc.** The three axes build on each other: agency → generosity → transcendence.
