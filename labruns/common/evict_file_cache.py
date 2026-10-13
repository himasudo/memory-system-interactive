#!/usr/bin/env python3
"""Evict only the cache pages belonging to named files, never global drop_caches."""
import os
import sys

if not hasattr(os, "posix_fadvise") or not hasattr(os, "POSIX_FADV_DONTNEED"):
    raise SystemExit("File-specific cache eviction is unavailable on this system")
for path in sys.argv[1:]:
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
        os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)
    finally:
        os.close(fd)
