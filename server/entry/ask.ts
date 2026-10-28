import { handleAsk, depsFromEnv } from '../ai/handler.js';
import { nodeAdapter } from './node.js';
export default nodeAdapter(req => handleAsk(req, depsFromEnv()));
