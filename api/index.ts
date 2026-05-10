import { createJarvisApp } from '../server.ts';

let appInstance: any;

export default async function handler(req: any, res: any) {
  if (!appInstance) {
    appInstance = await createJarvisApp();
  }
  return appInstance(req, res);
}
