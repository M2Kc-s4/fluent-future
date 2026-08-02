type ResolveType<T> = {ok: true, value: T}

type RejectType<E> = {ok: false, error: E}

export type FutureType<T, E = Error> = ResolveType<T> | RejectType<E>



    /**
 * Represents an asynchronous operation that can either succeed with a value of type `T` 
 * or fail with an error of type `E`.
 * 
 * `Future` is a monadic wrapper around `Promise` that preserves error types and provides functional composition methods.
 * 
 * @typeparam T - The type of the success value.
 * @typeparam E - The type of the error (default: `Error`).
 * 
 * @example
 * ```ts
 * const user = await Begin<ApiError>()
 *   .andThen(() => api.getUser())
 *   .tap(user => console.log(user))
 *   
 * ```
 */
export class Future<T, E = Error> {
    get [Symbol.toStringTag]() {return 'Future'}
    
    constructor(private readonly promise: Promise<FutureType<T, E>>) {}

    /**
     * Checks if the Future succeeded.
     * 
     * @returns `true` if succeeded, `false` if failed
     * 
     * @example
     * ```ts
     * const future = Resolve(69)
     * console.log(await future.isOk()) // true
     * ```
     */
    isOk() {
        return this.promise.then(res => res.ok)
    }


    /**
     * Checks if the Future failed.
     * 
     * @returns `true` if failed, `false` if succeeded
     * 
     * @example
     * ```ts
     * const future = Reject(new Error('fail'))
     * console.log(await future.isErr()) // true
     * ```
     */
    isErr() {
        return this.promise.then(r => !r.ok)
    }


    /**
     * Extracts the success value, throwing the error if failed.
     * 
     * @returns The success value
     * @throws The error if the Future failed
     * 
     * @example
     * ```ts
     * const value = await Resolve(69).unwrap() // 69
     * ```
     */
    unwrap() {
        return this.promise.then(r => {
            if (r.ok) {
                return r.value
            }

            throw r.error
        })
    }


    /**
     * Extracts the success value or returns a default value.
     * 
     * @param defaultValue - Value to return if the Future failed
     * @returns The success value or default
     * 
     * @example
     * ```ts
     * const value = await Reject(new Error()).unwrapOr(0) // 0
     * ```
     */
    unwrapOr(defaultValue: T) {
        return this.promise.then(r => r.ok ? r.value : defaultValue)
    }


    /**
     * Extracts the success value or computes a default from the error.
     * 
     * @param fn - Function to compute a default value from the error
     * @returns The success value or computed default
     * 
     * @example
     * ```ts
     * const value = await Reject(new Error('404'))
     *   .unwrapOrElse(err => err.message.length) // 3
     * ```
     */
    unwrapOrElse(fn: (error: E) => T) {
        return this.promise.then(r => r.ok ? r.value : fn(r.error))
    }


    /**
     * Extracts the success value with a custom error message.
     * 
     * @param message - Custom error message prefix
     * @returns The success value
     * @throws Error with custom message if the Future failed
     * 
     * @example
     * ```ts
     * await Reject(new Error('fail')).expect('Failed to load user')
     * ```
     */
    expect(message: string) {
        return this.promise.then(r => {
            if (!r.ok) {
                throw new Error(`${message}: ${r.error}`)
            }

            return r.value
        })
    }

    
    inspect(): Future<T, E> {
        return this.tap(console.log).tapErr(console.error)
    }


    /**
     * Transforms the success value.
     * 
     * @param fn - Mapping function
     * @returns A new `Future` with mapped value
     * 
     * @example
     * Future.of(5)
     *   .map(x => x * 2)
     *    // 10
     */
    map<U>(fn: (value: T) => U) {
        return new Future(
            this.promise.then(r => r.ok ? {ok: true, value: fn(r.value)} : r)
        )
    }


    /**
     * Transforms the error value.
     * 
     * @param fn - Error mapping function
     * @returns A new `Future` with the mapped error type
     * 
     * @example
     * ```ts
     * const future = Reject(new Error('original'))
     *   .mapErr(err => new ApiError(err.message))
     * ```
     */
    mapErr<U>(fn: (value: E) => U) {
        return new Future(
            this.promise.then(res => 
                res.ok ? res : { ok: false, error: fn(res.error) }
            )
        )
    }


