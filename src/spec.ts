import {
  fn,
  handle,
  implementation,
  program,
  returns,
  tag,
  throws,
  trace,
  verify,
  yields,
} from "./index";

describe("tracify", () => {
  test("example", async () => {
    const sql = tag("sql");
    const fetch = fn("fetch");

    const IO = program([
      trace([
        //
        yields(sql.takes(1, "Alice").returns([])),
        throws(new Error("no users")),
      ]),

      trace([
        //
        yields(sql.takes(1, "Alice").returns(undefined)),
        throws(new Error("no users")),
      ]),

      trace([
        //
        yields(sql.takes(1, "Alice").returns([{ id: 1, name: "Alice" }])),
        yields(
          fetch.takes("stripe/customers", { query: { userId: 1 } }).returns([
            {
              id: 1,
              name: "Alice",
              stripeCustomerId: "cus_1234567890",
            },
          ])
        ),
        returns(undefined),
      ]),
    ]);

    const io = implementation(IO, function* () {
      const users = yield* this.sql`
        select * from users where "id" = ${1} and "name" = ${"Alice"}
      `;
      users satisfies { id: number; name: string }[] | undefined;

      if (!users || !users.length) throw new Error("no users");

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

    await handle(io, {
      async sql(strings, ...params) {
        strings satisfies TemplateStringsArray;
        params satisfies [number, string];
        return [{ id: params[0], name: params[1] }];
      },
      async fetch(url, options) {
        url satisfies string;
        options satisfies { query: { userId: number } };
        return [];
      },
    });

    verify(IO, io);
  });

  it("should not allow use of effects that were not defined in the program", () => {
    const IO = program([]);
    const io = implementation(IO, function* () {
      // @ts-expect-error
      yield* this.sql`select * from users`;
    });
  });

  it("should not allow incorrect use of an effect", async () => {
    const IO = program([
      trace([
        //
        yields(fn("effect").takes(1).returns("string")),
      ]),
    ]);

    const io = implementation(IO, function* () {
      // @ts-expect-error wrong argument type
      yield* this.effect("string");
      yield* this.effect(1);
    });

    expect(() => verify(IO, io)).toThrow('expected [1] but got ["string"]');

    try {
      // @ts-expect-error no effect handler
      await handle(io, {});
      await handle(io, {
        // @ts-expect-error wrong return type
        async effect(value) {
          return value;
        },
      });
      await handle(io, {
        async effect(value) {
          value satisfies number;
          return "string";
        },
      });
    } catch {}
  });

  test("verify", () => {
    const IO = program([
      trace([
        //
        yields(fn("effect").takes(1).returns("string")),
      ]),
    ]);

    // correct implementation
    verify(
      IO,
      implementation(IO, function* () {
        yield* this.effect(1);
      })
    );

    // incorrect implementation
    expect(() =>
      verify(
        IO,
        implementation(IO, function* () {})
      )
    ).toThrow("expected to yield but returned");

    // incorrect implementation
    expect(() =>
      verify(
        IO,
        implementation(IO, function* () {
          // @ts-expect-error wrong effect
          yield* this.wrongEffect();
        })
      )
    ).toThrow("expected effect but got wrongEffect");

    // incorrect implementation
    expect(() =>
      verify(
        IO,
        implementation(IO, function* () {
          // @ts-expect-error wrong kind of effect
          yield* this.effect``;
        })
      )
    ).toThrow("expected fn but got tag");
  });
});
