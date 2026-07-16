# Route Script File Locking (fcntl.flock)

## Problem

Two concurrent webhook calls both read `pending.json`, both append their event, then both write back. The second write overwrites the first, losing an event.

## Solution: POSIX File Lock (fcntl.flock)

`fcntl.flock` provides an **advisory lock** — processes that check the lock will wait, processes that don't check will ignore it. All writers must use the same lock protocol.

### Pattern (workflow-dispatcher.py)

```python
import fcntl

# Open the file for reading+writing (create if not exists)
try:
    f = open(PENDING_FILE, 'r+')
except FileNotFoundError:
    f = open(PENDING_FILE, 'w+')

with f:
    fcntl.flock(f, fcntl.LOCK_EX)  # Exclusive lock — blocks other writers
    try:
        # READ
        f.seek(0)
        content = f.read()
        pending = json.loads(content) if content.strip() else {"events": []}

        # MODIFY
        pending["events"].append(event)

        # WRITE
        f.seek(0)
        json.dump(pending, f, indent=2)
        f.truncate()
        f.flush()
        os.fsync(f.fileno())
    finally:
        fcntl.flock(f, fcntl.LOCK_UN)  # Always release
```

### How It Works

- `LOCK_EX` = exclusive lock. Second process blocks at `flock()` until first releases.
- Lock is **process-bound** — if the process crashes, the kernel releases it automatically.
- `w+` mode creates the file if missing (first write ever).
- `f.truncate()` removes trailing data if new content is shorter than old content.
- `os.fsync()` flushes OS buffers to disk (crash safety, optional for JSON loseable data).

### What It DOESN'T Solve

- **Read-Modify-Write is still non-atomic.** Lock only serializes access. Two webhooks still read the file, modify their copy, and write back — but now they do it one at a time, so the second sees the first's changes.
- **Advisory lock vs mandatory lock.** `fcntl.flock` is advisory — a process that doesn't check the lock can still write. All writers must cooperate.
- **NFS/network filesystems.** `fcntl.flock` may not work reliably on NFS. For this deployment (local ext4 on RPi), it's fine.

### Why Not Atomic Rename Alone

Atomic rename (`write temp → fsync → rename`) only protects the write step. Two concurrent scripts still:
1. Both read the same file (same events)
2. Both modify their copy
3. Both write → rename → the second overwrites the first

Lock must be acquired **BEFORE the read** for it to work.

### Testing

```bash
# Simulate two concurrent webhooks
echo '{"action":"opened","issue":{"number":1},"repository":{"full_name":"test/repo"}}' | python3 route_script.py &
echo '{"action":"opened","issue":{"number":2},"repository":{"full_name":"test/repo"}}' | python3 route_script.py &
wait
python3 -c "import json; d=json.load(open('pending.json')); print(len(d['events']))"  # Should be 2
```

### Platform Portability

- **Linux**: ✅ `fcntl.flock` works on all Linux filesystems (ext4, btrfs, xfs).
- **macOS**: ✅ Works, but NFS filesystems may behave differently.
- **Windows**: ❌ `fcntl.flock` is not available. Use `portalocker` library as fallback:
  ```python
  import portalocker
  with open(PENDING_FILE, 'r+') as f:
      portalocker.lock(f, portalocker.LOCK_EX)
      # ... read/modify/write ...
  ```
