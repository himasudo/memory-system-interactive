#!/bin/sh
# Source this file after setting "here". Each runner owns an isolated tracefs
# instance, never the global event selectors, buffer, or trace clock.
memlab_trace_setup() {
    root=/sys/kernel/tracing
    if ! mountpoint -q "$root"; then
        echo "tracefs must be mounted before running these privileged labs" >&2
        return 1
    fi
    name="memorylab-$$"
    inst="$root/instances/$name"
    (umask 077 && mkdir "$inst") || return 1
    export MEMLAB_TRACEFS="$inst"
    trap 'memlab_trace_cleanup' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
}
memlab_trace_cleanup() {
    if [ -n "${MEMLAB_TRACEFS:-}" ]; then
        # Stop own trace before dropping our instance; don't touch top-level tracing.
        printf '0\n' > "$MEMLAB_TRACEFS/tracing_on" 2>/dev/null || :
        printf '0\n' > "$MEMLAB_TRACEFS/events/enable" 2>/dev/null || :
        rmdir "$MEMLAB_TRACEFS" 2>/dev/null || :
        unset MEMLAB_TRACEFS
    fi
}
