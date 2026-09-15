import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as NativeBinding from '@shared/native-backend';

const nativeRequire = createRequire(__filename);

export function loadNativeBinding(): typeof NativeBinding {
	return nativeRequire(join(__dirname, '..', 'native', 'index.cjs')) as typeof NativeBinding;
}
