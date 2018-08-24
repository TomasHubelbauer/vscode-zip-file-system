'use strict';
import * as vscode from 'vscode';
import { basename, extname, join, sep } from 'path';
import * as JSZip from 'jszip';
import * as fs from 'fs-extra';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.registerFileSystemProvider('zip', new ZipFileSystemProvider(), { isReadonly: true, isCaseSensitive: true }));
    context.subscriptions.push(vscode.commands.registerCommand('extension.mountZipFileSystem', (uri: vscode.Uri) => {
        const path = vscode.workspace.asRelativePath(uri, true);
        uri = vscode.Uri.parse(`zip:${path}`);
        const name = basename(uri.path);
        if (vscode.workspace.getWorkspaceFolder(uri) === undefined) {
            vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders!.length, 0, { uri, name });
        }
    }));
}

class ZipFileSystemProvider implements vscode.FileSystemProvider {
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
        try {
            const paths = await this.split(uri);
            if (paths === undefined) {
                return { type: vscode.FileType.Unknown, ctime: Date.now(), mtime: Date.now(), size: 0 };
            }

            const { absolutePath, relativePath } = paths;

            const zip = await this.cache(absolutePath);
            if (zip === undefined) {
                return { type: vscode.FileType.Unknown, ctime: Date.now(), mtime: Date.now(), size: 0 };
            }

            const { ctime, mtime, size } = zip;

            if (relativePath === '.') {
                return { type: vscode.FileType.Directory, ctime, mtime, size };
            }

            const entry = this.find(zip, relativePath);
            if (entry !== undefined) {
                return {
                    type: entry[1].dir ? vscode.FileType.Directory : vscode.FileType.File,
                    ctime: entry[1].date.valueOf(),
                    mtime: entry[1].date.valueOf(),
                    size: 0,
                };
            }

            return { type: vscode.FileType.Unknown, ctime: Date.now(), mtime: Date.now(), size: 0 };
        } catch (error) {
            // TODO: Send to telemetry
            debugger;
            return { type: vscode.FileType.Unknown, ctime: Date.now(), mtime: Date.now(), size: 0 };
        }
    }

    public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        try {
            const paths = await this.split(uri);
            if (paths === undefined) {
                return [];
            }

            const { absolutePath, relativePath } = paths;

            const zip = await this.cache(absolutePath);
            if (zip === undefined) {
                return [];
            }

            const entries = this.list(zip, relativePath === '.' ? '/' : relativePath);
            return entries.map(([name, entry]) => [name, entry.dir ? vscode.FileType.Directory : vscode.FileType.File] as [string, vscode.FileType]);
        } catch (error) {
            // TODO: Send to telemetry
            debugger;
            return [];
        }
    }

    public createDirectory(_uri: vscode.Uri): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        try {
            const paths = await this.split(uri);
            if (paths === undefined) {
                return Buffer.from([]);
            }

            const { absolutePath, relativePath } = paths;

            const zip = await this.cache(absolutePath);
            if (zip === undefined) {
                return Buffer.from([]);
            }

            const entry = this.find(zip, relativePath);
            if (entry === undefined) {
                throw new Error('No file');
            }

            if (entry[1].dir) {
                throw new Error('Not file');
            }

            return entry[1].async('nodebuffer', ({ /*percent, currentFile*/ }) => { });
        } catch (error) {
            // TODO: Send to telemetry
            debugger;
            return Buffer.from([]);
        }
    }

    public writeFile(_uri: vscode.Uri, _content: Uint8Array, _options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    public delete(_uri: vscode.Uri, _options: { recursive: boolean; }): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    public rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean; }): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    private break(path: string) {
        if (path.startsWith('/')) {
            // Remove leading slash from the FS path (workspace directories always start with `/`, ZIP `relativePath` never)
            path = path.slice('/'.length);
        }

        const components = path.split(/[\\/]/g);
        // Drop the trailing slash in case there is one
        if (components[components.length - 1] === '') {
            components.pop();
        }

        return components;
    }

    // TODO: Make this work with workspace directories with multi-component names
    private async split(uri: vscode.Uri): Promise<{ absolutePath: string; relativePath: string; } | undefined> {
        // Verify we are operating within a workspace (need workspace root to derive the email file path)
        if (vscode.workspace.workspaceFolders === undefined) {
            return;
        }

        const absolutePart = this.break(vscode.workspace.workspaceFolders[0].uri.path);
        const relativePart = this.break(uri.path);

        // Verify the ZIP file is in the workspace root directory, we don't support it being elsewhere yet
        if (absolutePart.pop() /* Workspace directory name */ !== relativePart[0]) {
            // TODO: Send to telemetry to gauge interest in non-root directory support
            return;
        }

        let filePath = '';
        const components = [...absolutePart, ...relativePart];
        let component: string | undefined;
        while ((component = components.shift()) !== undefined) {
            filePath += component;
            try {
                const stat = await fs.stat(filePath);
                if (stat.isFile()) {
                    const extension = extname(filePath).substr(1).toLowerCase();
                    if (extension === 'zip') {
                        // Return the absolute path of the file and the relative path within it
                        return { absolutePath: filePath, relativePath: join(...components) };
                    } else {
                        // Handle the case where we found a file but it was not an email file
                        // TODO: Send to telemetry
                        return;
                    }
                } else if (stat.isDirectory()) {
                    // Continue walking up the path until we reach the email file
                    filePath += sep;
                } else {
                    // Handle the case where we've reached something that is not a file nor a directory
                    // TODO: Send to telemetry
                    debugger;
                    return;
                }
            } catch (error) {
                // Handle the case where path ceased to exist (should never happen) or be accessible
                // TODO: Send to telemetry
                return;
            }
        }

        return;
    }

    // TODO: Actually cache this
    private async cache(path: string): Promise<JSZip & { ctime: number; mtime: number; size: number; }> {
        const zip: JSZip & { ctime: number; mtime: number; size: number; } = new JSZip() as any;
        await zip.loadAsync(await fs.readFile(path), { createFolders: true });
        const { ctime, mtime, size } = await fs.stat(path);
        zip.ctime = ctime.valueOf();
        zip.mtime = mtime.valueOf();
        zip.size = size;
        return zip;
    }

    private list(zip: JSZip, path: string) {
        const entries: [string, JSZip.JSZipObject][] = [];
        const externalPath = this.break(path);

        // Use `forEach` to benefit from `relativePath` calculation (ZIP `root` is not always just `/`)
        zip.forEach((relativePath, entry) => {
            const internalPath = this.break(relativePath);

            // Look for things nested exactly one level deep
            if (internalPath.length !== externalPath.length + 1) {
                return;
            }

            entries.push([internalPath.pop()!, entry]);
        });

        return entries;
    }

    private find(zip: JSZip, path: string): [string, JSZip.JSZipObject] {
        const entries: [string, JSZip.JSZipObject][] = [];
        const externalPath = this.break(path);

        // Use `forEach` to benefit from `relativePath` calculation (ZIP `root` is not always just `/`)
        zip.forEach((relativePath, entry) => {
            const internalPath = this.break(relativePath);

            // Look paths with the same amount of components
            if (internalPath.length !== externalPath.length) {
                return;
            }

            // Verify path equality
            for (let index = 0; index < externalPath.length; index++) {
                if (internalPath[index] !== externalPath[index]) {
                    return;
                }
            }

            entries.push([internalPath.pop()!, entry]);
        });

        if (entries.length > 1) {
            throw new Error(`Multiple entries with the same path '${path}' found`);
        }

        return entries[0];
    }
}
