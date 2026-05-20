
# fluent-future

[![npm version](https://badge.fury.io/js/fluent-future.svg)](https://www.npmjs.com/package/fluent-future)

Type-safe async operations with functional composition. Like `Promise` but with typed errors and monadic methods.


## Installation

```bash
npm install fluent-future
```


## Problem ❌

```ts
// ❌ Native Promise: err is unknown, try/catch hell
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


## Solution ✅

```ts
// Future: error type preserved, composition without nesting
const dashboard = await Bind({
  user: api.getUser(),
  config: api.getConfig().recover(defaultConfig)
})
.bind({
  posts: ({ user }) => api.getPosts(user.id).recover([])
})
.tap(({ user }) => console.log(`Hello, ${user.name}`))
.tapErr(err => console.log(err))
.recover(null)
// Future<Dashboard | null, never>

```


**What happened:**
- `Bind` run `getUser` and `getConfig` **in parallel**
- `.bind` waited for `user`, then fetched `posts`
- `.recover` handled errors where they occur — not in a global catch
- `.recover(null)` handled all `api.get...` errors across the whole chain
- `.tap` ran a side effect without breaking the chain
- `ApiError` type passed through the entire chain

---


## Quick Start

```ts
import { Future, Resolve, Reject, Bind, Begin } from 'fluent-future'

// Success
const a = Resolve(42)

// Failure
const b = Reject(new ApiError(400, 'Bad Request'))

// From a Promise or function
const c = Future.of(() => JSON.parse('{"x":1}'))

// Composition
const result = await Begin<ApiError>()
  .andThen(() => api.getUser())
  .tap(user => console.log(user))
  .recoverIf(err => err.status === 404, null)
```

---

## Adopt Gradually

`Future` is 100% Promise-compatible. Start using it as a drop-in replacement for `Promise`, and tap into advanced features only when you need them.

### Step 1: Drop-in Replacement

```ts
// Before: native Promise
async function getUser(id: number) {
  const response = await fetch(`/api/users/${id}`)
  return response.json()
}

// After: just wrap with Future.of — everything still works
function getUser(id: number) {
  return Future.of(fetch(`/api/users/${id}`).then(r => r.json()))
}

// await works exactly the same
const user = await getUser(1)
```

### Step 2: Use What You Need

You don't have to learn the entire API upfront. Reach for methods as your error handling grows:

```ts
// Day 1: just await it
const user = await getUser(1)

// Day 5: add a fallback
const user = await getUser(1).recover(null)

// Day 10: handle specific errors
const user = await getUser(1)
  .recoverIf(err => err.status === 404, null)
  .recoverIf(err => err.status === 403, { banned: true })

// Day 30: full composition with parallel loading
const dashboard = await Bind({
  user: getUser(1),
  config: getConfig().recover(defaultConfig)
})
.bind({
  posts: ({ user }) => getPosts(user.id).recover([])
})
```

### Why This Matters

- **No lock-in**: wrap existing Promise-returning functions, don't rewrite them
- **No big refactor**: one endpoint at a time, no flag day
- **No learning cliff**: your team keeps using `await` as usual, learns `recover` later
- **No breaking changes**: `Future` is a `Promise` — drop it into any `Promise.all` or `await` expression

---


## Core Concepts

### Typed Errors

`Future<T, E>` tracks the error type alongside the success type. `E` survives through `map`, `andThen`, and `recover` — the compiler always knows what can fail.

```ts
const user: Future<User, ApiError> = api.getUser()

user
  .map(u => u.name)        // Future<string, ApiError>
  .andThen(name => ...)     // still ApiError
  .recoverIf(               // narrowed but still ApiError
    err => err.status === 404,
    null
  )
```

### Parallel by Default

`Bind` and `.bind` run independent operations concurrently:

```ts
const data = await Bind({
  user: api.getUser(),       // }
  config: api.getConfig(),   // } these three — parallel
  flags: api.getFlags()      // }
})
.bind({
  posts: ({ user }) => api.getPosts(user.id),     // } these two — parallel,
  recs:  ({ user }) => api.getRecs(user.id)       // } wait for user
})
```

### Declarative Error Handling

Handle errors where they happen, not in a single catch-all:

```ts
const result = await api.getUser()
  .recoverIf(err => err.status === 404, null)  // 404 → null
  .throwIf(user => user === null, new Error('User required')) // null → error
  .map(user => user.name)  // user is definitely User here
```

### Promise Compatibility

```ts
// await works natively
const value = await Resolve(42)  // 42

// then / catch work too
Resolve(42).then(v => console.log(v))
Reject(err).catch(e => console.error(e))
```

---

## API

### Creation

```ts
Resolve(42)                     // Future<number>
Resolve()                       // Future<void>
Reject(new ApiError(400))       // Future<never, ApiError>
Future.of(() => JSON.parse(str))          // from function
Future.of(somePromise, err => new ApiError(err)) // with error transform
Begin<ApiError>()               // start a chain with void, error type ApiError
```

### Context Composition

```ts
// Static Bind — creates context from independent Futures
const ctx = await Bind({
  user: api.getUser(),
  posts: api.getPosts(),
  extra: 42                    // plain values work too
})
// ctx: { user: User, posts: Post[], extra: number }

// .bind — extends context with access to previous fields
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
future.map(value => transform(value))     // change success, preserve error
future.mapErr(err => new ApiError(err))   // change error, preserve success
future.andThen(value => anotherFuture())  // chain: success → new Future
future.orElse(err => fallbackFuture())    // chain: error → new Future
```

### Error Handling

```ts
// Error → Success
future.recover(defaultValue)              // all errors → value
future.recoverIf(predicate, fallback)     // matching errors → value

// Success → Error
future.throw(errorValue)                  // all success → error
future.throwIf(predicate, errorValue)     // matching success → error
```

### Side Effects

```ts
future.tap(value => console.log(value))   // log success, chain unchanged
future.tapErr(err => sentry.capture(err)) // log error, chain unchanged
future.finally(() => setLoading(false))   // cleanup regardless of outcome
```

### Unwrapping

```ts
await future.unwrap()                     // T — throws on failure
await future.unwrapOr(default)            // T | default — no throw
await future.unwrapOrElse(err => fallback) // T | fallback — from function
await future.expect('User load failed')   // T — with custom error message
await future.isOk()                       // boolean
await future.isErr()                      // boolean

await future.match({
  ok: value => `Got ${value}`,
  err: error => `Failed: ${error}`
})
```

### Static Methods

```ts
Future.all([a, b, c])     // wait for all, fail if any fails
Future.any([a, b, c])     // first success, AggregateError if all fail
Future.race([a, b, c])    // first to complete (success or failure)
Future.isFuture(obj)      // type guard
```


---

## Real-World Examples

### Dashboard Load

```ts
const dashboard = await Bind({
  user: api.getUser(),
  config: api.getConfig().recover(defaultConfig),
  announcements: api.getAnnouncements().recover([])
})
.bind({
  posts: ({ user }) => api.getPosts(user.id).recover([]),
  notifications: ({ user }) => api.getNotifications(user.id).recover([])
})
.bind({
  feed: ({ posts, announcements }) => [...posts, ...announcements]
})
.tap(({ user }) => analytics.track('dashboard_loaded', { userId: user.id }))
// Future<Dashboard, ApiError>
```

### Form with Dependent Lookups

```ts
const formData = await Bind({
  categories: api.getCategories(),
  countries: api.getCountries()
})
.bind({
  cities: ({ countries }) => api.getCities(countries[0].id),
  subcategories: ({ categories }) => api.getSubcategories(categories[0].id)
})
// Future<FormData, ApiError>
```

### 404 → null, Propagate Other Errors

```ts
const user = await api.getUser()
  .recoverIf(err => err.status === 404, null)
// Future<User | null, ApiError>
// 404 becomes null, everything else stays as error
```

### Chain with Fallback

```ts
const data = await api.getPrimary()
  .orElse(() => api.getSecondary())
  .orElse(() => api.getCached())
  .recover(defaultValue)
// Tries primary → secondary → cached → default
// Never fails — Future<T, never>
```

---

## Comparison

| | Future | Native Promise |
|---|---|---|
| Typed errors | ✅ `Future<T, E>` | ❌ `Promise<T>` (err: unknown) |
| Parallel composition | ✅ `Bind` / `.bind` | ⚠️ `Promise.all` + manual destructure | 
| Error recovery | ✅ `recover` / `recoverIf` | ⚠️ `.catch()` | 
| Success → error | ✅ `throw` / `throwIf` | ❌ manual throw |
| Side effects | ✅ `tap` / `tapErr` / `finally` | ⚠️ manual | 
| Pattern matching | ✅ `match` | ❌ |
| await compatible | ✅ native `await` | ✅ native |

---
