# fluent-future

[![npm version](https://badge.fury.io/js/fluent-future.svg)](https://www.npmjs.com/package/fluent-future)

`Future<T, E>` — a `Promise` subclass that carries its error type through the whole chain, and gives you the composition tools to actually use that.

```bash
npm install fluent-future
```

## The problem

```ts
// ❌ err is unknown, and every branch needs its own try/catch
async function loadDashboard(): Promise<Dashboard | null> {
    try {
        const user = await api.getUser()

        let posts: Post[]
        try {
            posts = await api.getPosts(user.id)
        } catch {
            posts = []
        }

        const config = await api.getConfig().catch(() => defaultConfig)

        return { user, posts, config }
    } catch (err) {
        console.error(err)
        return null
    }
}
```

## The fix

```ts
const dashboard = await Bind({
    user: api.getUser(),
    config: api.getConfig().recover(defaultConfig)
})
.bind({
    posts: ({ user }) => api.getPosts(user.id).recover([])
})
.tapErr(err => console.log(err))
.recover(null)
// Future<Dashboard | null, never>
```

`Bind` runs `getUser` and `getConfig` in parallel. `.bind` waits for `user`, then fetches `posts` alongside anything else in the same `.bind` call. Each `.recover` handles its own failure right where it happens instead of funneling everything into one catch block. `.tapErr` logs without breaking the chain. The final `.recover(null)` catches whatever's left — and because `recover` always succeeds, the error type collapses to `never`: the compiler knows this chain cannot throw.

---

## Quick start

```ts
import { Future, Ok, Err, Bind, Begin } from 'fluent-future'

const a = Ok(42)                                    // Future<number, never>
const b = Err(new ApiError(400, 'Bad Request'))      // Future<never, ApiError>
const c = Future.of(() => JSON.parse('{"x":1}'))     // Future<any, unknown>

const result = await Begin<ApiError>()
  .andThen(() => api.getUser())
  .tap(user => console.log(user))
  .recoverIf(err => err.status === 404, null)
```

## Adopt it gradually

`Future` *is* a `Promise` — same constructor shape, same `.then`, same `await`. Nothing needs the vocabulary below on day one.

**Step 1 — drop-in replacement, nothing else changes:**

```ts
// before
async function getUser(id: number) {
  const response = await fetch(`/api/users/${id}`)
  return response.json()
}

// after — wrap it, keep the call sites exactly as they were
function getUser(id: number) {
  return Future.of(fetch(`/api/users/${id}`).then(r => r.json()))
}

const user = await getUser(1) // still just works
```

**Step 2 — reach for methods only when the error handling actually grows:**

```ts
// day 1
const user = await getUser(1)

// day 5 — a fallback
const user = await getUser(1).recover(null)

// day 10 — handle specific errors, not all of them
const user = await getUser(1)
  .recoverIf(err => err.status === 404, null)
  .recoverIf(err => err.status === 403, { banned: true })

// day 30 — parallel composition
const dashboard = await Bind({
  user: getUser(1),
  config: getConfig().recover(defaultConfig)
}).bind({
  posts: ({ user }) => getPosts(user.id).recover([])
})
```

No flag day, no rewrite of functions that already return promises — `Future.of` wraps them as-is, and everything downstream is opt-in.

---

## Comparison

| | Future | Native Promise |
|---|---|---|
| Typed errors | `Future<T, E>` | `Promise<T>`, `catch` gives `unknown` |
| Parallel composition | `Bind` / `.bind`, context carries forward | `Promise.all` + manual destructuring |
| Error recovery | `recover` / `recoverIf`, narrows `E` | `.catch()`, loses the type |
| Success → error | `throw` / `throwIf` | manual `throw` inside `.then` |
| Side effects | `tap` / `tapErr` / `finally` | manual, easy to accidentally swallow the value |
| Pattern matching | `match` | — |
| `await` compatible | native | native |

---

## Core concepts

### The error type survives the chain

`E` isn't a comment, it's tracked through `map`, `andThen`, `recoverIf` — anywhere the operation could still fail:

```ts
const user: Future<User, ApiError> = api.getUser()

user
  .map(u => u.name)          // Future<string, ApiError>
  .andThen(name => ...)      // still ApiError, or wider if the next step adds errors
  .recoverIf(                // narrowed, but ApiError isn't gone yet
    err => err.status === 404,
    null
  )
```

The one place this can slip: `Future.of(fn)` without a second argument infers `E` as `unknown`, same as a bare `.catch()`. Pass an error transformer if you want it typed:

```ts
Future.of(() => JSON.parse(str))                                  // Future<any, unknown>
Future.of(somePromise, err => new ApiError(err))                  // Future<Some, ApiError>
```

### Parallel by default

`Bind` and `.bind` fire everything in the object concurrently — nothing runs sequentially unless a later field's function reads an earlier one out of the context:

```ts
const data = await Bind({
  user: api.getUser(),       // }
  config: api.getConfig(),   // } all three in parallel
  flags: api.getFlags()      // }
}).bind({
  posts: ({ user }) => api.getPosts(user.id),  // } both wait for `user`,
  recs:  ({ user }) => api.getRecs(user.id)    // } then run together
})
```

### Only `recover` clears the error type

`recoverIf` narrows — errors that don't match the predicate keep flowing as `E`. `recover` is unconditional — after it, the chain is guaranteed to succeed and `E` becomes `never`. That's the whole reason the dashboard example above ends on `.recover(null)` rather than another `.recoverIf`.

```ts
const result = await api.getUser()
  .recoverIf(err => err.status === 404, null)        // Future<User | null, ApiError>
  .throwIf(user => user === null, new Error('...'))  // narrows back to User
  .map(user => user.name)                            // user is definitely User here
```

### It's still a Promise

```ts
const value = await Ok(42)          // 42
Ok(42).then(v => console.log(v))
Err(err).catch(e => console.error(e))
```

Pass a `Future` anywhere a `Promise` is expected — `Promise.all`, an `await`, a library that takes a promise-returning callback. Nothing needs to know the difference.

---

## API

### Creating one

```ts
Ok(42)                                          // Future<number, never>
Ok()                                             // Future<void, never>
Err(new ApiError(400))                           // Future<never, ApiError>
Future.of(() => JSON.parse(str))                 // Future<any, unknown> — catches sync throws too
Future.of(somePromise, err => new ApiError(err)) // Future<Some, ApiError>
Begin<ApiError>()                                // Future<void, ApiError> — a typed starting point
```

### Context composition

```ts
// Bind — starts a context from independent Futures (or plain values)
const ctx = await Bind({
  user: api.getUser(),
  posts: api.getPosts(),
  extra: 42
})
// ctx: { user: User, posts: Post[], extra: number }

// .bind — extends the context, later fields can read earlier ones
const full = await Bind({ user: api.getUser() })
  .bind({
    posts: ({ user }) => api.getPosts(user.id),
    recs:  ({ user }) => api.getRecommendations(user.id)
  })
  .bind({
    feed: ({ posts, recs }) => mergeFeed(posts, recs)
  })
```

### Transformations

```ts
future.map(fn)      // change the success value, error untouched
future.mapErr(fn)    // change the error value, success untouched
future.andThen(fn)   // success → new Future; error type widens if fn can fail differently
future.orElse(fn)    // error → new Future — a fallback chain
```

### Error handling

```ts
future.recover(value | (err) => value)          // any error → success, E becomes never
future.recoverIf(predicate, value | handler)     // matching errors → success, E stays for the rest

future.throw(value | (val) => value)             // unconditionally becomes a failure
future.throwIf(predicate, value | handler)       // matching success values become a failure
```

### Side effects

```ts
future.tap(fn)       // runs on success, doesn't change the value — can itself fail, widening E
future.tapErr(fn)    // runs on error, re-throws the original error afterward
future.finally(fn)   // runs either way, for cleanup
```

### Getting the value out

```ts
await future.unwrap()                       // T — rejects the promise if the Future failed, same as await
await future.unwrapOr(fallback)              // T | fallback, never throws
await future.unwrapOrElse(err => fallback)   // T | fallback, computed from the error
await future.expect('User load failed')      // T — prefixes a custom message onto the thrown error
await future.isOk()                          // boolean
await future.isErr()                         // boolean

await future.match({
  ok: value => `Got ${value}`,
  err: error => `Failed: ${error}`
})
```

### Static combinators

```ts
Future.all([a, b, c])      // wait for all, fails on the first rejection
Future.any([a, b, c])      // first success, AggregateError if every one fails
Future.race([a, b, c])     // first to settle, success or failure
Future.withResolvers()     // { future, resolve, reject } — resolve/reject it from outside its executor
Future.isFuture(x)         // type guard
```

---

## A couple of real examples

**Form with dependent lookups:**

```ts
const formData = await Bind({
  categories: api.getCategories(),
  countries: api.getCountries()
}).bind({
  cities: ({ countries }) => api.getCities(countries[0].id),
  subcategories: ({ categories }) => api.getSubcategories(categories[0].id)
})
// Future<FormData, ApiError>
```

**404 becomes null, everything else stays an error:**

```ts
const user = await api.getUser()
  .recoverIf(err => err.status === 404, null)
// Future<User | null, ApiError>
```

**Fallback chain with a hard default at the end:**

```ts
const data = await api.getPrimary()
  .orElse(() => api.getSecondary())
  .orElse(() => api.getCached())
  .recover(defaultValue)
// primary → secondary → cached → default, in that order
```

## License

MIT