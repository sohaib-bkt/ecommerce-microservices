import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

export interface ContractProtoPaths {
  protoPath: string;
  includeDir: string;
}

function findProtoRoot(startDir: string): string | undefined {
  let current = resolve(startDir);
  while (true) {
    const roots = [
      join(current, 'libs', 'contracts', 'proto'),
      join(current, 'node_modules', '@ecommerce-platform', 'contracts', 'proto'),
    ];
    const root = roots.find((candidate) =>
      existsSync(join(candidate, 'common', 'v1', 'common.proto')),
    );
    if (root) return root;

    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function resolveConfiguredPath(
  configuredPath: string,
  protoRoot: string | undefined,
  cwd: string,
): string {
  if (isAbsolute(configuredPath)) return resolve(configuredPath);

  const normalizedPath = configuredPath.split(sep).join('/');
  const sourcePrefix = 'libs/contracts/proto/';
  const packagePrefix = 'node_modules/@ecommerce-platform/contracts/proto/';

  if (protoRoot && normalizedPath.startsWith(sourcePrefix)) {
    return resolve(protoRoot, normalizedPath.slice(sourcePrefix.length));
  }
  if (protoRoot && normalizedPath.startsWith(packagePrefix)) {
    return resolve(protoRoot, normalizedPath.slice(packagePrefix.length));
  }
  if (protoRoot && normalizedPath.startsWith('proto/')) {
    return resolve(protoRoot, normalizedPath.slice('proto/'.length));
  }
  if (protoRoot && (normalizedPath === 'libs/contracts/proto' || normalizedPath === 'proto')) {
    return resolve(protoRoot);
  }

  return resolve(cwd, configuredPath);
}

export function resolveContractProtoPaths(
  configuredProtoPath: string,
  configuredIncludeDir: string,
  serviceName: string,
): ContractProtoPaths {
  const cwd = process.cwd();
  const protoRoot = findProtoRoot(cwd);
  const protoPath = resolveConfiguredPath(configuredProtoPath, protoRoot, cwd);
  const includeDir = resolveConfiguredPath(configuredIncludeDir, protoRoot, cwd);

  if (!existsSync(protoPath) || !statSync(protoPath).isFile()) {
    const message = `${serviceName} gRPC proto resolved to '${protoPath}', but that file does not exist.`;
    console.warn(message);
    throw new Error(message);
  }
  if (!existsSync(includeDir) || !statSync(includeDir).isDirectory()) {
    const message = `${serviceName} gRPC proto include directory resolved to '${includeDir}', but that directory does not exist.`;
    console.warn(message);
    throw new Error(message);
  }

  return { protoPath, includeDir };
}