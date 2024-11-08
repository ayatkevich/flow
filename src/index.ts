const kind = Symbol("kind");
const signature = Symbol("signature");
const step = Symbol("step");
const effect = Symbol("effect");

type AnyEffect = {
  [kind]: "effect";
  [effect]: string;
  [signature]: any;
};

type AnyYield = {
  [kind]: "step";
  [step]: "yields";
  effect: AnyEffect;
};

type AnyStep =
  | AnyYield
  | {
      [kind]: "step";
      [step]: "throws";
      error: any;
    }
  | {
      [kind]: "step";
      [step]: "returns";
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

type Handlers<T extends (this: Context<AnyProgram>) => Generator<any, any, any>> = {
  [Name in ImplementationEffects<T>[typeof effect]]: ImplementationEffect<
    ImplementationEffects<T>,
    Name
  >["from"] extends "tag"
    ? (
        strings: TemplateStringsArray,
        ...params: [...ImplementationEffect<ImplementationEffects<T>, Name>["takes"]]
      ) => ImplementationEffect<ImplementationEffects<T>, Name>["returns"]
    : (
        ...params: [...ImplementationEffect<ImplementationEffects<T>, Name>["takes"]]
      ) => ImplementationEffect<ImplementationEffects<T>, Name>["returns"];
};

export function tag<const T extends string>(tag: T) {
  return {
    takes<P extends any[]>(...params: P) {
      return {
        returns<V>(value: V) {
          return {
            [kind]: "effect" as const,
            [effect]: tag,
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
    [step]: "yields" as const,
    effect,
  };
}

export function throws<T>(error: T) {
  return {
    [kind]: "step" as const,
    [step]: "throws" as const,
    error,
  };
}

export function returns<T>(value: T) {
  return {
    [kind]: "step" as const,
    [step]: "returns" as const,
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
) {}
