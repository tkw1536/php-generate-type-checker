interface ImportMetaEnv {
  readonly APP_GIT_SHA: string;
  readonly APP_BUILD_TIME: string;
}

interface ImportMeta {
  readonly dirname: string;
}

/** Minimal Node builtins used by fixture tooling (tsconfig types are vite/client only). */
declare module 'node:crypto' {
  export function createHash(algorithm: string): {
    update(data: string, encoding: 'utf8'): {
      digest(encoding: 'hex'): string;
    };
  };
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:path' {
  const path: {
    join(...parts: readonly string[]): string;
    basename(filePath: string): string;
    resolve(...parts: readonly string[]): string;
    relative(from: string, to: string): string;
    sep: string;
  };
  export default path;
}
