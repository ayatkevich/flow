const kind = Symbol('kind');
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

function trace<T extends { [kind]: 'effect' }>(effects: T[]) {
  return {
    [kind]: 'trace' as const,
    effects,
  };
}

function program<T extends { [kind]: 'trace' }>(traces: T[]) {
  return {
    [kind]: 'program' as const,
    traces,
  };
}

type AnyEffect = {
  [kind]: 'effect';
  [effect]: string;
  [signature]: any;
};

type AnyTrace = {
  [kind]: 'trace';
  effects: AnyEffect[];
};

type AnyProgram = {
  [kind]: 'program';
  traces: AnyTrace[];
};

const sql = tag('sql');
const fetch = fn('fetch');

const IO = program([
  trace([
    sql //
      .takes(2, 'Bob')
      .returns([]),
  ]),

  trace([
    sql //
      .takes(NaN, 'Alice')
      .returns(undefined),
  ]),

  trace([
    sql //
      .takes(1, 'Alice')
      .returns([{ id: 1, name: 'Alice' }]),

    fetch //
      .takes('stripe/customers', { query: { userId: 1 } })
      .returns([
        {
          id: 1,
          name: 'Alice',
          stripeCustomerId: 'cus_1234567890',
        },
      ]),
  ]),
]);

type Effects<T extends AnyProgram> = T['traces'][number]['effects'][number];
type Effect<T, Name extends string> = T extends { [effect]: Name } ? T : never;
type Context<T extends AnyProgram> = {
  [Name in Effects<T>[typeof effect]]: Effect<
    Effects<T>,
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
