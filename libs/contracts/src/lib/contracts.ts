import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

/**
 * Helpers for working with the generated gRPC contracts.
 *
 * Services can either implement the generated service definitions directly
 * (Nest's gRPC microservice transport) or load the .proto files at runtime via
 * `loadProtoDefinitions` for tooling that needs the raw descriptors.
 */

const here = dirnameOf(import.meta.url);

/**
 * Resolves the directory holding the .proto files.
 *
 * In a built app the .proto files are copied next to the compiled output; in
 * the workspace they sit in `libs/contracts/proto`.
 */
export function resolveProtoDir(): string {
  const candidates = [
    join(here, 'proto'),
    join(here, '..', '..', 'proto'),
    join(here, '..', '..', '..', 'proto'),
    join(process.cwd(), 'libs', 'contracts', 'proto'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Unable to locate the .proto directory. Looked in:\n  ${candidates.join(
      '\n  ',
    )}`,
  );
}

/**
 * Loads the .proto files into a gRPC package definition.
 *
 * @param protoFiles paths to .proto files, relative to the proto directory.
 * @param options extra options forwarded to @grpc/proto-loader.
 */
export function loadProtoDefinitions(
  protoFiles: string[],
  options: Parameters<typeof loadSync>[1] = {},
): Record<string, unknown> {
  const protoDir = resolveProtoDir();
  const definition = loadSync(
    protoFiles.map((file) => join(protoDir, file)),
    {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
      ...options,
    },
  );
  return loadPackageDefinition(definition) as unknown as Record<
    string,
    unknown
  >;
}

function dirnameOf(url: string): string {
  const path = url.startsWith('file://') ? url.slice('file://'.length) : url;
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '.' : path.slice(0, idx);
}
