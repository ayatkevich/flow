const kind = Symbol('kind');
const type = Symbol('type');
const signature = Symbol('signature');
const effect = Symbol('effect');

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
            ) => { [Symbol.iterator]: () => Iterator<{ [effect]: T }, V> },
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
        returns<R>(result: R) {
          return {
            [kind]: 'effect' as const,
            [effect]: tag,
            [signature]: undefined as any as (...args: [...P]) => {
              [Symbol.iterator]: () => Iterator<{ [effect]: T }, R>;
            },
          };
        },
      };
    },
  };
}

type AnyEffect = {
  [kind]: 'effect';
  [effect]: string;
  [signature]: any;
};

type AnyYield = {
  [kind]: 'step';
  [type]: 'yields';
  effect: AnyEffect;
};

type AnyStep =
  | AnyYield
  | {
      [kind]: 'step';
      [type]: 'throws';
      error: any;
    }
  | {
      [kind]: 'step';
      [type]: 'returns';
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

function yields<T extends AnyEffect>(effect: T) {
  return {
    [kind]: 'step' as const,
    [type]: 'yields' as const,
    effect,
  };
}

function throws<T>(error: T) {
  return {
    [kind]: 'step' as const,
    [type]: 'throws' as const,
    error,
  };
}

function returns<T>(value: T) {
  return {
    [kind]: 'step' as const,
    [type]: 'returns' as const,
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

type Steps<T extends AnyProgram> = T['traces'][number]['steps'][number];
type Effects<T> = T extends AnyYield ? T['effect'] : never;
type Effect<T, Name extends string> = T extends { [effect]: Name } ? T : never;
type Context<T extends AnyProgram> = {
  [Name in Effects<Steps<T>>[typeof effect]]: Effect<
    Effects<Steps<T>>,
    Name
  >[typeof signature];
};

function implementation<
  T extends AnyProgram,
  Fn extends (this: Context<T>) => Generator<any, any, any>
>(program: T, fn: Fn) {
  return fn;
}

const io = implementation(IO, function* io() {
  const users = yield* this.sql`
    select * from users where "id" = ${1} and "name" = ${'Alice'}
  `;

  if (!users) throw new Error('no users');

  for (const user of users) {
    const stripeCustomers = yield* this.fetch(`stripe/customers`, {
      query: { userId: user.id },
    });
  }
});
