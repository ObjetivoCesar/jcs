import { deepseekChat } from '../lib/deepseek-client.js';
import 'dotenv/config';

async function test() {
  try {
    console.log('Testing DeepSeek Flash...');
    const res = await deepseekChat('flash', [{ role: 'user', content: 'Hola' }]);
    console.log('Flash Response:', res);
  } catch (err) {
    console.error('Flash Error:', err.message);
  }

  try {
    console.log('\nTesting DeepSeek V4 (Reasoner)...');
    const res = await deepseekChat('v4', [{ role: 'user', content: 'Hola' }]);
    console.log('V4 Response:', res);
  } catch (err) {
    console.error('V4 Error:', err.message);
  }
}

test();
