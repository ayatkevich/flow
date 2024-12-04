interface AnyEffect {
  kind: "effect";
  name: string;
  takes: any[];
  returns: any;
}

interface AnyYield {
  kind: "step";
  type: "yields";
  effect: AnyEffect;
}

interface AnyThrow {
  kind: "step";
  type: "throws";
  error: any;
}

interface AnyReturn {
  kind: "step";
  type: "returns";
  value: any;
}

type AnyStep = AnyYield | AnyThrow | AnyReturn;

interface AnyTrace {
  kind: "trace";
  steps: AnyStep[];
}

interface AnyProgram {
  kind: "program";
  traces: AnyTrace[];
}

type Steps<T extends AnyProgram> = T["traces"][number]["steps"][number];

type ProgramEffects<T> = T extends AnyYield ? T["effect"] : never;

type ProgramEffect<T, Name extends string> = T extends {
  kind: "effect";
  name: Name;
  takes: any[];
  returns: any;
}
  ? T
  : never;

type Context<T extends AnyProgram> = {
  [Name in ProgramEffects<Steps<T>>["name"]]: (
    ...args: [...ProgramEffect<ProgramEffects<Steps<T>>, Name>["takes"]]
  ) => {
    [Symbol.iterator]: () => Iterator<
      ProgramEffect<ProgramEffects<Steps<T>>, Name>,
      ProgramEffect<ProgramEffects<Steps<T>>, Name>["returns"]
    >;
  };
};

type ImplementationEffects<T extends (this: Context<AnyProgram>) => Generator<any, any, any>> =
  ReturnType<T> extends Generator<infer Effect extends { kind: "effect"; name: string }, any, any>
    ? Effect
    : never;

type ImplementationEffect<T, Name extends string> = T extends {
  name: Name;
  takes: any;
  returns: any;
}
  ? T
  : never;

type Promisable<T> = T | Promise<T>;

type Handlers<T extends (this: Context<AnyProgram>) => Generator<any, any, any>> = {
  [Name in ImplementationEffects<T>["name"]]: (
    ...params: [...ImplementationEffect<ImplementationEffects<T>, Name>["takes"]]
  ) => Promisable<ImplementationEffect<ImplementationEffects<T>, Name>["returns"]>;
};

export function fn<const T extends string>(tag: T) {
  return {
    takes<P extends any[]>(...params: P) {
      return {
        returns<V>(value: V) {
          return {
            kind: "effect" as const,
            name: tag,
            takes: params,
            returns: value,
          };
        },
      };
    },
  };
}

export function yields<T extends AnyEffect>(effect: T) {
  return {
    kind: "step" as const,
    type: "yields" as const,
    effect,
  };
}

export function throws<T>(error: T) {
  return {
    kind: "step" as const,
    type: "throws" as const,
    error,
  };
}

export function returns<T>(value: T) {
  return {
    kind: "step" as const,
    type: "returns" as const,
    value,
  };
}

export function trace<T extends AnyStep[]>(steps: T) {
  return {
    kind: "trace" as const,
    steps,
  };
}

export function program<T extends { kind: "trace" }>(traces: T[]) {
  return {
    kind: "program" as const,
    traces,
  };
}

export function implementation<
  T extends AnyProgram,
  Fn extends (this: Context<T>) => Generator<any, any, any>
>(program: T, fn: Fn) {
  return fn;
}

export async function handle<T extends (this: Context<AnyProgram>) => Generator<any, any, any>>(
  generatorFunction: T,
  handlers: Handlers<T>,
  options?: {
    enter?: (effect: string | symbol, takes: any[]) => void;
    leave?: (effect: string | symbol, returns: any) => void;
  }
) {
  const generator = generatorFunction.call(
    new Proxy(
      {},
      {
        get(_, property) {
          return (...args: any[]) => ({
            [Symbol.iterator]: function* () {
              // @ts-expect-error
              return yield [property, args];
            },
          });
        },
      }
    )
  );
  let next = generator.next();
  let nextValue;
  while (!next.done) {
    try {
      const [effect, takes] = next.value;
      options?.enter?.(effect, takes);
      nextValue = await handlers[effect as keyof Handlers<T>](...takes);
      options?.leave?.(effect, nextValue);
    } catch (error) {
      nextValue = error;
    }
    next = generator.next(nextValue);
  }
  return nextValue;
}

export function verify<
  T extends AnyProgram,
  Fn extends (this: Context<T>) => Generator<any, any, any>
>(program: T, fn: Fn) {
  for (const trace of program.traces) {
    const generator = fn.call(
      new Proxy(
        {},
        {
          get(_, property) {
            return (...args: any[]) => ({
              [Symbol.iterator]: function* () {
                // @ts-expect-error
                return yield {
                  kind: "effect" as const,
                  effect: property,
                  takes: args,
                };
              },
            });
          },
        }
      ) as Context<T>
    );

    let next = generator.next();
    let nextValue;

    for (const step of trace.steps) {
      switch (step.type) {
        case "yields":
          if (next.done) throw new Error("expected to yield but returned");
          if (next.value.effect !== step.effect.name)
            throw new Error(`expected ${step.effect.name} but got ${next.value.effect}`);
          if (!deepEqual(next.value.takes, step.effect.takes))
            throw new Error(
              `expected ${JSON.stringify(step.effect.takes)} but got ${JSON.stringify(
                next.value.takes
              )}`
            );
          nextValue = step.effect.returns;
          break;

        case "throws":
          if (!next.done) throw new Error("expected to throw but didn't");
          if (!deepEqual(next.value, step.error))
            throw new Error(
              `expected ${JSON.stringify(step.error)} but got ${JSON.stringify(next.value)}`
            );
          nextValue = undefined;
          break;

        case "returns":
          if (!next.done) throw new Error("expected to return but didn't");
          if (!deepEqual(next.value, step.value))
            throw new Error(
              `expected ${JSON.stringify(step.value)} but got ${JSON.stringify(next.value)}`
            );
          nextValue = undefined;
          break;
      }

      try {
        next = generator.next(nextValue);
      } catch (error) {
        next = { value: error, done: true };
      }
    }
  }
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a === "object" && typeof b === "object") {
    return (
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((key) => deepEqual(a[key], b[key]))
    );
  }
  return false;
}
