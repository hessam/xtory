import { handleStatus, depsFromEnv } from '../ai/handler.js';
import { nodeAdapter } from './node.js';
export default nodeAdapter(() => handleStatus(depsFromEnv()));
