import { fn, handle, implementation, program, returns, tag, throws, trace, yields } from "./index";

describe("tracify", () => {
  test("", async () => {
    const sql = tag("sql");
    const fetch = fn("fetch");

    const IO = program([
      trace([
        //
        yields(sql.takes(2, "Bob").returns([])),
        throws(new Error("no users")),
      ]),

      trace([
        //
        yields(sql.takes(NaN, "Alice").returns(undefined)),
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

      if (!users) throw new Error("no users");

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
        strings satisfies TemplateStringsArray;
        params satisfies [number, string];
        return [];
      },
      fetch: (url, options) => {
        url satisfies string;
        options satisfies { query: { userId: number } };
        return [];
      },
    });
  });
});
