import type { Ctx2D } from '../context';

export interface DrawCall {
  method: string;
  args: unknown[];
  /** Snapshot of the styles in effect when the call was made. */
  state: { font: string; fillStyle: unknown; globalAlpha: number };
}

/**
 * A recording stand-in for CanvasRenderingContext2D, for unit tests in Node.
 * Every method call is logged; measureText approximates width from the font size.
 * Assigned properties (font, fillStyle, …) are stored and restored by save()/restore().
 */
export function createMockContext(): { ctx: Ctx2D; calls: DrawCall[]; texts: () => string[] } {
  const calls: DrawCall[] = [];
  const props: Record<string | symbol, unknown> = {
    font: '10px sans-serif',
    fillStyle: '#000',
    globalAlpha: 1,
  };
  const stack: Array<Record<string | symbol, unknown>> = [];

  const record = (method: string, args: unknown[]) =>
    calls.push({
      method,
      args,
      state: { font: String(props.font), fillStyle: props.fillStyle, globalAlpha: Number(props.globalAlpha) },
    });

  const methods: Record<string, (...args: unknown[]) => unknown> = {
    save: () => {
      stack.push({ ...props });
      record('save', []);
    },
    restore: () => {
      const previous = stack.pop();
      if (previous) Object.assign(props, previous);
      record('restore', []);
    },
    measureText: (text: unknown) => {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(String(props.font))?.[1] ?? 10);
      return { width: String(text).length * size * 0.6 } as TextMetrics;
    },
  };

  const ctx = new Proxy(props, {
    get(target, key) {
      if (typeof key === 'string' && key in methods) return methods[key];
      if (key in target) return target[key];
      // Any other method (fillRect, arc, translate, …) is recorded.
      return (...args: unknown[]) => record(String(key), args);
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as Ctx2D;

  const texts = () => calls.filter((c) => c.method === 'fillText').map((c) => String(c.args[0]));

  return { ctx, calls, texts };
}
