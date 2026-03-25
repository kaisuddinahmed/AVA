// VM-only stub declarations — not used in real Mac build (real @ava/db has proper types)
declare module '@ava/db' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _exports: any;
  export = _exports;
}
declare module 'express' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function Router(): any;
  export type Request = any;
  export type Response = any;
  export type NextFunction = any;
}