    /**
     * Chains another `Future` operation.
     * Use when the next operation depends on the previous result.
     * 
     * @param fn - Function returning another `Future`
     * @returns A new `Future`
     * 
     * @example
     * Future.of(5)
     *   .andThen(x => Future.of(x * 2))
     *    // 10
     */
    andThen<U>(fn: (value: T) => Future<U, E>) {
        return new Future(
            this.promise.then(r => r.ok ? fn(r.value).promise : r)
        )
    }


    /**
     * Recovers from an error with another Future.
     * 
     * @param fn - Function that returns a Fallback `Future`
     * @returns A new `Future` that might recover from error
     * 
     * @example
     * ```ts
     * const result = await Reject(new Error('fail'))
     *   .orElse(err => Resolve(0))
     *    // 0
     * ```
     */
    orElse<F>(fn: (error: E) => Future<T, F>): Future<T, F> {
        return new Future(
            this.promise.then(r => r.ok ? r : fn(r.error).promise)
        )
    }


    /**
     * Executes a side effect on the success value without changing the result.
     * 
     * @param fn - Side effect function
     * @returns The same `Future` unchanged
     * 
     * @example
     * ```ts
     * await Resolve(69)
     *   .tap(x => console.log(x)) // logs 69
     *   
     * ```
     */
    tap(fn: (value: T) => any): Future<T, E> {
        return new Future(
            this.promise.then(async res => {
                if (res.ok) await fn(res.value)
                
                return res
            })
        )
    }


    /**
     * Executes a side effect on the error value without changing the result.
     * 
     * @param fn - Side effect function
     * @returns The same `Future` unchanged
     * 
     * @example
     * ```ts
     * await Reject(new Error('fail'))
     *   .tapErr(err => console.error(err)) // logs error
     *   .unwrapOr(0)
     * ```
     */
    tapErr(fn: (error: E) => any): Future<T, E> {
        return new Future(
            this.promise.then(async res => {
                if (!res.ok) await fn(res.error)
                
                return res
            })
        )
    }


    /**
     * Pattern-match the result.
     * 
     * @param patterns - Handlers for success and error cases
     * @returns Whatever the handler returns
     * 
     * @example
     * ```ts
     * const message = await Resolve(69).match({
     *   ok: x => `Got ${x}`,
     *   err: e => `Error: ${e}`
     * })
     * ```
     */
    async match<R>(patterns: {
        ok: (value: T) => R
        err: (error: E) => R
    }) {
        return this.promise.then(r => r.ok ? patterns.ok(r.value) : patterns.err(r.error))
    }


    /**
     * Promise compatibility: extracts the value as a Promise.
     * 
     * @example
     * ```ts
     * const value = await Resolve(69) // 69
     * ```
     */
    then<TFuture1 = T, TFuture2 = never>(
        onfulfilled?: ((value: T) => TFuture1 | PromiseLike<TFuture1>) | null,
        onrejected?: ((reason: any) => TFuture2 | PromiseLike<TFuture2>) | null
    ): Promise<TFuture1 | TFuture2> {
        return this.unwrap().then(onfulfilled, onrejected)
    }


    /**
     * Promise compatibility: catches errors.
     * 
     * @example
     * ```ts
     * const value = await Reject(new Error('fail')).catch(() => 0) // 0
     * ```
     */
    catch<TFuture = never>(
        onrejected?: ((reason: any) => TFuture | PromiseLike<TFuture>) | null
    ): Promise<T | TFuture> {
        return this.unwrap().catch(onrejected)
    }


    /**
     * Converts a matching success value into an error.
     * Non-matching values pass through unchanged.
     * 
     * @typeparam F - The error type to throw
     * @param predicate - Function that returns `true` for values that should become errors
     * @param handler - Function that converts a matching value to an error
     * @returns A new `Future` where matching values become errors of type `F`
     * 
     * @example
     * ```ts
     * // null user → error
     * api.getUser()
     *   .throwIf(
     *     user => user === null,
     *     new ApiError(404, 'User not found')
     *   )
     * // Future<User, ApiError | E>
     * ```
     */
    throwIf<F>(predicate: (value: T) => boolean, handler: (value: T) => F | Promise<F>): Future<T, E | F>
    throwIf<F>(predicate: (value: T) => boolean, error: F): Future<T, E | F>
    throwIf<F>(
        predicate: (value: T) => boolean,
        handlerOrError: F | ((value: T) => F | Promise<F>)
    ): Future<T, E | F> {
        return new Future(
            this.promise.then(r => {
                if (!r.ok) return r

                if (predicate(r.value)) {
                    return { 
                        ok: false,
                        error: typeof handlerOrError === 'function'
                            ? (handlerOrError as Function)(r.value)
                            : handlerOrError
                    }
                }

                return r
            })
        )
    }


