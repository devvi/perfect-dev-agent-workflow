# Offloading Obsidian Knowledge Search via delegate_task

## Problem

The `obsidian-knowledge-search` skill's multi-phase search strategy (keyword extraction → search files — covers TWO scopes: wiki/ and raw/ → read files → synthesize → write REFERENCE cache) can consume significant context when done inline — especially at `deep` depth, where 5+ keywords generate 10+ file reads and a ~230-line knowledge brief.

## Solution

Farm the full search to a subagent via `delegate_task`. The subagent gets its own context window and returns only the structured brief.

## Recipe

```javascript
delegate_task({
  context: `Working directory: <project-root>
Knowledge base paths:
  - wiki (refined): ~/workspace/Obsidian/Knowledge Ocean/wiki/ (note spaces)
  - raw (source):   ~/workspace/Obsidian/Knowledge Ocean/raw/ (note spaces)

Search priority: wiki/ first (higher signal), raw/ as fallback (source material).
BooksDigest cross-reference: if a book name matches, check wiki/<book-name>-* first.

Issue #<N> about: <brief summary of issue>
Key design elements: <list key requirements from the issue body>

The knowledge brief should help inform the PRD's Solution Comparison (section 4) and Design Intent (section 2).`,

  goal: `Search the Obsidian knowledge base (wiki/ + raw/) for game design notes related to <topic>.

1. First check for existing REFERENCE cache in docs/REFERENCE/ directory
2. Search keywords: <list 5-10 relevant keywords in Chinese + English>
3. Search wiki/ first, then raw/ as fallback if wiki yields insufficient signal
4. For any book topic matching raw/BooksDigest/, check wiki/ first for cross-referenced content
5. Read any matching files and extract relevant frameworks/patterns
6. Identify knowledge gaps (wiki coverage, raw coverage, or complete gap)
7. Write/update REFERENCE cache file at docs/REFERENCE/<topic-slug>.md
8. Return the complete knowledge brief`
})
```

## What the subagent does

1. Checks `docs/REFERENCE/` for existing cache (freshness validation per `obsidian-knowledge-search` skill)
2. Searches the knowledge base (wiki/ first for refined content, then raw/ as fallback for source material)
3. Reads matching files with `read_file`, noting scope (wiki vs raw) and raw subdirectory origin
4. Synthesizes findings into Directly Applicable / Raw Material / Knowledge Gaps sections
5. Writes/updates the REFERENCE cache file
6. Returns the structured brief

## Benefits

- **Context isolation**: 100+ search results and file reads don't pollute the main conversation
- **Parallel execution**: The subagent works while you continue code exploration
- **Self-contained**: The subagent produces the REFERENCE cache file as a side effect, so subsequent agents find it
- **Deterministic output**: The subagent always returns the knowledge brief regardless of search outcome

## Pitfalls

- The subagent gets a fresh terminal session — it does NOT inherit the project's working directory or branch state. Always pass the `workdir` context explicitly.
- The paths have spaces (`/Knowledge Ocean/wiki/`, `/Knowledge Ocean/raw/`). Pass quoted paths in the context string.
- The subagent does NOT see the main conversation history. Include all relevant context (issue body snippets, existing PRD sections, code locations) in the `context` field.
- Verify the REFERENCE cache file was actually created by checking `docs/REFERENCE/<slug>.md` after the subagent returns. Don't trust self-reports blindly.
- **Two-scope nuance**: The subagent may need extra guidance on when to search raw/. By default it should do wiki → raw. Pass the depth (standard=raw on-demand, deep=raw systematically) in the context.
- **BooksDigest double-citation**: If the subagent finds matching content in both wiki/ and raw/BooksDigest/, it should cite only the wiki/ version — BooksDigest is supplementary only.
