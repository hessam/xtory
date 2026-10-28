import { handleUsage, depsFromEnv } from '../ai/handler.js';
import { nodeAdapter } from './node.js';
export default nodeAdapter(req => handleUsage(req, depsFromEnv()));
