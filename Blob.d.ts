// Declare the Blob interface needed for the JSZip types
interface Blob {
  readonly size: number;
  readonly type: string;
  slice(start?: number, end?: number, contentType?: string): Blob;
}
