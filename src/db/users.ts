import { db } from './index.ts';
import { users } from './schema.ts';

export const DEFAULT_TENANT_ID = '11111111-1111-4111-8111-111111111111';

export async function getOrCreateUser(uid: string, email: string, nombre?: string) {
  try {
    const displayName = nombre?.trim() || email.split('@')[0] || 'Docente ALLEN';
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        nombre: displayName,
        tenantId: DEFAULT_TENANT_ID,
        rol: 'ADMIN',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          nombre: displayName,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('No se pudo sincronizar el usuario en la base de datos.', { cause: error });
  }
}
