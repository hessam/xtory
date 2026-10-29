import { handleMe } from '../profile/handler.js';
import { depsFromEnv } from '../ai/handler.js';
import { nodeAdapter } from './node.js';
export default nodeAdapter(req => handleMe(req, depsFromEnv()));
