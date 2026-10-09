# Restore Bundled Node.js Execution Permission

## Change
- LibreOffice extension deployment extracted bundled Node.js without its executable mode; set owner execution permission before the asynchronous status probe.

## Verification
- LibreOffice 26.8.1.1 installed the `.oxt` through `unopkg`; `unopkg list` shows the Writer extension registered.
- Writer sidebar displayed `Mendeley worker ready.` with bundled Node.js after extension extraction stripped the executable bit; startup restores it.
- Missing worker runtime showed a failure message without freezing Writer.
- Local Writer development install symlinks sidebar code/config/icon/worker to repository; Node runtime uses persistent user-local pinned Node.js.
