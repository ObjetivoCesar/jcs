import serverless from 'serverless-http';
import { createJarvisApp } from '../server.js';

let appInstance: any;

export default async function handler(req: any, res: any) {
  if (!appInstance) {
    try {
      const app = await createJarvisApp();
      appInstance = serverless(app);
    } catch (err: any) {
      console.error('[FATAL] Error al crear la app:', err.message, err.stack);
      // Responder con un error mínimo directamente
      return res.status(500).json({
        error: 'La aplicación no pudo inicializarse',
        message: err.message,
      });
    }
  }
  return appInstance(req, res);
}

