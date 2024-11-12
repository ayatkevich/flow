# @ayatkevich/tracify

An extensible effect handling library for tracing and verifying generator functions in TypeScript.
Tracify allows you to infer types of effects and their arguments from individual, concrete traces
without manually defining them. This approach not only ensures static type safety but also enables
dynamic verification of implementations, facilitating test-driven development with extensible
effects.

## Table of Contents

- [Introduction](#introduction)
- [Key Features](#key-features)
- [Installation](#installation)
- [Usage](#usage)
  - [Defining a Program](#defining-a-program)
  - [Implementing the Program](#implementing-the-program)
  - [Verifying the Implementation](#verifying-the-implementation)
  - [Handling Side Effects](#handling-side-effects)
- [Error Handling](#error-handling)
- [Test-First Programming](#test-first-programming)
- [Contributing](#contributing)
- [License](#license)

## Introduction

Tracify simplifies the management of side effects in asynchronous generator functions by using
traces to infer types and arguments. This method eliminates the need for manual type definitions for
effects, enhancing both development speed and code reliability.

## Key Features

- **Type Inference from Traces**: Automatically infer effect types and arguments from traces.
- **Dynamic Verification**: Verify implementations against defined traces without executing side
  effects.
- **Error Handling**: Type-safe error handling by returning errors as values.
- **Test-First Development**: Facilitate test-driven development by defining expected behaviors
  upfront.

## Installation

```bash
npm install @ayatkevich/tracify
```

## Usage

### Defining a Program

Use the `program` function to define a set of traces, where each trace is a sequence of steps
(`yields`, `throws`, or `returns`). Tracify uses these traces to infer effect types and arguments.

```typescript
const AI = program([
  trace([
    yields(fn("env").takes("OPENAI_API_KEY").returns("sk-1234567890")),
    yields(
      fn("openai")
        .takes({
          key: "sk-1234567890",
          model: "gpt-4",
          messages: [{ role: "user", content: "hi" }],
        })
        .returns("Hello!")
    ),
    returns("Hello!"),
  ]),
]);
```

This program `AI` defines a single trace with three sequential steps:

1. **Yields** an effect to get the OpenAI API key from environment variables.
2. **Yields** an effect to call the OpenAI API with the obtained key, model, and messages.
3. **Returns** the result of the OpenAI API call.

### Implementing the Program

Implement the program by defining a generator function using the `implementation` function. The
`this` context is a proxy object that infers its interface from the program, providing type-safe
access to effects.

```typescript
const ai = implementation(AI, function* () {
  const apiKey = yield* this.env("OPENAI_API_KEY");
  const result = yield* this.openai({
    key: apiKey,
    model: "gpt-4",
    messages: [{ role: "user", content: "hi" }],
  });
  return result;
});
```

Here, `this.env` and `this.openai` are effect functions inferred from the traces, ensuring that the
correct types are used for arguments and return values.

### Verifying the Implementation

Use the `verify` function to dynamically verify that the implementation conforms to the defined
traces. This process checks that the sequence of effects and their arguments match the expectations
without executing any side effects.

```typescript
verify(AI, ai);
```

### Handling Side Effects

Execute the implementation with actual side effects using the `handle` function, providing concrete
implementations for each effect.

```typescript
const result = await handle(ai, {
  env(name) {
    return process.env[name];
  },
  async openai(params) {
    const response = await openai.chat.completions.create(params);
    return response.text;
  },
});
```

## Error Handling

Effect handlers can throw errors, which are then returned as values in the implementation for
type-safe error handling. This approach allows you to handle errors within your generator function
naturally.

```typescript
const AIWithErrors = program([
  trace([
    yields(fn("env").takes("OPENAI_API_KEY").returns("sk-1234567890")),
    yields(
      fn("openai")
        .takes({
          key: "sk-1234567890",
          model: "gpt-4",
          messages: [{ role: "user", content: "hi" }],
        })
        .returns("Hello!")
    ),
    returns("Hello!"),
  ]),
  trace([
    yields(fn("env").takes("OPENAI_API_KEY").returns("sk-1234567890")),
    yields(
      fn("openai")
        .takes({
          key: "sk-1234567890",
          model: "gpt-4",
          messages: [{ role: "user", content: "hi" }],
        })
        .returns(new Error("Limit exceeded"))
    ),
    throws(new Error("Failed to call OpenAI API")),
  ]),
]);

const aiWithErrors = implementation(AIWithErrors, function* () {
  const apiKey = yield* this.env("OPENAI_API_KEY");
  const result = yield* this.openai({
    key: apiKey,
    model: "gpt-4",
    messages: [{ role: "user", content: "hi" }],
  });
  if (result instanceof Error) {
    throw new Error("Failed to call OpenAI API");
  }
  return result;
});
```

In the handler, you can choose to return or throw an error:

```typescript
const result = await handle(aiWithErrors, {
  env(name) {
    return process.env[name];
  },
  async openai(params) {
    try {
      const response = await openai.chat.completions.create(params);
      return response.text;
    } catch {
      throw new Error("Limit exceeded");
    }
  },
});
```

## Test-First Programming

By programming with traces, you effectively practice test-driven development. You define the
expected behaviors and effects upfront, allowing for immediate verification of your implementation
against these expectations. This method reduces the need for manual type definitions and enhances
code reliability.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## License

This project is licensed under the MIT License.
