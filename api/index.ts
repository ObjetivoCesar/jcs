import serverless from 'serverless-http';
import { createJarvisApp } from '../server.ts';

let appInstance: any;

export default async function handler(req: any, res: any) {
  if (!appInstance) {
    const app = await createJarvisApp();
    appInstance = serverless(app);
  }
  return appInstance(req, res);
}
