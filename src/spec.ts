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
      fetch(url, options) {
        url satisfies string;
        options satisfies { query: { userId: number } };
        return [];
      },
    });

    verify(IO, io);
  });

  test("example - cli tool", async () => {
    const env = fn("env");
    const getPackageJson = fn("getPackageJson");
    const readFile = fn("readFile");
    const writeFile = fn("writeFile");
    const gitStatus = fn("gitStatus");
    const openai = fn("openai");

    const incorrectOpenaiResponse = openai
      .takes({
        apiKey: "sk-1234567890",
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You decide what version to bump to" },
          {
            role: "user",
            content: [
              `App name: my-app`,
              `App version: 1.0.0`,
              `Git status: ${JSON.stringify({
                staged: [{ path: "src/index.ts" }],
                unstaged: [],
                untracked: [],
              })}`,
              `src/index.ts:`,
              `export function main() {}`,
              `What version should we bump to?`,
            ].join("\n"),
          },
        ],
      })
      .returns("Incorrect response");

    const correctOpenaiResponse = openai
      .takes({
        apiKey: "sk-1234567890",
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You decide what version to bump to" },
          {
            role: "user",
            content: [
              `App name: my-app`,
              `App version: 1.0.0`,
              `Git status: ${JSON.stringify({
                staged: [{ path: "src/index.ts" }],
                unstaged: [],
                untracked: [],
              })}`,
              `src/index.ts:`,
              `export function main() {}`,
              `What version should we bump to?`,
            ].join("\n"),
          },
        ],
      })
      .returns("1.1.0");

    const IO = program([
      trace([
        yields(env.takes("OPENAI_API_KEY").returns("sk-1234567890")),
        yields(getPackageJson.takes().returns({ name: "my-app", version: "1.0.0" })),
        yields(gitStatus.takes().returns({ staged: [], unstaged: [], untracked: [] })),
        returns(undefined),
      ]),

      trace([
        yields(env.takes("OPENAI_API_KEY").returns("sk-1234567890")),
        yields(getPackageJson.takes().returns({ name: "my-app", version: "1.0.0" })),
        yields(
          gitStatus
            .takes()
            .returns({ staged: [{ path: "src/index.ts" }], unstaged: [], untracked: [] })
        ),
        yields(readFile.takes("src/index.ts").returns("export function main() {}")),
        yields(correctOpenaiResponse),
        yields(
          writeFile.takes("package.json", { name: "my-app", version: "1.1.0" }).returns(undefined)
        ),
      ]),

      trace([
        yields(env.takes("OPENAI_API_KEY").returns("sk-1234567890")),
        yields(getPackageJson.takes().returns({ name: "my-app", version: "1.0.0" })),
        yields(
          gitStatus
            .takes()
            .returns({ staged: [{ path: "src/index.ts" }], unstaged: [], untracked: [] })
        ),
        yields(readFile.takes("src/index.ts").returns("export function main() {}")),
        yields(incorrectOpenaiResponse),
        yields(correctOpenaiResponse),
        yields(
          writeFile.takes("package.json", { name: "my-app", version: "1.1.0" }).returns(undefined)
        ),
      ]),

      trace([
        yields(env.takes("OPENAI_API_KEY").returns("sk-1234567890")),
        yields(getPackageJson.takes().returns({ name: "my-app", version: "1.0.0" })),
        yields(
          gitStatus
            .takes()
            .returns({ staged: [{ path: "src/index.ts" }], unstaged: [], untracked: [] })
        ),
        yields(readFile.takes("src/index.ts").returns("export function main() {}")),
        yields(incorrectOpenaiResponse),
        yields(incorrectOpenaiResponse),
        yields(incorrectOpenaiResponse),
        throws(new Error("Three attempts failed")),
      ]),
    ]);

    const io = implementation(IO, function* () {
      const apiKey = yield* this.env("OPENAI_API_KEY");
      const { name: appName, version: appVersion } = yield* this.getPackageJson();
      const gitStatus = yield* this.gitStatus();

      if (gitStatus.staged.length === 0) return;

      const fileContents = [];
      for (const file of gitStatus.staged) {
        const contents = yield* this.readFile(file.path);
        fileContents.push(`${file.path}:`, contents);
      }

      let retryCount = 0;
      do {
        var response = yield* this.openai({
          apiKey,
          model: "gpt-4o",
          messages: [
            { role: "system", content: "You decide what version to bump to" },
            {
              role: "user",
              content: [
                `App name: ${appName}`,
                `App version: ${appVersion}`,
                `Git status: ${JSON.stringify(gitStatus)}`,
                ...fileContents,
                `What version should we bump to?`,
              ].join("\n"),
            },
          ],
        });
      } while (!response.match(/^[0-9]+\.[0-9]+\.[0-9]+$/) && ++retryCount < 3);

      if (retryCount >= 3) throw new Error("Three attempts failed");

      yield* this.writeFile("package.json", { name: appName, version: response });
    });

    verify(IO, io);
  });

  test("example - random number generator", async () => {
    const random = fn("random");

    const IO = program([
      trace([
        //
        yields(random.takes().returns(42)),
        returns(42),
      ]),

      trace([
        // handler throws an error
        yields(random.takes().returns(new Error("random error"))),
        throws(new Error("random error")),
      ]),
    ]);

    const io = implementation(IO, function* () {
      const result = yield* this.random();
      result satisfies number | Error;
      if (result instanceof Error) throw result;
      result satisfies number;
      return result;
    });

    verify(IO, io);

    expect(
      await handle(io, {
        random() {
          return Math.floor(Math.random() * 100);
        },
      })
    ).toEqual(expect.any(Number));

    await expect(
      handle(io, {
        random() {
          throw new Error("random error");
        },
      })
    ).rejects.toThrow("random error");

    await expect(
      handle(io, {
        async random() {
          throw new Error("random error");
        },
      })
    ).rejects.toThrow("random error");
  });

  test("example - dom", async () => {
    const IO = program([
      trace([
        yields(fn("body").takes().returns({ dom: "body" })),
        yields(fn("once").takes({ dom: "body" }, "submit").returns({ name: "" })),
        yields(tag("html").takes("world").returns({ dom: "page" })),
        yields(fn("append").takes({ dom: "body" }, { dom: "page" }).returns({ dom: "body" })),
      ]),
      trace([
        yields(fn("body").takes().returns({ dom: "body" })),
        yields(fn("once").takes({ dom: "body" }, "submit").returns({ name: "username" })),
        yields(tag("html").takes("username").returns({ dom: "page" })),
        yields(fn("append").takes({ dom: "body" }, { dom: "page" }).returns({ dom: "body" })),
      ]),
    ]);

    const io = implementation(IO, function* () {
      const body = yield* this.body();
      const { name } = yield* this.once(body, "submit");
      const page = yield* this.html`<div>Hello, ${name || "world"}!</div>`;
      yield* this.append(body, page);
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
        returns("string"),
      ]),
    ]);

    // correct implementation
    verify(
      IO,
      implementation(IO, function* () {
        return yield* this.effect(1);
      })
    );

    // incorrect implementation
    expect(() =>
      verify(
        IO,
        implementation(IO, function* () {
          yield* this.effect(1);
        })
      )
    ).toThrow(`expected "string" but got undefined`);

    // incorrect implementation
    expect(() =>
      verify(
        IO,
        implementation(IO, function* () {
          yield* this.effect(1);
          yield* this.effect(1);
        })
      )
    ).toThrow(`expected to return but didn't`);

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

  test("verify", () => {
    const IO = program([
      trace([
        //
        yields(fn("effect").takes(1).returns({ a: 1 })),
        returns({ a: 1 }),
      ]),
    ]);

    // correct implementation
    verify(
      IO,
      implementation(IO, function* () {
        return yield* this.effect(1);
      })
    );

    // incorrect implementation
    expect(() =>
      verify(
        IO,
        implementation(IO, function* () {
          yield* this.effect(1);
          return { a: 2 };
        })
      )
    ).toThrow(`expected {"a":1} but got {"a":2}`);
  });

  test("verify", () => {
    const IO = program([
      trace([
        //
        yields(fn("effect").takes(1).returns("string")),
        throws(new Error("error")),
      ]),
    ]);

    // correct implementation
    verify(
      IO,
      implementation(IO, function* () {
        yield* this.effect(1);
        throw new Error("error");
      })
    );

    // incorrect implementation
    expect(() =>
      verify(
        IO,
        implementation(IO, function* () {
          yield* this.effect(1);
        })
      )
    ).toThrow(`expected {} but got undefined`);

    // incorrect implementation
    expect(() =>
      verify(
        IO,
        implementation(IO, function* () {
          yield* this.effect(1);
          yield* this.effect(1);
        })
      )
    ).toThrow(`expected to throw but didn't`);

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
