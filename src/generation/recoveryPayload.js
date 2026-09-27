// C-3d（r84.102）：编解码原样在 core/recoveryPayload.js，这里仍导出同一个函数。
import { packRecoveryPayload as packRecoveryPayloadMoved, unpackRecoveryPayload as unpackRecoveryPayloadMoved } from '../core/recoveryPayload.js';
export const packRecoveryPayload = packRecoveryPayloadMoved;
export const unpackRecoveryPayload = unpackRecoveryPayloadMoved;
