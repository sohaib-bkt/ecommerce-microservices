#!/usr/bin/env node
/**
 * Generates TypeScript types and gRPC service stubs from the .proto files in
 * `proto/` using ts-proto.
 *
 * The .proto sources are copied into the build output by the `assets` option
 * in libs/contracts/project.json, so consumers can load them at runtime.
 *
 * Usage:
 *   node tools/generate-protos.mjs [--check]
 *
 *   --check   Generate into a temporary directory and fail if the result
 *             differs from the committed files. Used in CI to detect stale
 *             generated code without writing to the workspace.
 */
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  existsSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(__dirname, '..');
const libRoot = join(workspaceRoot, 'libs/contracts');
const protoDir = join(libRoot, 'proto');
const outDir = join(libRoot, 'src/generated');

/** ts-proto options. Keep in sync with the comments in README.md. */
const TS_PROTO_OPTIONS = [
  'esModuleInterop=true',
  'outputServices=generic-definitions',
  'useOptionals=messages',
  'snakeToCamel=true',
  'importSuffix=.js',
  'outputIndex=true',
].join(',');

function findProtoc() {
  // Prefer a protoc binary shipped by node_modules (hermetic), then fall back to
  // one on PATH. grpc-tools is optional and only used when it is fully installed.
  const candidates = [
    join(workspaceRoot, 'node_modules/grpc-tools/bin/protoc'),
    join(workspaceRoot, 'node_modules/grpc-tools/bin/protoc.exe'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return 'protoc';
}

/** Verifies protoc can actually be executed, with an actionable error. */
function assertProtocAvailable(protoc) {
  try {
    execFileSync(protoc, ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      `protoc could not be executed ("${protoc}").\n` +
        'Install it, for example:\n' +
        '  - Debian/Ubuntu: sudo apt-get install protobuf-compiler\n' +
        '  - macOS:           brew install protobuf\n' +
        '  - or install the hermetic copy: npm i -D grpc-tools',
    );
  }
}

function findPlugin() {
  const candidate = join(
    workspaceRoot,
    'node_modules/ts-proto/protoc-gen-ts_proto',
  );
  if (!existsSync(candidate)) {
    throw new Error(
      'ts-proto plugin not found. Run `npm install` before generating protos.',
    );
  }
  return candidate;
}

function collectProtos(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectProtos(full));
    } else if (entry.endsWith('.proto')) {
      found.push(full);
    }
  }
  return found.sort();
}

function generate(out) {
  const protoc = findProtoc();
  assertProtocAvailable(protoc);
  const plugin = findPlugin();
  const protos = collectProtos(protoDir);
  if (protos.length === 0) {
    throw new Error(`No .proto files found under ${protoDir}`);
  }

  // protoc requires the output directory to exist.
  mkdirSync(out, { recursive: true });

  execFileSync(
    protoc,
    [
      `--plugin=protoc-gen-ts_proto=${plugin}`,
      `--ts_proto_out=${out}`,
      `--ts_proto_opt=${TS_PROTO_OPTIONS}`,
      `-I`,
      protoDir,
      ...protos.map((p) => relative(protoDir, p)),
    ],
    { stdio: 'inherit', cwd: workspaceRoot },
  );

  // The .proto sources are part of the published contract surface: consumers
  // may need them for reflection or for tooling that is not codegen-based.
  // The build copies them into dist/proto via the `assets` option in
  // libs/contracts/project.json, so they are not duplicated here.
}

/** Recursively list files under dir, relative to dir. */
function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full, base));
    } else {
      out.push(relative(base, full));
    }
  }
  return out.sort();
}

function checkMode() {
  const tmp = mkdtempSync(join(tmpdir(), 'proto-check-'));
  try {
    generate(tmp);
    const generated = listFiles(tmp);
    const committed = existsSync(outDir) ? listFiles(outDir) : [];

    const missing = generated.filter((f) => !committed.includes(f));
    const extra = committed.filter((f) => !generated.includes(f));
    const differing = [];

    for (const file of generated) {
      if (!committed.includes(file)) continue;
      const a = readFileSync(join(tmp, file), 'utf8');
      const b = readFileSync(join(outDir, file), 'utf8');
      if (a !== b) differing.push(file);
    }

    const problems = [...missing, ...extra, ...differing];
    if (problems.length > 0) {
      console.error('Generated proto code is out of date:');
      for (const file of missing) console.error(`  missing: ${file}`);
      for (const file of extra) console.error(`  extra:   ${file}`);
      for (const file of differing) console.error(`  differs: ${file}`);
      console.error('\nRun `npm run proto:generate` and commit the result.');
      process.exit(1);
    }
    console.log('Generated proto code is up to date.');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function writeMode() {
  rmSync(outDir, { recursive: true, force: true });
  generate(outDir);
  const files = listFiles(outDir);
  console.log(
    `Generated ${files.length} file(s) into ${relative(workspaceRoot, outDir)}:`,
  );
  for (const file of files) console.log(`  ${file}`);
}

const isCheck = process.argv.includes('--check');
if (isCheck) {
  checkMode();
} else {
  writeMode();
}
