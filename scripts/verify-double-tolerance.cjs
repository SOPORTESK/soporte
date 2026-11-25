const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

require('./dns-boost.cjs');

const enginePath = path.join(__dirname, '..', 'src', 'lib', 'activity-engine.ts');
const src = fs.readFileSync(enginePath, 'utf8');
const transpiled = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const mod = { exports: {} };
new Function('exports', 'require', 'module', transpiled)(mod.exports, require, mod);
const { computeUnifiedActivityMetrics } = mod.exports;

const BASE_OPTS = {
  targetDailyHours: 10,
  toleranceMinutes: 5,
  scheduleStart: '06:30',
  scheduleEnd: '16:30',
  appMappings: {},
};

function makeEv(timeCR, action, category, durationMs = null, metadata = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: `2026-11-24T${timeCR}-06:00`,
    action,
    category,
    duration_ms: durationMs,
    metadata,
  };
}

function testCase1_PauseBelowTolerance() {
  const tl = [
    makeEv('10:00:00', 'Seka Chat: Caso 1', 'Navegación', 60000, { source: 'desktop' }),
    makeEv('10:04:00', 'Seka Chat: Caso 2', 'Navegación', 60000, { source: 'desktop' }),
    makeEv('10:08:00', 'Seka Chat: Fin', 'Navegación', 60000, { source: 'desktop' }),
  ];
  const res = computeUnifiedActivityMetrics(tl, { ...BASE_OPTS, scheduleStart: '10:00', scheduleEnd: '10:08' });
  assert.strictEqual(res.detectedGaps.length, 0, `Case 1 expected 0 gaps, got ${JSON.stringify(res.detectedGaps)}`);
  assert.strictEqual(Math.round(res.masterBuckets.Inactivo.durationMs / 60000), 0, 'Case 1 expected 0 idle min');
  console.log('PASS Case 1: 4-min pause (< 5m tolerance) -> 0 gaps, 0 idle min');
}

function testCase2_Legacy85MinPause() {
  const tl = [
    makeEv('14:31:12', 'Seka Chat: Caso A', 'Navegación', 60000, { source: 'desktop' }),
    makeEv('14:36:12', 'En curso • Seka Chat: Caso A (5 min)', 'Navegación', 300000, { source: 'desktop', checkpoint_5min: true }),
    makeEv('14:36:42', 'Sin actividad por 5 minutos mientras "Seka Chat" estaba abierta', 'Inactividad', null, {}),
    makeEv('14:40:14', 'Pantalla desbloqueada — reanudó actividad', 'Navegación', null, { reason: 'unlock_screen' }),
    makeEv('14:41:00', 'Linkus (Softphone)', 'Atención telefónica', 45000, { source: 'desktop' }),
  ];
  const res = computeUnifiedActivityMetrics(tl, { ...BASE_OPTS, scheduleStart: '14:31', scheduleEnd: '14:41' });
  const idleGaps = res.detectedGaps.filter((g) => g.id !== 'gap-inicio-tardio' && g.id !== 'gap-salida-anticipada');
  assert.strictEqual(idleGaps.length, 1, `Case 2 expected 1 idle gap, got ${JSON.stringify(idleGaps)}`);
  assert.ok(idleGaps[0].minutes >= 8 && idleGaps[0].minutes <= 9, `Case 2 expected 8-9 min, got ${idleGaps[0].minutes}`);
  console.log(`PASS Case 2: Legacy v1.2.0 8.5-min pause -> 1 gap (${idleGaps[0].minutes}m)`);
}

