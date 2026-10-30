import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveContractProtoPaths } from './proto-paths.js';

describe('resolveContractProtoPaths', () => {
  it('resolves configured workspace paths to one existing absolute path', () => {
    const paths = resolveContractProtoPaths(
      'libs/contracts/proto/order/v1/order.proto',
      'libs/contracts/proto',
      'test',
    );

    expect(paths.protoPath).toBe(resolve('libs/contracts/proto/order/v1/order.proto'));
    expect(paths.includeDir).toBe(resolve('libs/contracts/proto'));
    expect(existsSync(paths.protoPath)).toBe(true);
    expect(existsSync(paths.includeDir)).toBe(true);
  });

  it('warns with the resolved path and fails when the proto is missing', () => {
    const missingPath = resolve('libs/contracts/proto/not-found.proto');
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() =>
      resolveContractProtoPaths(missingPath, resolve('libs/contracts/proto'), 'test'),
    ).toThrow(missingPath);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining(missingPath));

    warning.mockRestore();
  });
});
