import { createJarvisApp } from '../server.js';

let appInstance: any;
let initError: string | null = null;

export default async function handler(req: any, res: any) {
  if (!appInstance) {
    try {
      appInstance = await createJarvisApp();
    } catch (err: any) {
      initError = err.message;
      return res.status(500).json({ error: 'Server no pudo cargarse', details: initError });
    }
  }
  return appInstance(req, res);
}

