export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export interface LogContext {
    [key: string]: unknown;
}
export interface Logger {
    debug(ctx: LogContext | string, msg?: string): void;
    info(ctx: LogContext | string, msg?: string): void;
    warn(ctx: LogContext | string, msg?: string): void;
    error(ctx: LogContext | string, msg?: string): void;
    child(bindings: LogContext): Logger;
}
/** Root logger. Bind a service name via .child({ service: "..." }). */
export declare const logger: Logger;
//# sourceMappingURL=logger.d.ts.map