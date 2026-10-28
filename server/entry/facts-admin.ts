import { handleAdmin } from '../facts/handler.js';
import { depsFromEnv } from '../ai/handler.js';
import { nodeAdapter } from './node.js';
export default nodeAdapter(req => handleAdmin(req, depsFromEnv()));
