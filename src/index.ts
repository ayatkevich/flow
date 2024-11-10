const kind = Symbol("kind");
const signature = Symbol("signature");
const type = Symbol("type");
const effect = Symbol("effect");

type AnyEffect = {
  [kind]: "effect";
  [effect]: string;
  [signature]: any;
  from: "tag" | "fn";
  takes: any[];
  returns: any;
};

type AnyYield = {
  [kind]: "step";
  [type]: "yields";
  effect: AnyEffect;
};

type AnyStep =
  | AnyYield
  | {
      [kind]: "step";
      [type]: "throws";
      error: any;
    }
  | {
      [kind]: "step";
      [type]: "returns";
      value: any;
    };

type AnyTrace = {
  [kind]: "trace";
  steps: AnyStep[];
};

type AnyProgram = {
  [kind]: "program";
  traces: AnyTrace[];
};

type Steps<T extends AnyProgram> = T["traces"][number]["steps"][number];

type ProgramEffects<T> = T extends AnyYield ? T["effect"] : never;

type ProgramEffect<T, Name extends string> = T extends { [effect]: Name } ? T : never;

type Context<T extends AnyProgram> = {
  [Name in ProgramEffects<Steps<T>>[typeof effect]]: ProgramEffect<
    ProgramEffects<Steps<T>>,
    Name
  >[typeof signature];
};

type ImplementationEffects<T extends (this: Context<AnyProgram>) => Generator<any, any, any>> =
  ReturnType<T> extends Generator<infer Effects extends { [effect]: string }, any, any>
    ? Effects
    : never;

type ImplementationEffect<T, Name extends string> = T extends {
  [effect]: Name;
  from: "tag" | "fn";
  takes: any;
  returns: any;
}
  ? T
  : never;

type Promisable<T> = T | Promise<T>;

type Handlers<T extends (this: Context<AnyProgram>) => Generator<any, any, any>> = {
  [Name in ImplementationEffects<T>[typeof effect]]: ImplementationEffect<
    ImplementationEffects<T>,
    Name
  >["from"] extends "tag"
    ? (
        strings: TemplateStringsArray,
        ...params: [...ImplementationEffect<ImplementationEffects<T>, Name>["takes"]]
      ) => Promisable<ImplementationEffect<ImplementationEffects<T>, Name>["returns"]>
    : (
        ...params: [...ImplementationEffect<ImplementationEffects<T>, Name>["takes"]]
      ) => Promisable<ImplementationEffect<ImplementationEffects<T>, Name>["returns"]>;
};

export function tag<const T extends string>(tag: T) {
  return {
    takes<P extends any[]>(...params: P) {
      return {
        returns<V>(value: V) {
          return {
            [kind]: "effect" as const,
            [effect]: tag,
            from: "tag" as const,
            takes: params,
            returns: value,
            [signature]: undefined as any as (
              strings: TemplateStringsArray,
              ...args: [...P]
            ) => {
              [Symbol.iterator]: () => Iterator<
                {
                  [kind]: "effect";
                  [effect]: T;
                  from: "tag";
                  takes: [...P];
                  returns: V;
                },
                V
              >;
            },
          };
        },
      };
    },
  };
}

export function fn<const T extends string>(tag: T) {
  return {
    takes<P extends any[]>(...params: P) {
      return {
        returns<V>(value: V) {
          return {
            [kind]: "effect" as const,
            [effect]: tag,
            from: "fn" as const,
            takes: params,
            returns: value,
            [signature]: undefined as any as (...args: [...P]) => {
              [Symbol.iterator]: () => Iterator<
                {
                  [kind]: "effect";
                  [effect]: T;
                  from: "fn";
                  takes: [...P];
                  returns: V;
                },
                V
              >;
            },
          };
        },
      };
    },
  };
}

export function yields<T extends AnyEffect>(effect: T) {
  return {
    [kind]: "step" as const,
    [type]: "yields" as const,
    effect,
  };
}

export function throws<T>(error: T) {
  return {
    [kind]: "step" as const,
    [type]: "throws" as const,
    error,
  };
}

export function returns<T>(value: T) {
  return {
    [kind]: "step" as const,
    [type]: "returns" as const,
    value,
  };
}

export function trace<T extends AnyStep[]>(steps: T) {
  return {
    [kind]: "trace" as const,
    steps,
  };
}

export function program<T extends { [kind]: "trace" }>(traces: T[]) {
  return {
    [kind]: "program" as const,
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
  handlers: Handlers<T>
) {
  const generator = generatorFunction.call(
    new Proxy(
      {},
      {
        get(_, property) {
          return (...args: any[]) => ({
            [Symbol.iterator]: function* () {
              // @ts-expect-error
              return yield handlers[property as keyof Handlers<T>](...args);
            },
          });
        },
      }
    )
  );
  let next = generator.next();
  while (!next.done) {
    next = generator.next(next.value instanceof Promise ? await next.value : next.value);
  }
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
                let from = "fn";
                if (Array.isArray(args[0]) && args[0].every((item) => typeof item === "string")) {
                  from = "tag";
                  args = args.slice(1);
                }
                // @ts-expect-error
                return yield {
                  [kind]: "effect" as const,
                  [effect]: property,
                  from,
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
      if (step[type] === "yields") {
        if (next.done) throw new Error("expected to yield but returned");
        if (next.value[effect] !== step.effect[effect])
          throw new Error(`expected ${step.effect[effect]} but got ${next.value[effect]}`);
        if (next.value.from !== step.effect.from)
          throw new Error(`expected ${step.effect.from} but got ${next.value.from}`);
        if (!deepEqual(next.value.takes, step.effect.takes))
          throw new Error(
            `expected ${JSON.stringify(step.effect.takes)} but got ${JSON.stringify(
              next.value.takes
            )}`
          );
        nextValue = step.effect.returns;
      } else if (step[type] === "throws") {
        if (!next.done) throw new Error("expected to throw but didn't");
        if (!deepEqual(next.value, step.error))
          throw new Error(
            `expected ${JSON.stringify(step.error)} but got ${JSON.stringify(next.value)}`
          );
        nextValue = undefined;
      } else if (step[type] === "returns") {
        if (!next.done) throw new Error("expected to return but didn't");
        if (!deepEqual(next.value, step.value))
          throw new Error(
            `expected ${JSON.stringify(step.value)} but got ${JSON.stringify(next.value)}`
          );
        nextValue = undefined;
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
