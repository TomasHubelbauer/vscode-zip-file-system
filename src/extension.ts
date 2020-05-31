import * as vscode from 'vscode';
import ZipFileSystemProvider from './ZipFileSystemProvider';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.workspace.registerFileSystemProvider('zip', new ZipFileSystemProvider(), { isReadonly: true, isCaseSensitive: true }));
  context.subscriptions.push(vscode.commands.registerCommand('extension.mountZipFileSystem', (_uri: vscode.Uri) => {
    const uri = vscode.Uri.parse(`zip:/?${_uri}`);
    if (vscode.workspace.getWorkspaceFolder(uri) === undefined) {
      const name = vscode.workspace.asRelativePath(_uri, true);
      const index = vscode.workspace.workspaceFolders?.length || 0;
      const workspaceFolder: vscode.WorkspaceFolder = { uri, name, index };
      vscode.workspace.updateWorkspaceFolders(index, 0, workspaceFolder);
    }
  }));
}
