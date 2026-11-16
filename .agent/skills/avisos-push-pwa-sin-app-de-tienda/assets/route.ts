// =============================================================================
// Avisos push — lo llama el trigger de `notifications` por pg_net (0168)
// =============================================================================
// El trigger solo despierta a esta ruta cuando alguna de las notificaciones
// nuevas es de alguien con un dispositivo anotado, y manda solo los ids. Acá se
// lee el texto con el cliente de servicio y se manda a cada dispositivo
// (`lib/push/servidor/enviar.ts`).
//
// SEGURIDAD: sin sesión no hay RLS; la única barrera es el secreto compartido
// con el trigger. Lo generó la 0168 dentro del Vault y se lee de ahí (patrón de
// la 0147 y la 0165): no hay variable de Vercel que cargar.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { revisarSecretoCron } from '@/lib/meta-eventos/puerta';
import { enviarAvisosPush, TOPE_IDS } from '@/lib/push/servidor/enviar';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Cuerpo = z.object({ ids: z.array(z.string().uuid()).min(1).max(TOPE_IDS) });

export async function POST(req: Request) {
  const admin = createAdminClient();
  const { data: secreto } = await admin.rpc('push_secreto_cron');
  const puerta = revisarSecretoCron(typeof secreto === 'string' ? secreto : undefined, req.headers.get('x-cron-secret'));
  if (!puerta.ok) return NextResponse.json({ ok: false, error: puerta.error }, { status: puerta.status });

  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ ok: false, error: 'cuerpo_invalido' }, { status: 400 });

  try {
    const resumen = await enviarAvisosPush(admin, cuerpo.data.ids);
    if (resumen.sinClaves) {
      console.error('[cron/push] faltan las claves VAPID en este entorno');
      return NextResponse.json({ ok: false, error: 'vapid_no_configurado' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, ...resumen });
  } catch (e) {
    console.error('[cron/push]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'envio_fallo' }, { status: 500 });
  }
}
