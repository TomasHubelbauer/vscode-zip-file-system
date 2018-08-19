# Consider `onFileSystem` activation event

Would need to rework so that the scheme is `zip` and the URI contains the ZIP file path as well as the path within the ZIP file.
It's not possible to use globs or regexes with the `onFileSystem` activation event.
