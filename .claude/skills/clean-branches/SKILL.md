---
name: clean-branches
description: Clean up local git branches marked as [gone] on the remote, including associated worktrees
disable-model-invocation: true
---

# /clean-branches — Remove stale local branches

Clean up local branches whose remote tracking branch has been deleted (`[gone]`), including removing associated worktrees (common with Windsurf/Cascade).

## Steps

1. **Fetch and prune remote refs**
   ```bash
   git fetch --prune
   ```

2. **List branches to identify [gone] status**
   ```bash
   git branch -v
   ```
   Branches with a `+` prefix have associated worktrees.

3. **List worktrees** (to identify worktrees that need removal)
   ```bash
   git worktree list
   ```

4. **Remove worktrees and delete [gone] branches**
   ```bash
   git branch -v | grep '\[gone\]' | sed 's/^[+* ]//' | awk '{print $1}' | while read branch; do
     echo "Processing branch: $branch"
     worktree=$(git worktree list | grep "\\[$branch\\]" | awk '{print $1}')
     if [ ! -z "$worktree" ] && [ "$worktree" != "$(git rev-parse --show-toplevel)" ]; then
       echo "  Removing worktree: $worktree"
       git worktree remove --force "$worktree"
     fi
     echo "  Deleting branch: $branch"
     git branch -D "$branch"
   done
   ```

5. **Verify cleanup**
   ```bash
   git branch -a
   ```
   Only `main` (and the current working branch, if any) should remain.

If no branches are marked as [gone], report that no cleanup was needed.
