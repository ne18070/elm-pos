/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'escpos' {
  class USB {
    constructor(vid?: number, pid?: number);
    open(callback: (err: Error | null) => void): void;
    close(callback?: (err: Error | null) => void): void;
    static findPrinter(): any[];
  }

  class Printer {
    constructor(device: any, options?: { encoding?: string });
    font(type: 'A' | 'B'): this;
    align(align: 'LT' | 'CT' | 'RT'): this;
    style(style: string): this;
    size(width: number, height: number): this;
    text(text: string): this;
    barcode(code: string, type: string, options?: Record<string, any>): this;
    feed(n?: number): this;
    cut(partial?: boolean): this;
    close(callback?: (err: Error | null) => void): this;
  }

  export { USB, Printer };
}
