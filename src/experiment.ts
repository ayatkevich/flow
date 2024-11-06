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

const _ = program([
  trace([
    tag('sql') //
      .takes()
      .returns([]),
  ]),

  trace([
    tag('sql') //
      .takes()
      .returns(undefined),
  ]),

  trace([
    tag('sql')
      .takes()
      .returns([{ id: 1, name: 'Alice' }]),

    fn('fetch')
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

type Effects = (typeof _)['traces'][number]['effects'][number];
type Effect<T, Name extends string> = T extends { [effect]: Name } ? T : never;
type Context = {
  [Name in Effects[typeof effect]]: Effect<Effects, Name>[typeof signature];
};

function* io(this: Context) {
  const users = yield* this.sql`
    select * from users
  `;

  if (!users) throw new Error('no users');

  if (users.length === 0) {
    throw new Error('no users');
  }

  const stripeCustomers = yield* this.fetch(`stripe/customers`, {
    query: { userId: users[0].id },
  });
}