    /**
     * Converts a success value into an error unconditionally.
     * After this method, the Future is guaranteed to fail.
     * 
     * @typeparam F - The error type to throw
     * @param handler - Function that converts the success value to an error
     * @returns A new `Future` that always fails — `Future<never, E | F>`
     * 
     * @example
     * ```ts
     * // Always fail with custom error
     * api.getUser()
     *   .throw(user => new Error(`Unexpected user: ${user.id}`))
     * // Future<never, E | Error>
     * ```
     */
    throw<F>(handler: (value: T) => F | Promise<F>): Future<never, E | F>
    throw<F>(error: F): Future<never, E | F>
    throw<F>(handlerOrError: F | ((value: T) => F | Promise<F>)): Future<never, E | F> {
        return new Future(
            this.promise.then(res => {
                if (!res.ok) return res

                return {
                    ok: false,
                    error: typeof handlerOrError === 'function'
                    ? (handlerOrError as Function)(res.value)
                    : handlerOrError
                }
            })
        )
    }


    /**
     * Recovers from any error by converting it to a success value.
     * After this method, the Future is guaranteed to succeed — the error type becomes `never`.
     * 
     * For conditional recovery (only specific errors), use {@link recoverIf}.
     * 
     * @typeparam U - The type of the recovery value
     * @param handler - Function that converts an error to a recovery value (sync or async)
     * @returns A new `Future` that never fails — `Future<T | U, never>`
     * 
     * @example
     * ```ts
     * // Fallback to default on any error
     * const user = await api.getUser()
     *   .recover({id: 0, name: 'Guest' })
     * // Future<User | { id: 0, name: 'Guest' }, never>
     * ```
     * 
     * @example
     * ```ts
     * // Null on any error
     * const data = await api.fetchData()
     *   .recover(null)
     * // Future<Data | null, never>
     * ```
     * 
     * @example
     * ```ts
     * // Async recovery
     * const result = await api.getPrimary()
     *   .recover(async (err) => {
     *     console.error(err)
     *     return await api.getFallback()
     *   })
     * // Future<Primary | Fallback, never>
     * ```
     */
    recover<U>(handler: (error: E) => U | Promise<U>): Future<T | U, never>
    recover<U>(value: U): Future<T | U, never>
    recover<U>(handlerOrValue: U | ((error: E) => U | Promise<U>)) {
        return new Future(
            this.promise.then(res => {
                if (res.ok) return res

                return {
                    ok: true,
                    value:  typeof handlerOrValue === 'function' 
                        ? (handlerOrValue as Function)(res.error)
                        : handlerOrValue
                }
            })
        )
    }


    /**
     * Conditionally recovers from specific errors by converting them to a success value.
     * Errors that don't match the predicate are passed through unchanged.
     * 
     * Unlike {@link recover}, this method preserves the error type `E` for non-matching errors.
     * 
     * @typeparam U - The type of the recovery value
     * @param predicate - Function that returns `true` for errors that should be recovered
     * @param handler - Function that converts a matching error to a recovery value (sync or async)
     * @returns A new `Future` where matching errors become `U`, others remain as `E`
     * 
     * @example
     * ```ts
     * // 404 → null, everything else → error
     * const user = await api.getUser()
     *   .recoverIf(
     *     err => err.status === 404,
     *     null
     *   )
     * // Future<User | null, ApiError>
     * ```
     * 
     * @example
     * ```ts
     * // Rate limit → cached value, server error → still fail
     * const data = await api.fetchData()
     *   .recoverIf(
     *     err => err.status === 429,
     *     err => getCachedData(err.key)
     *   )
     * // Future<Data | CachedData, ApiError>
     * ```
     * 
     * @example
     * ```ts
     * // Multiple error codes → different fallbacks in chain
     * const result = await api.getUser()
     *   .recoverIf(err => err.status === 404, null)
     *   .recoverIf(err => err.status === 403, { banned: true })
     * // Future<User | null | { banned: true }, ApiError>
     * ```
     */
    recoverIf<U>(predicate: (error: E) => boolean, handler: (error: E) => U | Promise<U>): Future<T | U, E>
    recoverIf<U>(predicate: (error: E) => boolean, value: U): Future<T | U, E>
    recoverIf<U>(
        predicate: (error: E) => boolean,
        handlerOrValue: U | ((error: E) => U | Promise<U>)
    ): Future<T | U, E> {
        return new Future(
            this.promise.then(async res => {
                if (res.ok) return res

                if (predicate(res.error)) {
                    return {
                        ok: true,
                        value: typeof handlerOrValue === 'function'
                            ? (handlerOrValue as Function)(res.error)
                            : handlerOrValue
                    }
                }
                return res
            })
        )
    }


