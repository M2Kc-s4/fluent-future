type ResolveType<T> = {ok: true, value: T}

type RejectType<E> = {ok: false, error: E}

export type FutureType<T, E = unknown> = ResolveType<T> | RejectType<E>

type FutureOfType<T> = Promise<T> | (() => Promise<T>) | (() => T)

type ErrorTransformer<E, U = unknown> = (error: U) => E

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
export class Future<T, E = unknown> {
    get [Symbol.toStringTag]() {return 'Future'}
    
    private constructor(private readonly promise: Promise<FutureType<T, E>>) {}


    private static _fromPromise<T, E = unknown>(
        promise: Promise<T>
    ): Future<T, E>

    private static _fromPromise<T, E = unknown>(
        promise: Promise<T>,
        errorTransformer: ErrorTransformer<E>
    ): Future<T, E>

    private static _fromPromise(
        promise: Promise<any>,
        errorTransformer?: ErrorTransformer<any>
    ) {
        return new Future(
            promise
                .then(v => ({ ok: true, value: v } as const))
                .catch((e: unknown) => ({ ok: false, error: errorTransformer ? errorTransformer(e) : e } as const))
        )
    }

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
    mapErr<U = unknown>(fn: (value: E) => U) {
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
     *   .andThen(x => Ok(x * 2))
     *    // 10
     */
    andThen<U, N>(fn: (value: T) => Future<U, N>): Future<U, E | N> {
        return new Future(
            this.promise.then(r => r.ok ? fn(r.value).promise as any : r)
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
     * const result = await Err(new Error('fail'))
     *   .orElse(err => Ok(0))
     *    // 0
     * ```
     */
    orElse<U, N>(fn: (error: E) => Future<U, N>): Future<T | U, N> {
        return new Future(
            this.promise.then(r => r.ok ? r : fn(r.error).promise as any)
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
     * await Ok(69)
     *   .tap(x => console.log(x)) // logs 69
     *   
     * ```
     */
    tap<F = never>(
        fn: (value: T) => void | Promise<void> | Future<void, F>
    ) {
        return this.andThen(ctx => {
            try {
                const result = fn(ctx)

                if (result instanceof Future) {
                    return result.map(() => ctx)
                }

                if (result instanceof Promise) {
                    return Future.of(result).map(() => ctx)
                }

                return Future.resolve(ctx)
            } catch (err) {
                return Future.reject<E | F>(err as any)
            }
        })
    }


    /**
     * Executes a side effect on the error value without changing the result.
     * 
     * @param fn - Side effect function
     * @returns The same `Future` unchanged
     * 
     * @example
     * ```ts
     * await Err(new Error('fail'))
     *   .tapErr(err => console.error(err)) // logs error
     *   .unwrapOr(0)
     * ```
     *
     * 
    */
    tapErr<F = never>(
        fn: (error: E) => void | Promise<void> | Future<void, F>
    ) {
        return this.orElse(res => {
            try {
                const result = fn(res)

                if (result instanceof Future) {
                    return result.andThen(() => Future.reject<E | F>(res))
                }

                if (result instanceof Promise) {
                    return Future.of(result).andThen(() => Future.reject<E | F>(res))
                }

                return Future.reject<E | F>(res)
            } catch (err) {
                return Future.reject<E | F>(err as any)
            }
        })
    }


    /**
     * Pattern-match the result.
     * 
     * @param patterns - Handlers for success and error cases
     * @returns Whatever the handler returns
     * 
     * @example
     * ```ts
     * const message = await Ok(69).match({
     *   ok: x => `Got ${x}`,
     *   err: e => `Error: ${e}`
     * })
     * ```
     */
    match<R>(patterns: {
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
     * const value = await Ok(69) // 69
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
     * const value = await Err(new Error('fail')).catch(() => 0) // 0
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
    throwIf<F extends Error = Error>(
        predicate: (value: T) => boolean, 
        handler: (value: T) => F | Promise<F>
    ): Future<T, E | F>

    throwIf<F extends Error = Error>(
        predicate: (value: T) => boolean, 
        error: F
    ): Future<T, E | F>

    throwIf(
        predicate: any,
        handlerOrError: any
    ) {
        return this.andThen(res =>
            predicate(res)
                ?   Future.reject(
                        typeof handlerOrError === 'function'
                            ? handlerOrError(res)
                            : handlerOrError
                    )
                :   Future.resolve(res)
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
    throw<F extends Error = Error>(
        handler: (value: T) => F
    ): Future<never, E | F>

    throw<F extends Error = Error>(
        error: F
    ): Future<never, E | F>

    throw<F>(
        handlerOrError: F | ((value: T) => F)
    ) {
        return this.andThen(res => 
            Future.reject(
                typeof handlerOrError === 'function'
                    ? (handlerOrError as Function)(res)
                    : handlerOrError
            )
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
    recover<U>(
        handler: (error: E) => U
    ): Future<T | U, never>

    recover<U>(
        value: U
    ): Future<T | U, never>

    recover(handlerOrValue: any) {
        return this.orElse(err => 
            Future.resolve(
                typeof handlerOrValue === 'function' 
                    ? (handlerOrValue as Function)(err)
                    : handlerOrValue
        ))
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
    recoverIf<U>(
        predicate: (error: E) => boolean, 
        handler: (error: E) => U | Promise<U>
    ): Future<T | U, E>

    recoverIf<U>(
        predicate: (error: E) => boolean, 
        value: U
    ): Future<T | U, E>

    recoverIf(
        predicate: any,
        handlerOrValue: unknown
    ) {
        return this.orElse(err => 
            predicate(err)
                ?   Future.resolve(
                        typeof handlerOrValue === 'function'
                            ? (handlerOrValue as Function)(err)
                            : handlerOrValue
                    )
                :   Future.reject(err)
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
    bind<U extends {[K in keyof U]: MaybeBindValue<U[K], any, T>}>(
        fields: U
    ): T extends Record<string, any> 
            ?   Future<T & { [K in keyof U]: ExtractedValue<U[K]> }, E | ExtractedError<U[keyof U]>> 
            :   Future<{ [K in keyof U]: ExtractedValue<U[K]> }, E | ExtractedError<U[keyof U]>> {
        return this.andThen(ctx => {
            const keys = Object.keys(fields) as (keyof U)[]

            const futures = keys.map(k => {
                const field = fields[k] as MaybeBindValue<U[keyof U], E, T>

                
                if (field instanceof Future) return field

                if (typeof field !== 'function') return Future.resolve(field)
                
                const result = (field as ((ctx: T) => Future<U[keyof U], E> | U[keyof U]))(ctx)

                if (result instanceof Future) {
                    return result
                }

                return Future.resolve(result)
            })
            
            return Future.all(futures).map(values => {
                if (typeof ctx === 'object' && ctx !== null && !Array.isArray(ctx)) {
                    const result = {...ctx} as any
                    keys.forEach((k,i) => result[k] = values[i])
                    return result
                }
                else {
                    const result = {} as any  
                    keys.forEach((k,i) => result[k] = values[i])
                    return result
                } 
            })
        }) as any
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


    /**
     * Creates a `Future` from a Promise or function.
     * 
     * @param input - Promise or function
     * @param errorTransformer - Optional error transformer
     * @returns A new `Future` instance
     * 
     * @example
     * Future.of(Promise.resolve(69))
     * Future.of(() => 69)
     */
    static of<T = unknown >(
        value: FutureOfType<T>
    ): Future<T>

    static of<T = unknown, E  = unknown>(
        value: FutureOfType<T>,
        errorTransformer: ErrorTransformer<E>
    ): Future<T, E>

    static of(
        value: FutureOfType<any>, 
        errorTransformer?: ErrorTransformer<any>
    ) {
        if (typeof value === 'function') {
            try {
                const result = value()

                if (result instanceof Promise) {
                    return errorTransformer 
                        ?   Future._fromPromise(result, errorTransformer)
                        :   Future._fromPromise(result)
                }

                return Future.resolve(result)
            }
            catch (e) {
                return errorTransformer
                    ?   Future.reject(errorTransformer(e))
                    :   Future.reject(e)
            }
        }

        return errorTransformer 
            ?   Future._fromPromise(value, errorTransformer)
            :   Future._fromPromise(value)
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
    static all<T, E = unknown>(futures: Future<T, E>[]) {
        return Future.of(Promise.all(futures) as Promise<T[]>) as Future<T[], E>
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
    static any<T, E = unknown>(futures: NoInfer<Future<T, E>>[]) {
        return Future.of(Promise.any(futures.map(f => f))) as Future<T, E>
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
    static race<T, E  = unknown>(futures: Future<T, E>[]) {
        return Future.of(Promise.race(futures.map(f => f))) as Future<T, E>
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
    static withResolvers<T, E extends Error = Error>() {
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
     * Creates a successful Future.
     * 
     * @param value - Success value or Promise (optional)
     * @returns A successful Future
     * 
     * @example
     * ```ts
     * Future.resolve(69) // Future<number, never>
     * Future.resolve(() => console.log(...)) // Future<() => void, never>
     * Future.resolve() // Future<void, never>
     *  ```
     */
    static resolve(): Future<void, never>

    static resolve<T>(value: T): Future<T, never>

    static resolve(value?: unknown) {
        return new Future(Promise.resolve({ok: true, value}))
    }


    /**
     * Creates a failed Future.
     * 
     * @param error - Error value
     * @returns A failed Future
     * 
     * @example
     * ```ts
     * Future.reject(new ApiError(400, 'Bad Request')) // Future<never, ApiError>
     * ```
     */
    static reject<E = unknown>(error: E) {
        return new Future<never, E>(Promise.resolve({ok: false, error}))
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
 * Ok(69) // Future<number, never>
 * Ok(() => console.log(...)) // Future<() => void, never>
 * Ok() // Future<void, never>
 * ```
 */
export function Ok(): Future<void, never>

export function Ok<T = unknown>(value: T): Future<T, never>

export function Ok(value?: unknown) {
    return Future.resolve(value)
}


/**
 * Creates a failed Future.
 * 
 * @param error - Error value
 * @returns A failed Future
 * 
 * @example
 * ```ts
 * Err(new ApiError(400, 'Bad Request')) // Future<never, ApiError>
 * ```
 */
export const Err = <E = unknown>(error: E) => Future.reject(error)


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
export const Begin = <E = unknown>(): Future<void, E> => Future.resolve()


/**
 * Creates a new `Future` context from a record of independent Futures.
 * 
 * @param fields - Record of values or Futures to combine
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
export const Bind = <T extends {[K in keyof T]: Future<T[K], E> | T[K]}, E = unknown>(
    fields: T
): Future<
    {[K in keyof T]: ExtractedValue<T[K]>}, 
    {[K in keyof T]: ExtractedError<T[K]>}[keyof T]
> => {  
    const keys = Object.keys(fields) as [keyof T]
    const futures = keys.map(k => {
        const field = fields[k]
        return Future.isFuture(field) ? field : Future.resolve(field)
    })

    return Future.all(futures).map(values => {
        const result = {} as any
        keys.forEach((k, i) => result[k] = values[i])
        return result
    }) as any
}


type MaybeBindValue<T, E, Ctx> = ((ctx: Ctx) => Future<T, E>) | ((ctx: Ctx) => T) | Future<T, E> | T


type ExtractedValue<T> = 
    T extends Future<infer V, any> 
        ?   V 
        :   T extends Promise<infer V> 
            ?   V 
            :   T extends (...args: any[]) => infer R 
                ?   R extends Future<infer V, any> 
                    ?   V 
                    :   R extends Promise<infer V> 
                        ?   V 
                        :   R 
                :   T

type ExtractedError<T> = 
    T extends Future<any, infer E>
        ?   E
        :   T extends (...args: any[]) => infer R 
            ?   R extends Future<any, infer E> 
                ?   E 
                :   never 
            :   never