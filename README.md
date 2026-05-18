
# fluent-future

> Type-safe async operations with functional composition. Like `Promise` but with typed errors and monadic methods.

## Installation

```bash
npm install fluent-future
```

## Quick Start

```ts
import { Future, Resolve, Reject, Bind, Begin } from 'fluent-future'

// Create from value
const a = Resolve(42)

// Create from Promise
const b = Resolve(fetch('/api/user'))

// Create from function
const c = Future.of(() => JSON.parse('{"x":1}'))

// Chain operations
const result = await Begin<ApiError>()
    .andThen(() => api.getUser())
    .tap(user => console.log(user))
```

## Context Binding (Named Async Context)

```ts
// Native Promise
try {
    const user = await api.getUser()
    let posts
    try {
        posts = await api.getPosts(user.id)
    } catch (e) {
        posts = []
    }
    const comments = await api.getComments(user.id).catch(() => [])
    return { user, posts, comments }
} catch (err) {
    console.error(err)
    return null
}

// Future 
return Bind<ApiError>({
    user: api.getUser()
})
    .bind({
        posts: ({user}) => api.getPosts(user.id).unwrapOr([]),
        comments: ({user}) => api.getComments(user.id).unwrapOr([])
    })
    .tapErr(console.error)
    .unwrapOr(null)
```

## Features

- ✅ **Type-safe errors** — error type `E` is preserved through the whole chain
- ✅ **Promise-compatible** — works with `await`, `Promise.all`, `Promise.race`
- ✅ **Functional methods** — `map`, `andThen`, `tap`, `orElse`, `finally`
- ✅ **Context binding** — `Bind` and `.bind` for named async context
- ✅ **Zero dependencies** — pure TypeScript
- ✅ **Parallel by default** — independent operations run concurrently


## API

### Construction

| Method | Description |
|--------|-------------|
| `Resolve(value?)` | Creates successful Future |
| `Reject(error)` | Creates failed Future |
| `Future.of(value)` | Creates Future from any input |
| `Begin()` | Starts void chain |

### Context Binding

| Method | Description |
|--------|-------------|
| `Bind(fields)` | Combines independent Futures into one context |
| `.bind(fields)` | Adds dependent fields to existing context |

### Instance Methods

| Method | Description |
|--------|-------------|
| `.map(fn)` | Transforms success value |
| `.mapErr(fn)` | Transforms error |
| `.andThen(fn)` | Chains async operation |
| `.tap(fn)` | Side effect on success |
| `.tapErr(fn)` | Side effect on error |
| `.orElse(fn)` | Recovers from error |
| `.finally(fn)` | Runs always |
| `.unwrap()` | Extracts value (throws on error) |
| `.unwrapOr(default)` | Extracts value or default |
| `.match(patterns)` | Pattern matching |

### Static Methods

| Method | Description |
|--------|-------------|
| `Future.all([...])` | Waits for all Futures |
| `Future.any([...])` | First successful Future |
| `Future.race([...])` | First completed Future |

## Example

```ts
const result = await Bind({
  user: api.getUser(),
  products: api.getProducts()
})
.bind({
  cart: ({ user }) => api.getCart(user.id),
  recommendations: ({ products }) => api.getRecommendations(products.map(p => p.id))
})
.tap(({ cart }) => console.log(`Cart has ${cart.items.length} items`))
.map(({ user, products, cart, recommendations }) => ({
  userName: user.name,
  productCount: products.length,
  cartTotal: cart.total,
  recommendations
}))
```
