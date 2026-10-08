import { sessionMember } from '../shared/member.mjs';
import { randomUUID } from 'node:crypto';
import { nextOccurrence } from './store.mjs';
import { readEvents } from './stream.mjs';

export function createScheduler({ store, runtime }) {
  const active = new Map();
  // A restarted service never resubmits an ambiguous accepted turn.
  for (const run of store.runs()) {
    if (run.status === 'running')
      store.updateRun({
        ...run,
        status: 'interrupted',
        error: 'Kites restarted. Open the conversation to check whether the agent finished.',
      });
  }
  async function execute(routine, run, controller) {
    try {
      const profileResponse = await runtime(
        `/api/v1/agents/${encodeURIComponent(routine.agentId)}`,
        { signal: controller.signal },
      );
      if (!profileResponse.ok) throw new Error(await profileResponse.text());
      const profile = await profileResponse.json();
      const sessionResponse = await runtime('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify({
          Key: `kites/routine/${run.id}`,
          EnvironmentID: profile.Spec.EnvironmentID || undefined,
          workspace_id: profile.Spec.Metadata?.['kites.workspace'] || undefined,
          members: [sessionMember(profile)],
        }),
        signal: controller.signal,
      });
      if (!sessionResponse.ok) throw new Error(await sessionResponse.text());
      const session = await sessionResponse.json();
      run.sessionId = session.id;
      store.put('chats', {
        id: session.id,
        title: routine.name,
        kind: 'routine',
        avatar: routine.avatar || '',
        routineId: routine.id,
      });
      store.updateRun(run);
      let terminal = false;
      await readEvents(
        await runtime(`/api/v1/sessions/${encodeURIComponent(session.id)}/prompt`, {
          method: 'POST',
          body: JSON.stringify({ input: { text: routine.prompt } }),
          signal: controller.signal,
        }),
        (event) => {
          const p = event.payload || {};
          if (p.type === 'ask' && p.awaitingReply) {
            run.status = 'needs attention';
            store.updateRun(run);
          }
          if (p.type === 'error') {
            run.status = 'failed';
            run.error = p.message || 'Bot execution failed.';
            terminal = true;
          }
          if (p.type === 'status' && ['idle', 'ended', 'cancelled', 'failed'].includes(p.status)) {
            if (run.status !== 'failed')
              run.status = ['idle', 'ended'].includes(p.status) ? 'completed' : p.status;
            terminal = true;
          }
        },
      );
      if (!terminal && run.status === 'running') {
        run.status = 'interrupted';
        run.error = 'The stream ended before the runtime confirmed completion.';
      }
    } catch (error) {
      run.status = run.sessionId ? 'interrupted' : 'failed';
      run.error = error.message;
    } finally {
      run.finishedAt = Date.now();
      store.updateRun(run);
      active.delete(routine.id);
    }
  }
  function start(routine, occurrence = `manual:${randomUUID()}`) {
    if (active.has(routine.id)) throw new Error('This routine is already running.');
    const run = {
      id: randomUUID(),
      routineId: routine.id,
      name: routine.name,
      occurrence,
      status: 'running',
      startedAt: Date.now(),
    };
    if (!store.claim(run)) return undefined;
    const controller = new AbortController();
    const promise = execute(routine, run, controller);
    active.set(routine.id, { controller, promise });
    return run;
  }
  function tick() {
    for (const routine of store.all('routines')) {
      if (!routine.enabled || routine.nextAt > Date.now() || active.has(routine.id)) continue;
      // Advance before dispatch. A crash between these writes may miss one occurrence,
      // but can never submit that occurrence twice. No backlog after sleep.
      store.put('routines', {
        ...routine,
        nextAt: nextOccurrence(routine, Date.now() + (routine.schedule === 'interval' ? 0 : 60000)),
      });
      start(routine, `${routine.id}:${routine.nextAt}`);
    }
  }
  const timer = setInterval(() => {
    try {
      tick();
    } catch (error) {
      console.error('Routine scheduler:', error.message);
    }
  }, 15000);
  timer.unref();
  return {
    start,
    tick,
    async close() {
      clearInterval(timer);
      for (const value of active.values()) value.controller.abort();
      await Promise.allSettled([...active.values()].map((v) => v.promise));
    },
  };
}
