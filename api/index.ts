/**
 * Handler de prueba — verifica que la función serverless funcione.
 * Si esto da 200, el problema está en server.ts.
 * Si da 500, el problema es Vercel + TypeScript.
 */
export default async function handler(req: any, res: any) {
  console.log('[test-handler] Iniciando...');

  try {
    res.status(200).json({
      status: 'ok',
      message: 'Handler de prueba funcionando',
      env: {
        node: process.version,
        vercel: !!process.env.VERCEL,
        hasDeepSeek: !!process.env.DEEPSEEK_API_KEY,
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabaseDbUrl: !!process.env.SUPABASE_DATABASE_URL,
      }
    });
  } catch (err: any) {
    console.error('[test-handler] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

