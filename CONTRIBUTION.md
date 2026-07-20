# Contributing to maui

This project is spec-driven: `SPEC.md` is the source of truth for intended
behavior, `tasks/plan.md`/`tasks/todo.md` track how that behavior gets
built and verified, and the code is expected to match all three. A change
that isn't reflected in the relevant spec/plan/task doc is treated as
incomplete, even if the tests pass.

See `CLAUDE.md` for the architecture overview and day-to-day commands
(`bun test`, `bun run build`, `bun run lint`, etc.) — this document only
covers the contribution workflow itself.

## 1. Start from `SPEC.md`

Before writing code for a new feature or a behavior change:

- Check whether `SPEC.md` already describes the behavior you're about to
  build. If it doesn't, update it *first* — objective, commands, manifest
  shape, boundaries (Always do / Ask first / Never do), success criteria —
  so the spec describes the target state before any code changes it.
- If a detail depends on a specific tool's real CLI/API behavior (a native
  adapter's exact flags, a third-party tool's arguments, etc.), confirm it
  against the tool's actual docs or `--help` output before writing it into
  the spec. If it can't be confirmed, say so explicitly in `SPEC.md`'s Open
  Questions rather than guessing — this project has been burned before by
  specs written "by analogy" that turned out wrong once implemented.
- A bug fix that changes documented behavior needs a `SPEC.md` update too,
  not just a code diff — the spec should never silently drift out of sync
  with what the code actually does.

## 2. Break work into tasks in `tasks/plan.md` / `tasks/todo.md`

`tasks/plan.md` holds the phase-level structure: a short **Context**
section (why this phase exists), **Architecture decisions**, an ordered
task list, and a **Checkpoint** after each phase with concrete,
verifiable acceptance bars (usually including `bun test`/`bun run
build`/`bun run lint` all clean). `tasks/todo.md` holds one full entry per
task, in this shape:

```markdown
## Task N: Short, specific title

**Description:** What this task changes and why, naming the specific
files/functions involved.

**Acceptance criteria:**
- [ ] Concrete, testable statement of what "done" means
- [ ] ...

**Verification:**
- [ ] Specific `bun test` command(s) to run

**Dependencies:** Task references, or "None"

**Files touched:**
- `path/to/file.ts`

**Estimated scope:** Small | Medium | Large
```

Slice tasks vertically — each one should ship a complete, independently
testable capability, not a horizontal layer (e.g. not "add types" as its
own task, separate from the code that uses them). New tasks/phases are
**appended** to these files, not rewritten over — the completed task
history is intentionally kept as a record of what happened and why,
including any surprises (see below).

## 3. Implement test-first, one task at a time

For each task:

1. Read its acceptance criteria.
2. Write a failing test for the expected behavior (confirm it actually
   fails — don't assume).
3. Implement the minimum code to pass it.
4. Run the full suite, not just the new test: `bun test`.
5. Run `bun run build` and `bun run lint` — both must stay clean.
6. Commit — one commit per task, so any point in the history is a clean
   rollback. Stage only the files that task touched (plus its own
   task-status update in `tasks/plan.md`/`tasks/todo.md`), never a blanket
   `git add -A`.
7. Check off the task's acceptance criteria and its line in
   `tasks/plan.md`, and mark its heading `✅ done` in `tasks/todo.md`.

If the real outcome differs from what the task originally described — a
wrong assumption, an unplanned bug found along the way, a design detail
that changed once you actually read the code — add a **"What actually
happened"** note under the task's acceptance criteria explaining the
deviation, rather than quietly editing the description to look like it
was right all along. Several tasks in this project's history exist
specifically to correct an earlier plan's assumption once real research or
implementation proved it wrong; that record is useful, don't erase it.

## 4. Before submitting

- `bun test`, `bun run build`, and `bun run lint` all clean.
- Every acceptance criterion for the task(s) you touched is checked off in
  `tasks/todo.md`, and the corresponding line in `tasks/plan.md` is too.
- `SPEC.md` reflects the behavior as shipped, including any Open Questions
  your work resolved or newly surfaced.
- No unrelated changes swept in via a broad `git add` — check `git status`
  and the diff before committing.
