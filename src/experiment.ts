const kind = Symbol('kind');
const signature = Symbol('signature');
const step = Symbol('step');
const effect = Symbol('effect');

type AnyEffect = {
  [kind]: 'effect';
  [effect]: string;
  [signature]: any;
};

type AnyYield = {
  [kind]: 'step';
  [step]: 'yields';
  effect: AnyEffect;
};

type AnyStep =
  | AnyYield
  | {
      [kind]: 'step';
      [step]: 'throws';
      error: any;
    }
  | {
      [kind]: 'step';
      [step]: 'returns';
      value: any;
    };

type AnyTrace = {
  [kind]: 'trace';
  steps: AnyStep[];
};

type AnyProgram = {
  [kind]: 'program';
  traces: AnyTrace[];
};

type Steps<T extends AnyProgram> = T['traces'][number]['steps'][number];

type ProgramEffects<T> = T extends AnyYield ? T['effect'] : never;

type ProgramEffect<T, Name extends string> = T extends { [effect]: Name }
  ? T
  : never;

type Context<T extends AnyProgram> = {
  [Name in ProgramEffects<Steps<T>>[typeof effect]]: ProgramEffect<
    ProgramEffects<Steps<T>>,
    Name
  >[typeof signature];
};

type ImplementationEffects<
  T extends (this: Context<AnyProgram>) => Generator<any, any, any>
> = ReturnType<T> extends Generator<
  infer Effects extends { [effect]: string },
  any,
  any
>
  ? Effects
  : never;

type ImplementationEffect<T, Name extends string> = T extends {
  [effect]: Name;
  from: 'tag' | 'fn';
  takes: any;
  returns: any;
}
  ? T
  : never;

type Handlers<
  T extends (this: Context<AnyProgram>) => Generator<any, any, any>
> = {
  [Name in ImplementationEffects<T>[typeof effect]]: ImplementationEffect<
    ImplementationEffects<T>,
    Name
  >['from'] extends 'tag'
    ? (
        strings: TemplateStringsArray,
        ...params: [
          ...ImplementationEffect<ImplementationEffects<T>, Name>['takes']
        ]
      ) => ImplementationEffect<ImplementationEffects<T>, Name>['returns']
    : (
        ...params: [
          ...ImplementationEffect<ImplementationEffects<T>, Name>['takes']
        ]
      ) => ImplementationEffect<ImplementationEffects<T>, Name>['returns'];
};

function tag<const T extends string>(tag: T) {
  return {
    takes<P extends any[]>(...params: P) {
      return {
        returns<V>(value: V) {
          return {
            [kind]: 'effect' as const,
            [effect]: tag,
            [signature]: undefined as any as (
              strings: TemplateStringsArray,
              ...args: [...P]
            ) => {
              [Symbol.iterator]: () => Iterator<
                {
                  [kind]: 'effect';
                  [effect]: T;
                  from: 'tag';
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

function fn<const T extends string>(tag: T) {
  return {
    takes<P extends any[]>(...params: P) {
      return {
        returns<V>(value: V) {
          return {
            [kind]: 'effect' as const,
            [effect]: tag,
            [signature]: undefined as any as (...args: [...P]) => {
              [Symbol.iterator]: () => Iterator<
                {
                  [kind]: 'effect';
                  [effect]: T;
                  from: 'fn';
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

function yields<T extends AnyEffect>(effect: T) {
  return {
    [kind]: 'step' as const,
    [step]: 'yields' as const,
    effect,
  };
}

function throws<T>(error: T) {
  return {
    [kind]: 'step' as const,
    [step]: 'throws' as const,
    error,
  };
}

function returns<T>(value: T) {
  return {
    [kind]: 'step' as const,
    [step]: 'returns' as const,
    value,
  };
}

function trace<T extends AnyStep[]>(steps: T) {
  return {
    [kind]: 'trace' as const,
    steps,
  };
}

function program<T extends { [kind]: 'trace' }>(traces: T[]) {
  return {
    [kind]: 'program' as const,
    traces,
  };
}

const sql = tag('sql');
const fetch = fn('fetch');

const IO = program([
  trace([
    yields(sql.takes(2, 'Bob').returns([])),
    throws(new Error('no users')),
  ]),

  trace([
    yields(sql.takes(NaN, 'Alice').returns(undefined)),
    throws(new Error('no users')),
  ]),

  trace([
    yields(sql.takes(1, 'Alice').returns([{ id: 1, name: 'Alice' }])),
    yields(
      fetch.takes('stripe/customers', { query: { userId: 1 } }).returns([
        {
          id: 1,
          name: 'Alice',
          stripeCustomerId: 'cus_1234567890',
        },
      ])
    ),
    returns(undefined),
  ]),
]);

function implementation<
  T extends AnyProgram,
  Fn extends (this: Context<T>) => Generator<any, any, any>
>(program: T, fn: Fn) {
  return fn;
}

async function handle<
  T extends (this: Context<AnyProgram>) => Generator<any, any, any>
>(generatorFunction: T, handlers: Handlers<T>) {}

const io = implementation(IO, function* () {
  const users = yield* this.sql`
    select * from users where "id" = ${1} and "name" = ${'Alice'}
  `;
  users satisfies { id: number; name: string }[] | undefined;

  if (!users) throw new Error('no users');

  for (const user of users) {
    const stripeCustomers = yield* this.fetch(`stripe/customers`, {
      query: { userId: user.id },
    });
    stripeCustomers satisfies {
      id: number;
      name: string;
      stripeCustomerId: string;
    }[];
  }
});

handle(io, {
  sql: (strings, ...params) => {
    console.log(strings, params);
    return [];
  },
  fetch: (url, options) => {
    console.log(url, options);
    return [];
  },
});