    /**
     * Adds new fields to the context that can depend on previous fields.
     * 
     * @param fields - Record of functions that return Futures based on the current context
     * @returns A new `Future` with the extended context
     * 
     * @example
     * ```ts
     * const data = await Bind({ user: api.getUser() })
     *   .bind({
     *     posts: ({ user }) => api.getPosts(user.id),
     *     extra: 42
     *   })
     *   
     * ```
     */
    bind<U extends Record<string, any>>(
        fields: { [K in keyof U]: U[K] | Future<U[K], E> | ((ctx: T) => U[K]) | ((ctx: T) => Future<U[K], E>) }
    ): T extends Record<string, any> ? Future<T & { [K in keyof U]: Awaited<U[K]> }, E> : Future<{ [K in keyof U]: Awaited<U[K]> }, E> {
    
        return this.andThen(ctx => {
            const keys = Object.keys(fields) as (keyof U)[]
            const futures = keys.map(k => {
                const field = fields[k]
                if (Future.isFuture(field)) return field as Future<U[ keyof U], E>

                if (typeof field === 'function') {
                    const result = field(ctx)
                    if (Future.isFuture(result)) {
                        return result as Future<U[keyof U], E>    
                    }
                    else {
                        return Future.of(result) as Future<U[keyof U], E>
                    }
                }
                return Future.of(field) as Future<U[keyof U], E>
            })
            
            return Future.all(futures).map(values => {
                if (typeof ctx === 'object' && ctx !== null && !Array.isArray(ctx)) {
                    const result = {...ctx} as any
                    keys.forEach((k,i) => result[k] = values[i])
                    return result as T & U
                }
                else {
                    const result = {} as any  
                    keys.forEach((k,i) => result[k] = values[i])
                    return result as U
                } 
            })
        }) as any
    }


    /**
     * Creates a `Future` from a value, Promise, or function.
     * 
     * @param input - Value, Promise, or function
     * @param errorTransformer - Optional error transformer
     * @returns A new `Future` instance
     * 
     * @example
     * Future.of(69)
     * Future.of(Promise.resolve(69))
     * Future.of(() => 69)
     */
    static of<T, E = Error>(promise: Promise<T>, errorTransformer?: (error: Error) => E): Future<T, E>
    static of<T, E = Error>(value: T): Future<T, E>
    static of<T, E = Error>(fn: () => T, errorTransformer?: (error: Error) => E): Future<T, E>
    static of<T, E = Error>(
        input: T | PromiseLike<T> | (() => T | PromiseLike<T>),
        errorTransformer?: (error: Error) => E
    ): Future<T, E> {
        return new Future(
            Promise
                .resolve()
                .then(() =>
                    typeof input === 'function'
                        ? (input as () => T | PromiseLike<T>)()
                        : input
                )
                .then(value => ({ ok: true as const, value }))
                .catch(error => ({
                    ok: false as const,
                    error: errorTransformer
                        ? errorTransformer(error)
                        : error as E
                }))
        )
    }


    /**
     * Waits for all Futures to complete.
     * 
     * @param futures - Array of Futures
     * @returns A Future with an array of all values
     * 
     * @example
     * ```ts
     * const [user, posts] = await Future.all([api.getUser(), api.getPosts()])
     * ```
     */
    static all<T, E>(futures: Future<T, E>[]): Future<T[], E> {
        return Future.of(Promise.all(futures))
    }


    /**
     * Waits for the first successful Future.
     * 
     * @param futures - Array of Futures
     * @returns A Future with the first successful value
     * 
     * @example
     * ```ts
     * const data = await Future.any([api.getCache(), api.getServer()])
     * ```
     */
    static any<T, E>(futures: NoInfer<Future<T, E>>[]): Future<T, E> {
        return Future.of(Promise.any(futures.map(f => f)))
    }


    /**
     * Returns the first Future to complete.
     * 
     * @param futures - Array of Futures
     * @returns A Future with the first result
     * 
     * @example
     * ```ts
     * const result = await Future.race([slow(), fast()])
     * ```
     */
    static race<T, E>(futures: Future<T, E>[]): Future<T, E> {
        return Future.of(Promise.race(futures.map(f => f)))
    }    