function testCase3_BackdatedAutoLockAtMin5() {
  const tl = [
    makeEv('09:59:50', 'Seka Chat: Caso A', 'Navegación', 60000, { source: 'desktop' }),
    makeEv('10:00:00', 'Pantalla bloqueada mientras usaba "Seka Chat" (llevaba 3min)', 'Inactividad', 300000, {
      idle_seconds: 300,
      idle_start: '2026-11-24T10:00:00-06:00',
      reason: 'lock_screen',
      source: 'desktop',
    }),
    makeEv('10:08:00', 'Pantalla desbloqueada — reanudó actividad', 'Navegación', null, { reason: 'unlock_screen', source: 'desktop' }),
    makeEv('10:09:00', 'Seka Chat: Caso B', 'Navegación', 60000, { source: 'desktop' }),
  ];
  const res = computeUnifiedActivityMetrics(tl, { ...BASE_OPTS, scheduleStart: '09:59', scheduleEnd: '10:09' });
  const idleGaps = res.detectedGaps.filter((g) => g.id !== 'gap-inicio-tardio' && g.id !== 'gap-salida-anticipada');
  assert.strictEqual(idleGaps.length, 1, `Case 3 expected 1 gap, got ${JSON.stringify(idleGaps)}`);
  assert.strictEqual(idleGaps[0].minutes, 8, `Case 3 expected 8m, got ${idleGaps[0].minutes}`);
  console.log(`PASS Case 3: v1.2.20 backdated lock (10:00 -> 10:08) -> 1 gap (${idleGaps[0].minutes}m)`);
}

function testCase4_ManualLock3Min() {
  const tl = [
    makeEv('09:59:50', 'Seka Chat: Caso A', 'Navegación', 60000, { source: 'desktop' }),
    makeEv('10:00:00', 'Pantalla bloqueada mientras usaba "Seka Chat" (llevaba 10s)', 'Inactividad', 0, {
      idle_seconds: 0,
      idle_start: '2026-11-24T10:00:00-06:00',
      reason: 'lock_screen',
      source: 'desktop',
    }),
    makeEv('10:03:00', 'Pantalla desbloqueada — reanudó actividad', 'Navegación', null, { reason: 'unlock_screen', source: 'desktop' }),
    makeEv('10:04:00', 'Seka Chat: Caso B', 'Navegación', 60000, { source: 'desktop' }),
  ];
  const res = computeUnifiedActivityMetrics(tl, { ...BASE_OPTS, scheduleStart: '09:59', scheduleEnd: '10:04' });
  const idleGaps = res.detectedGaps.filter((g) => g.id !== 'gap-inicio-tardio' && g.id !== 'gap-salida-anticipada');
  assert.strictEqual(idleGaps.length, 0, `Case 4 expected 0 gaps, got ${JSON.stringify(idleGaps)}`);
  console.log('PASS Case 4: Manual Win+L lock 3 min (< 5m tolerance) -> 0 gaps');
}

function testCase5_DesktopIdleCompleted18Min() {
  const tl = [
    makeEv('09:59:50', 'Seka Chat: Caso A', 'Navegación', 60000, { source: 'desktop' }),
    makeEv('10:00:00', 'Inactividad finalizada (18min 0s)', 'Inactividad', 18 * 60 * 1000, {
      idle_seconds: 18 * 60,
      idle_start: '2026-11-24T10:00:00-06:00',
      idle_end: '2026-11-24T10:18:00-06:00',
      reason: 'idle_completed',
      source: 'desktop',
    }),
    makeEv('10:18:05', 'Seka Chat: Caso B', 'Navegación', 60000, { source: 'desktop' }),
  ];
  const res = computeUnifiedActivityMetrics(tl, { ...BASE_OPTS, scheduleStart: '09:59', scheduleEnd: '10:18' });
  const idleGaps = res.detectedGaps.filter((g) => g.id !== 'gap-inicio-tardio' && g.id !== 'gap-salida-anticipada');
  assert.strictEqual(idleGaps.length, 1, `Case 5 expected 1 gap, got ${JSON.stringify(idleGaps)}`);
  assert.strictEqual(idleGaps[0].minutes, 18, `Case 5 expected 18m, got ${idleGaps[0].minutes}`);
  console.log(`PASS Case 5: Desktop idle_completed 18 min -> 1 gap (${idleGaps[0].minutes}m)`);
}

