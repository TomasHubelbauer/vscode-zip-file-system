'use strict';
import * as vscode from 'vscode';
import { basename } from 'path';
import * as JSZip from 'jszip';
import * as fsExtra from 'fs-extra';

const registered = new Set<string>();

export function activate(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage('Activated');

    // Unregister removed folders so that they can be registered again by the command
    vscode.workspace.onDidChangeWorkspaceFolders(event => {
        for (const removed of event.removed) {
            if (removed.uri.path === '/' /* Maybe redundant but we always use this root */ && registered.has(removed.uri.scheme)) {
                registered.delete(removed.uri.scheme);
            }
        }
    });

    context.subscriptions.push(vscode.commands.registerCommand('extension.mountZipFileSystem', async (uri: vscode.Uri) => {
        // https://stackoverflow.com/a/3641782/2715716
        // https://en.wikipedia.org/wiki/Base64#Base64_table
        // VS Code will "normalize" URIs by making the scheme lowercase so we instead double up the uppercase letters to keep a consistent and unique scheme
        const scheme = Buffer.from(uri.fsPath).toString('base64').replace(/\\/g, '-').replace(/=/g, '.').replace(/([A-Z])/g, l => l.toLowerCase() + l.toLowerCase());
        const zip = new JSZip();
        await zip.loadAsync(await fsExtra.readFile(uri.fsPath), { createFolders: true });
        const { ctime, mtime, size } = await fsExtra.stat(uri.fsPath);
        context.subscriptions.push(vscode.workspace.registerFileSystemProvider(scheme, new ZipFileSystemProvider(zip, ctime, mtime, size)));
        registered.add(scheme);
        vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders!.length, 0, { uri: vscode.Uri.parse(scheme + ':/'), name: basename(uri.fsPath) + ' File System' });
    }));
}

class ZipFileSystemProvider implements vscode.FileSystemProvider {
    private readonly zip: JSZip;
    private readonly ctime: number;
    private readonly mtime: number;
    private readonly size: number;

    private emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.emitter.event;

    public constructor(zip: JSZip, ctime: Date, mtime: Date, size: number) {
        this.zip = zip;
        this.ctime = ctime.valueOf();
        this.mtime = mtime.valueOf();
        this.size = size;
    }

    public watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new class {
            dispose() {
                debugger;
            }
        };
    }

    public stat(uri: vscode.Uri): vscode.FileStat {
        const path = uri.path.replace(/\\/g, '/');

        // Handle VS Code looking for workspace directory configuration settings
        if (path === '/.vscode') {
            return { type: vscode.FileType.Unknown, ctime: this.ctime, mtime: this.mtime, size: 0 };
        }

        if (path === '/') {
            return { type: vscode.FileType.Directory, ctime: this.ctime, mtime: this.mtime, size: this.size };
        }

        const entry = this.find(uri);
        if (entry === undefined) {
            debugger;
            return { type: vscode.FileType.Unknown, ctime: this.ctime, mtime: this.mtime, size: 0 };
        }

        return {
            type: entry[1].dir ? vscode.FileType.Directory : vscode.FileType.File,
            ctime: entry[1].date.valueOf(),
            mtime: entry[1].date.valueOf(),
            size: 0, // TODO: See if this breaks anything and we need to read the real size from the buffer
        };
    }

    public readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        const entries = this.list(uri);
        return entries.map(([name, entry]) => [name, entry.dir ? vscode.FileType.Directory : vscode.FileType.File] as [string, vscode.FileType]);
    }

    createDirectory(uri: vscode.Uri): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    public readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const entry = this.find(uri);
        if (entry === undefined) {
            throw new Error('No file');
        }

        if (entry[1].dir) {
            throw new Error('Not file');
        }

        return entry[1].async('nodebuffer', a => console.log(a));
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
        debugger;
        throw new Error("Method not implemented.");
    }

    private break(path: string) {
        if (path.startsWith('/')) {
            // Remove leading slash from the FS path (workspace directories always start with `/`, ZIP `relativePath` never)
            path = path.slice('/'.length);
        }

        const components = path.split(/[\\/]/g);
        if (components[components.length - 1] === '') {
            components.pop();
        }

        return components;
    }

    private list(uri: vscode.Uri) {
        const entries: [string, JSZip.JSZipObject][] = [];
        const externalPath = this.break(uri.path);

        // Use `forEach` to benefit from `relativePath` calculation (ZIP `root` is not always just `/`)
        this.zip.forEach((relativePath, entry) => {
            const internalPath = this.break(relativePath);

            // Look for things nested exactly one level deep
            if (internalPath.length !== externalPath.length + 1) {
                return;
            }

            entries.push([internalPath.pop()!, entry]);
        });

        return entries;
    }

    private find(uri: vscode.Uri): [string, JSZip.JSZipObject] {
        const entries: [string, JSZip.JSZipObject][] = [];
        const externalPath = this.break(uri.path); // demo nested

        // Use `forEach` to benefit from `relativePath` calculation (ZIP `root` is not always just `/`)
        this.zip.forEach((relativePath, entry) => {
            const internalPath = this.break(relativePath); // demo, demo nested, demo nested th, demo first, demo second

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
            throw new Error(`Multiple entries with the same path '${uri.path}' found`);
        }

        return entries[0];
    }
}
