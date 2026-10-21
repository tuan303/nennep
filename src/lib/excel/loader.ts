/**
 * Lazy ExcelJS loader + binary helpers. Works in Node (route handlers, scripts, vitest) and in the browser
 * (bundlers resolve the package "browser" field). ExcelJS is only fetched the first time a workbook is read/written.
 */
import type { Workbook } from "exceljs";

type ExcelJSModule = typeof import("exceljs");

let modulePromise: Promise<ExcelJSModule> | undefined;

/** The ExcelJS namespace (`import ExcelJS from "exceljs"`), loaded on first use and cached. */
export function loadExcelJS(): Promise<ExcelJSModule> {
  modulePromise ??= import("exceljs").then((mod) => {
    // CommonJS / UMD builds expose the API on `default`; ESM-aware bundlers may expose it directly.
    const withDefault = mod as ExcelJSModule & { default?: ExcelJSModule };
    return withDefault.default && typeof withDefault.default.Workbook === "function" ? withDefault.default : mod;
  });
  return modulePromise;
}

/** Error with a Vietnamese, user-safe message (bad file, unknown layout…). */
export class ExcelParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcelParseError";
  }
}

/** Binary input accepted by every reader: ArrayBuffer (browser File.arrayBuffer()), Uint8Array or Node Buffer. */
export type BinaryInput = ArrayBuffer | Uint8Array;

/** Copy any binary input into a standalone ArrayBuffer (safe for JSZip in Node and in the browser). */
export function toArrayBuffer(input: BinaryInput): ArrayBuffer {
  if (ArrayBuffer.isView(input)) {
    const copy = new ArrayBuffer(input.byteLength);
    new Uint8Array(copy).set(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
    return copy;
  }
  return input;
}

/**
 * Normalise what `writeBuffer()` returns (Node Buffer, Uint8Array or ArrayBuffer) to a plain Uint8Array that
 * owns its whole ArrayBuffer (so `bytes.buffer` is exactly the file, never a slice of a pooled Node buffer).
 */
export function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const ownsBuffer = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength && data.buffer instanceof ArrayBuffer;
    return ownsBuffer ? view : view.slice();
  }
  throw new Error("ExcelJS returned an unexpected buffer type");
}

/** Open an .xlsx file. Throws ExcelParseError with a friendly message when the file is not a readable workbook. */
export async function readWorkbook(input: BinaryInput, fileName: string): Promise<Workbook> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(toArrayBuffer(input));
  } catch {
    throw new ExcelParseError(`Không đọc được file "${fileName}". Vui lòng chọn file Excel .xlsx hợp lệ (không đặt mật khẩu).`);
  }
  return wb;
}

/** Serialise a workbook to bytes (wrap with `new Blob([bytes])` in the browser, `Buffer.from(bytes)` in Node). */
export async function workbookToBytes(wb: Workbook): Promise<Uint8Array> {
  const out: unknown = await wb.xlsx.writeBuffer();
  return toUint8Array(out);
}

/** Create an empty workbook with NSHM metadata. */
export async function createWorkbook(): Promise<Workbook> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "NSHM Nền nếp";
  wb.lastModifiedBy = "NSHM Nền nếp";
  wb.company = "Trường Ngôi Sao Hoàng Mai";
  wb.created = new Date();
  wb.modified = wb.created;
  return wb;
}