function testCase6_FalseWebIdleWithDesktopActivity() {
  const tl = [
    makeEv('12:39:20', 'Antigravity: Dev', 'Investigación y desarrollo', 105000, { source: 'desktop' }),
    makeEv('12:40:46', 'Inactividad finalizada (34 min)', 'Inactividad', 34 * 60 * 1000, {
      source: 'web',
      reason: 'idle_completed',
    }),
    makeEv('12:40:50', 'WhatsApp: Chat', 'Soporte Mensajería', 90000, { source: 'desktop' }),
  ];
  const res = computeUnifiedActivityMetrics(tl, { ...BASE_OPTS, scheduleStart: '12:39', scheduleEnd: '12:41' });
  const idleGaps = res.detectedGaps.filter((g) => g.id !== 'gap-inicio-tardio' && g.id !== 'gap-salida-anticipada');
  assert.strictEqual(idleGaps.length, 0, `Case 6 expected 0 false web idle gaps, got ${JSON.stringify(idleGaps)}`);
  console.log('PASS Case 6: False web idle_completed 34m during active desktop work -> 0 gaps');
}

async function testCase7_LiveNov18Cesar() {
  const sc = await (await fetch('http://127.0.0.1:3100/api/activity/schedule?agentEmail=cbatista%40sekunet.com')).json();
  const appCats = (await (await fetch('http://127.0.0.1:3100/api/activity/app-categories')).json()).appMappings || {};
  const tl = (await (await fetch('http://127.0.0.1:3100/api/activity/timeline?agent=cbatista%40sekunet.com&date=2026-11-18&endDate=2026-11-18')).json()).timeline || [];
  assert.ok(tl.length > 0, 'Expected Nov 18 timeline entries');

  // Inspect raw without FIFO justification subtraction so we can verify both real 06:55-07:03 and 14:31-14:40 pauses are detected
  const tlNoJust = tl.filter((x) => x.category !== 'Justificación Manual' && !/justificaci/i.test(x.action || ''));
  const resNoJust = computeUnifiedActivityMetrics(tlNoJust, {
    targetDailyHours: sc.targetDailyHours,
    toleranceMinutes: sc.toleranceMinutes,
    scheduleStart: sc.scheduleStart,
    scheduleEnd: sc.scheduleEnd,
    useMixedSchedule: sc.useMixedSchedule,
    daySchedules: sc.daySchedules,
    appMappings: appCats,
  });

  const morningGap = resNoJust.detectedGaps.find((g) => g.startTimeVal >= '06:53' && g.startTimeVal <= '06:58' && g.minutes >= 7);
  const afternoonGap = resNoJust.detectedGaps.find((g) => g.startTimeVal >= '14:30' && g.startTimeVal <= '14:35' && g.minutes >= 7);
  assert.ok(morningGap, `Case 7 expected Nov 18 morning gap (~06:55-07:03), gaps=${JSON.stringify(resNoJust.detectedGaps)}`);
  assert.ok(afternoonGap, `Case 7 expected Nov 18 afternoon gap (~14:31-14:40), gaps=${JSON.stringify(resNoJust.detectedGaps)}`);

  const resFull = computeUnifiedActivityMetrics(tl, {
    targetDailyHours: sc.targetDailyHours,
    toleranceMinutes: sc.toleranceMinutes,
    scheduleStart: sc.scheduleStart,
    scheduleEnd: sc.scheduleEnd,
    useMixedSchedule: sc.useMixedSchedule,
    daySchedules: sc.daySchedules,
    appMappings: appCats,
  });
  assert.ok(resFull.detectedGaps.length >= 2, `Case 7 expected >=2 pending gaps on Nov 18 even after 18m justification, got ${JSON.stringify(resFull.detectedGaps)}`);
  console.log(`PASS Case 7: Nov 18 real pauses recovered: morning=${morningGap.startTime}-${morningGap.endTime} (${morningGap.minutes}m), afternoon=${afternoonGap.startTime}-${afternoonGap.endTime} (${afternoonGap.minutes}m), remaining=${resFull.detectedGaps.length}`);
}

(async () => {
  testCase1_PauseBelowTolerance();
  testCase2_Legacy85MinPause();
  testCase3_BackdatedAutoLockAtMin5();
  testCase4_ManualLock3Min();
  testCase5_DesktopIdleCompleted18Min();
  testCase6_FalseWebIdleWithDesktopActivity();
  await testCase7_LiveNov18Cesar();
  console.log('ALL 7 REGRESSION TESTS PASSED!');
})().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
