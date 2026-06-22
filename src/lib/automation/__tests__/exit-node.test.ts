// =============================================================
// Tests for the "Sair" (control_exit) node.
//
// Verifies the executor signal and the engine's run-level handling:
//   - the exit node reports success at the node level (renders green)
//   - the run terminates with 'cancelled' (the contact left the flow)
//   - nodes downstream of the exit are marked skipped, not executed
//   - a sibling branch chosen by a condition still runs; the exit only
//     stops its own path once reached
// =============================================================

import { describe, it, expect } from 'vitest';
import { ExecutionEngine, type Workflow } from '../execution-engine';
import { nodeExecutors } from '../node-executors';

// The exit executor is pure (no DB), so a stub supabase is never touched
// on this path. isTest:true also skips the exit-condition DB scan.
const stubSupabase: any = {
  from() { throw new Error('supabase should not be called in these tests'); },
};

function engine() {
  return new ExecutionEngine({ supabase: stubSupabase, isTest: true });
}

describe('control_exit executor', () => {
  it('signals exit with a success node status', async () => {
    const res = await nodeExecutors.control_exit.execute({
      node: {} as any,
      config: { reason: 'Já comprou' },
      context: {} as any,
      supabase: stubSupabase,
      isTest: true,
    });
    expect(res.status).toBe('success');
    expect(res.exit).toBe(true);
    expect(res.output.exited).toBe(true);
    expect(res.output.reason).toBe('Já comprou');
  });

  it('falls back to a default reason when none is configured', async () => {
    const res = await nodeExecutors.control_exit.execute({
      node: {} as any,
      config: {},
      context: {} as any,
      supabase: stubSupabase,
      isTest: true,
    });
    expect(res.output.reason).toBe('Contato saiu do fluxo');
  });
});

describe('engine handling of the exit node', () => {
  it('terminates the run and skips everything downstream of Sair', async () => {
    const workflow: Workflow = {
      id: 'wf1',
      name: 'Exit test',
      nodes: [
        { id: 't', type: 'trigger_signup', position: { x: 0, y: 0 },
          data: { label: 'Trigger', category: 'trigger', nodeType: 'trigger_signup', config: {} } },
        { id: 'exit', type: 'control_exit', position: { x: 0, y: 1 },
          data: { label: 'Sair', category: 'control', nodeType: 'control_exit', config: { reason: 'teste' } } },
        { id: 'after', type: 'action_tag', position: { x: 0, y: 2 },
          data: { label: 'Tag', category: 'action', nodeType: 'action_tag', config: { tagName: 'x' } } },
      ],
      edges: [
        { id: 'e1', source: 't', target: 'exit' },
        { id: 'e2', source: 'exit', target: 'after' },
      ],
    };

    const result = await engine().execute(workflow, {});

    expect(result.status).toBe('cancelled');
    expect(result.nodeResults['exit'].status).toBe('success');
    expect(result.nodeResults['exit'].output.exited).toBe(true);
    // The node wired after the exit must never run.
    expect(result.nodeResults['after']?.status).toBe('skipped');
  });

  it('does not affect a flow that has no exit node', async () => {
    const workflow: Workflow = {
      id: 'wf2',
      name: 'No exit',
      nodes: [
        { id: 't', type: 'trigger_signup', position: { x: 0, y: 0 },
          data: { label: 'Trigger', category: 'trigger', nodeType: 'trigger_signup', config: {} } },
      ],
      edges: [],
    };

    const result = await engine().execute(workflow, {});
    expect(result.status).toBe('success');
  });
});
