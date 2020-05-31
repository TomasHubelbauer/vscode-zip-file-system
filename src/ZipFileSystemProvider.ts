import * as vscode from 'vscode';
import * as JSZip from 'jszip';

export default class ZipFileSystemProvider implements vscode.FileSystemProvider {
  private emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.emitter.event;

  public watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
    return new class {
      dispose() {
        debugger;
      }
    };
  }

  public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const archiveUri = vscode.Uri.parse(uri.query);
    const archive = await this.parse(archiveUri);
    const { ctime, mtime, size } = await vscode.workspace.fs.stat(archiveUri);

    // Trim the leading zero to meet the format used by JSZip
    const path = uri.path.slice('/'.length);

    if (!path) {
      return { type: vscode.FileType.Directory, ctime, mtime, size };
    }

    // Look for directory first (JSZip uses trailing slash) and file second
    const entry = archive.files[path + '/'] || archive.files[path];
    return { type: entry.dir ? vscode.FileType.Directory : vscode.FileType.File, ctime: entry.date.valueOf(), mtime: entry.date.valueOf(), size };
  }

  public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const archiveUri = vscode.Uri.parse(uri.query);
    const archive = await this.parse(archiveUri);
    const entries: [string, vscode.FileType][] = [];

    // Append trailing slash to meet the format used by the archive entries
    const _path = uri.path === '/' ? uri.path : uri.path + '/';
    archive.forEach((path, entry) => {
      // Append leading slash to meet the format used by VS Code API URI
      path = '/' + path;

      // Skip the entry if it is not in the subtree of the scope
      if (!path.startsWith(_path)) {
        return;
      }

      // Cut the path to contextualize it to the current scope
      path = path.slice(_path.length, entry.dir ? -'/'.length : undefined);

      // Do not return self as own entry
      if (!path) {
        return;
      }

      // Skip the entry if it is not immediately within the scope
      if (path.includes('/')) {
        return;
      }

      entries.push([path, entry.dir ? vscode.FileType.Directory : vscode.FileType.File]);
    });

    return entries;
  }

  public createDirectory(_uri: vscode.Uri): void | Thenable<void> {
    // TODO: Report telemetry
    debugger;
  }

  public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const archiveUri = vscode.Uri.parse(uri.query);
    const zip = await this.parse(archiveUri);
    const entry = zip.file(uri.path.slice('/'.length));
    return entry.async('uint8array');
  }

  public writeFile(_uri: vscode.Uri, _content: Uint8Array, _options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
    // TODO: Report telemetry
    debugger;
  }

  public delete(_uri: vscode.Uri, _options: { recursive: boolean; }): void | Thenable<void> {
    // TODO: Report telemetry
    debugger;
  }

  public rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean; }): void | Thenable<void> {
    // TODO: Report telemetry
    debugger;
  }

  private async parse(uri: vscode.Uri): Promise<JSZip> {
    const zip = new JSZip();
    await zip.loadAsync(await vscode.workspace.fs.readFile(uri), { createFolders: true });
    return zip;
  }
}
