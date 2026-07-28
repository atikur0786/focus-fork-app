# Git commit author (portfolio consistency)

All FocusFork commits should appear under one developer identity on GitHub:

| Field | Value |
| --- | --- |
| **Name** | Atikur Satter Mondal |
| **Email** | atikursattermondal@gmail.com |
| **GitHub** | atikur0786 |

Recent agent commits already use this author. Verify with:

```bash
git log -5 --format='%an <%ae>'
```

## For Cursor / Codex agents (do not change global git config)

Use per-command author flags when committing:

```bash
git -c user.name="Atikur Satter Mondal" -c user.email="atikursattermondal@gmail.com" commit -m "your message"
```

Or export for the session only:

```bash
export GIT_AUTHOR_NAME="Atikur Satter Mondal"
export GIT_AUTHOR_EMAIL="atikursattermondal@gmail.com"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
```

Ensure the email is added and verified on your GitHub account so commits link to your profile.

## No co-author trailers

Commits must show **only** Atikur Satter Mondal on GitHub. Do **not** add `Co-authored-by:` lines (including Cursor Agent). Set both author and committer for every commit:

```bash
GIT_AUTHOR_NAME="Atikur Satter Mondal" \
GIT_AUTHOR_EMAIL="atikursattermondal@gmail.com" \
GIT_COMMITTER_NAME="Atikur Satter Mondal" \
GIT_COMMITTER_EMAIL="atikursattermondal@gmail.com" \
git commit -m "your message"
```