    /**
     * Creates a new {@link Future} together with its associated resolver functions.
     *
     * Unlike {@link Promise.withResolvers}, calling {@link reject} does not reject
     * the underlying promise. Instead, it completes the {@link Future} with a typed
     * error (`Err`), preserving the `Future<T, E>` semantics.
     *
     * This method is useful when a `Future` needs to be resolved or rejected from
     * outside its executor.
     *
     * @template T The success value type.
     * @template E The error value type.
     * @returns An object containing the created {@link Future} and its resolver functions.
     *
     * @example
     * ```ts
     * const { future, resolve } = Future.withResolvers<number>();
     *
     * setTimeout(() => resolve(42), 1000);
     *
     * console.log(await future.unwrap()); // 42
     * ```
     *
     * @example
     * ```ts
     * const { future, reject } = Future.withResolvers<number, Error>();
     *
     * reject(new Error("Something went wrong"));
     *
     * if (await future.isErr()) {
     *     console.error(await future.unwrapErr());
     * }
     * ```
     */ 
    static withResolvers<T, E = Error>() {
        let resolve!: (value: T) => void
        let reject!: (error: E) => void

        const future = new Future<T, E>(
            new Promise<FutureType<T, E>>(res => {
                resolve = value => res({ ok: true, value })
                reject = error => res({ ok: false, error })
            })
        )

        return {
            future,
            resolve,
            reject
        }
    }


    static isFuture(obj: any): obj is Future<any, any> {
        return obj && obj instanceof Future && obj[Symbol.toStringTag] === 'Future'
    }


    /**
     * Executes a finalizer regardless of success or failure.
     * 
     * @param fn - Finalizer function
     * @returns The same `Future` unchanged
     * 
     * @example
     * ```ts
     * await Future.of(() => api.call())
     *   .finally(() => setIsLoading(false))
     *   
     * ```
     */
    finally(fn: () => any | Promise<any>): Future<T, E> {
        return new Future(
            this.promise.then(async res => {
                await fn()
                return res
        }))
    }
}


/**
 * Creates a successful Future.
 * 
 * @param value - Success value or Promise (optional)
 * @returns A successful Future
 * 
 * @example
 * ```ts
 * Resolve(69)
 * Resolve(Promise.resolve(69))
 * Resolve() // Future<void>
 * ```
 */
export function Resolve<E = Error>(): Future<void, E>
export function Resolve<T, E = Error>(value: T | Promise<T>): Future<T, E>
export function Resolve<T, E = Error>(value?: T | Promise<T>): Future<T | void, E> {
    const val = value !== undefined ? value : (undefined as T)
    const promise = Promise.resolve(val).then(v => ({ ok: true, value: v } as const))
    return new Future(promise)
}


/**
 * Creates a failed Future.
 * 
 * @param error - Error value or Promise
 * @returns A failed Future
 * 
 * @example
 * ```ts
 * Reject(new ApiError(400, 'Bad Request'))
 * Reject(Promise.resolve(new Error('fail')))
 * ```
 */
export const Reject = <E, T = never>(error: E | Promise<E>): Future<T, E> => {
    const promise = Promise.resolve(error).then(e => ({ ok: false, error: e } as const))
    return new Future(promise)
}


/**
     * Starts a void `Future` chain.
     * Use when you don't have an initial value but need error handling.
     * 
     * @returns A void `Future`
     * 
     * @example
     * Begin<ApiError>()
     *   .andThen(() => api.getUser())
     *   
     */
export const Begin = <E = Error>(): Future<void, E> => {
    return Resolve<undefined, E>(undefined)
}


/**
 * Creates a new `Future` context from a record of independent Futures.
 * 
 * @param fields - Record of values to combine
 * @returns A `Future` that resolves to an object with all values
 * 
 * @example
 * ```ts
 * const data = await Bind({
 *   user: api.getUser(),
 *   posts: api.getPosts(),
 *   extra: 42,
 * })
 * // data: { user: User, posts: Post[], extra: number }
 * ```
 */
export const Bind = <F extends Record<string, any>>(fields: F): Future<
    { [K in keyof F]: F[K] extends Future<infer V, any> ? V : F[K] }, 
    { [K in keyof F]: F[K] extends Future<any, infer E> ? E : never }[keyof F]
> => {  
    const keys = Object.keys(fields)
    const futures = keys.map(k => {
        const field = fields[k]
        return Future.isFuture(field) ? field : Resolve(field)
    })

    return Future.all(futures).map(values => {
        const result = {} as any
        keys.forEach((k, i) => result[k] = values[i])
        return result
    }) as any
}