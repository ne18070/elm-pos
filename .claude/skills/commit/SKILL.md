---
name: commit
description: Stage and commit changes with a conventional commit message. Use when the user asks to commit, save changes, or checkpoint work.
---

When creating a commit:

1. Run `git status` and `git diff` to review all changes
2. Run `git log --oneline -5` to match the repo's commit style
3. Stage relevant files (never use `git add -A` blindly — exclude .env, secrets)
4. Write a conventional commit message:

Format: `<type>: <short imperative description>`

Types:
- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code change without feature/fix
- `style:` — formatting, CSS changes
- `docs:` — documentation
- `chore:` — build, config, deps
- `db:` — database migrations or schema changes

Rules:
- First line ≤ 72 characters, imperative mood ("add", "fix", "remove" not "added"/"fixes")
- No period at end
- Body (optional): explain WHY, not WHAT — the diff shows what

Example commit command:
```bash
git add renderer/app/backoffice/page.tsx services/supabase/structures.ts
git commit -m "$(cat <<'EOF'
feat: group structures tab by owner instead of by establishment

EOF
)"
```

5. Do NOT push unless the user explicitly asks to push.
