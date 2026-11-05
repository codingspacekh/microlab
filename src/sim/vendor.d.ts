/** vendor/micropython/micropython.mjs: MicroLab's MicroPython build (typed in vm.ts as RawLoadMicroPython). */
declare module '*/vendor/micropython/micropython.mjs' {
  export const loadMicroPython: (options: object) => Promise<unknown>;
}
