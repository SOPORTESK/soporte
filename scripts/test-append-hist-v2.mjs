// Prueba sek_append_hist_v2 sin tocar código de producción.
// Crea un caso de prueba, le appendea mensajes, y verifica seq + messageId + dedup.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const url = fs.readFileSync('.env.local', 'utf8').match(/NEXT_PUBLIC_SUPABASE_URL="?(.+?)"?$/m)?.[1];
const key = fs.readFileSync('.env.local', 'utf8').match(/SUPABASE_SERVICE_ROLE_KEY="?(.+?)"?$/m)?.[1];
const supabase = createClient(url, key);

async function main() {
  // 1. Crear caso de prueba
  const testId = 'test-v2-' + Date.now();
  const { error: createErr } = await supabase.from('sek_cases').insert({
    id: testId,
    title: 'Test v2',
    estado: 'abierto',
    canal: 'test',
    customer_phone: '00000000000',
  });
  if (createErr) { console.error('ERROR creando caso:', createErr); process.exit(1); }
  console.log('Caso creado:', testId);

  // 2. Append mensaje 1 SIN messageId ni seq → debe generar ambos
  const entry1 = { role: 'user', content: 'Hola prueba v2', time: new Date().toISOString(), fromMe: false };
  const { data: r1, error: e1 } = await supabase.rpc('sek_append_hist_v2', {
    p_case_id: testId, p_entry: entry1, p_col: 'histcliente', p_preview: 'Hola prueba v2',
  });
  if (e1) { console.error('ERROR append 1:', e1); process.exit(1); }
  console.log('Append 1:', r1, '(esperado: true)');

  // 3. Verificar entry 1
  await new Promise(r => setTimeout(r, 500));
  const { data: case1 } = await supabase.from('sek_cases').select('histcliente').eq('id', testId).single();
  const m1 = case1?.histcliente?.[0];
  console.log('Entry 1:', JSON.stringify(m1));
  console.log('  messageId presente:', !!m1?.messageId, '| seq:', m1?.seq, '(esperado: seq=1)');

  // 4. Append mensaje 2 con contenido distinto → seq debe ser 2
  const entry2 = { role: 'user', content: 'Segundo mensaje', time: new Date().toISOString(), fromMe: false };
  const { data: r2, error: e2 } = await supabase.rpc('sek_append_hist_v2', {
    p_case_id: testId, p_entry: entry2, p_col: 'histcliente', p_preview: 'Segundo',
  });
  if (e2) { console.error('ERROR append 2:', e2); process.exit(1); }
  console.log('Append 2:', r2, '(esperado: true)');

  const { data: case2 } = await supabase.from('sek_cases').select('histcliente').eq('id', testId).single();
  await new Promise(r => setTimeout(r, 300));
  const m2 = case2?.histcliente?.[1];
  console.log('Entry 2:', JSON.stringify(m2));
  console.log('  messageId distinto a entry1:', m1?.messageId !== m2?.messageId, '| seq:', m2?.seq, '(esperado: seq=2)');

  // 5. Dedup por contenido: mismo role + content + <60s → debe devolver false
  const entry3 = { role: 'user', content: 'Hola prueba v2', time: new Date().toISOString(), fromMe: false };
  const { data: r3, error: e3 } = await supabase.rpc('sek_append_hist_v2', {
    p_case_id: testId, p_entry: entry3, p_col: 'histcliente', p_preview: 'Hola prueba v2',
  });
  if (e3) { console.error('ERROR append 3 (dedup):', e3); process.exit(1); }
  console.log('Append 3 (dedup por contenido):', r3, '(esperado: false)');

  // 6. Append en histtecnico → seq debe ser 3 (continúa desde histcliente)
  const entry4 = { role: 'ia', content: 'Respuesta del bot', time: new Date().toISOString(), fromMe: true };
  const { data: r4, error: e4 } = await supabase.rpc('sek_append_hist_v2', {
    p_case_id: testId, p_entry: entry4, p_col: 'histtecnico', p_preview: 'Respuesta',
  });
  if (e4) { console.error('ERROR append 4:', e4); process.exit(1); }
  console.log('Append 4 (histtecnico):', r4, '(esperado: true)');

  const { data: case4 } = await supabase.from('sek_cases').select('histtecnico').eq('id', testId).single();
  await new Promise(r => setTimeout(r, 300));
  const m4 = case4?.histtecnico?.[0];
  console.log('Entry 4:', JSON.stringify(m4));
  console.log('  seq:', m4?.seq, '(esperado: seq=3, continúa desde histcliente)');

  // 7. Append con messageId de WhatsApp → NO debe dedup por contenido aunque sea igual
  const entry5 = { role: 'user', content: 'Hola prueba v2', time: new Date().toISOString(), fromMe: false, messageId: 'WA_MSG_ID_TEST_123' };
  const { data: r5, error: e5 } = await supabase.rpc('sek_append_hist_v2', {
    p_case_id: testId, p_entry: entry5, p_col: 'histcliente', p_preview: 'Hola',
  });
  if (e5) { console.error('ERROR append 5:', e5); process.exit(1); }
  console.log('Append 5 (con messageId de WA, mismo contenido):', r5, '(esperado: true, no dedup por contenido)');

  // 8. Append con mismo messageId de WhatsApp → dedup por messageId
  const entry6 = { role: 'user', content: 'otra cosa', time: new Date().toISOString(), fromMe: false, messageId: 'WA_MSG_ID_TEST_123' };
  const { data: r6, error: e6 } = await supabase.rpc('sek_append_hist_v2', {
    p_case_id: testId, p_entry: entry6, p_col: 'histcliente', p_preview: 'otra',
  });
  if (e6) { console.error('ERROR append 6:', e6); process.exit(1); }
  console.log('Append 6 (mismo messageId WA):', r6, '(esperado: false, dedup por messageId)');

  // Resumen
  console.log('\n=== RESUMEN ===');
  const { data: finalCase } = await supabase.from('sek_cases').select('histcliente,histtecnico').eq('id', testId).single();
  console.log('histcliente:', finalCase?.histcliente?.length, 'mensajes');
  console.log('histtecnico:', finalCase?.histtecnico?.length, 'mensajes');
  const allMsgs = [...(finalCase?.histcliente || []), ...(finalCase?.histtecnico || [])];
  const allHaveSeq = allMsgs.every(m => m.seq !== undefined);
  const allHaveMsgId = allMsgs.every(m => m.messageId !== undefined && m.messageId !== '');
  console.log('Todos tienen seq:', allHaveSeq);
  console.log('Todos tienen messageId:', allHaveMsgId);

  // Limpiar
  const { error: delErr } = await supabase.from('sek_cases').delete().eq('id', testId);
  if (delErr) console.warn('No se pudo borrar caso de prueba:', delErr.message);
  else console.log('Caso de prueba eliminado.');

  if (!allHaveSeq || !allHaveMsgId) {
    console.error('FALLO: no todos los entries tienen seq o messageId');
    process.exit(1);
  }
  console.log('\nTODO OK');
}

main().catch(e => { console.error(e); process.exit(1); });
