/**
 * lib/db/client.ts — Cliente de base de datos dual (Supabase / SQLite legacy).
 * 
 * En producción (Vercel): usa Supabase PostgreSQL con drizzle-orm/pg-core.
 * En local (sin SUPABASE_URL): usa SQLite con drizzle-orm/sqlite-core (legacy).
 * 
 * Auto-detecta según variables de entorno.
 */

let dbInstance: any = null;
let schemaInstance: any = null;
let dbType: 'supabase' | 'sqlite' = 'sqlite';

export async function initializeDatabase() {
  if (dbInstance) return { db: dbInstance, schema: schemaInstance, dbType };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

  if (supabaseUrl) {
    // ── Modo Supabase (producción / Vercel) ──
    console.log('☁️  Detectado SUPABASE_URL — usando Supabase PostgreSQL');
    
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const supabaseSchema = await import('./supabase-schema.ts');
    
    const connectionString = process.env.SUPABASE_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'SUPABASE_DATABASE_URL no está definida. ' +
        'Configúrala en .env con la connection string de Supabase Pooler ' +
        '(formato: postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres)'
      );
    }

    const sql = postgres(connectionString, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 15,
    });

    dbInstance = drizzle(sql, { schema: supabaseSchema });
    schemaInstance = supabaseSchema;
    dbType = 'supabase';
  } else {
    // ── Modo SQLite (local / legacy) ──
    console.log('📦 No se detectó SUPABASE_URL — usando SQLite local');
    
    const { createClient } = await import('@libsql/client');
    const { drizzle } = await import('drizzle-orm/libsql');
    const sqliteSchema = await import('./schema.ts');
    
    const dbUrl = process.env.DATABASE_URL || 'file:local.db';
    const client = createClient({ url: dbUrl });
    
    dbInstance = drizzle(client, { schema: sqliteSchema });
    schemaInstance = sqliteSchema;
    dbType = 'sqlite';
  }

  return { db: dbInstance, schema: schemaInstance, dbType };
}

export function getDatabase() {
  if (!dbInstance) {
    throw new Error('Base de datos no inicializada. Llama a initializeDatabase() primero.');
  }
  return { db: dbInstance, schema: schemaInstance, dbType };
}
