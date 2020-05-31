# ZIP File System

Allows the user to mount a ZIP archive as a virtual file system in the VS Code
Explorer pane by using the Mount context menu item.

![Screenshot](screenshot.png)

## To-Do

### Add tests

### Cache decompressed buffers

### Implement write actions

### Ensure tests run in the prepublish script

They do in the latest VS Code extension template for sure, so maybe update this
codebase to match the new template?

### Use the `vscode.workspace.fs` provider instead of the `fs` dependency

This is to support working with archives from virtual file systems not just disk.
