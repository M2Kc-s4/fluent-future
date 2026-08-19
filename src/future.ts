type MaybeBindValue<T, E, Ctx> =
    | ((ctx: Ctx) => Future<T, E>)
    | ((ctx: Ctx) => T)
    | Future<T, E>
    | T


type ExtractedValue<T> =
    T extends Future<infer V, any>
        ? V
        : T extends PromiseLike<infer V>
            ? V
            : T extends (...args: any[]) => infer R
                ? R extends Future<infer V, any>
                    ? V
                    : R extends PromiseLike<infer V>
                        ? V
                        : R
                : T


type ExtractedError<T> =
    T extends Future<any, infer E>
        ? E
        : T extends (...args: any[]) => infer R
            ? R extends Future<any, infer E>
                ? E
                : never
            : never


export class Future<T, E = unknown> extends Promise<T> {
    get [Symbol.toStringTag]() {
        return 'Future'
    }

    constructor(
        executor: (
            resolve: (value: T | PromiseLike<T>) => void,
            reject: (reason: E) => void,
        ) => void
    ) {
        super(executor)
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

    static resolve<T>(
        value: T | PromiseLike<T>
    ): Future<T, never>

    static resolve<T>(
        value?: T | PromiseLike<T>
    ): Future<T, never> {
        return new Future<T, never>((resolve) => {
            resolve(value as T)
        })
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
    static reject<E = unknown>(
        error: E
    ): Future<never, E> {
        return new Future<never, E>((_, reject) => {
            reject(error)
        })
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
    static of<T, E = unknown>(
        value:
            | PromiseLike<T>
            | (() => T | PromiseLike<T>),
        errorTransformer?: (error: unknown) => E
    ): Future<T, E> {
        try {
            const result =
                typeof value === 'function'
                    ? (value as () => PromiseLike<T>)()
                    : value

            return Future.fromPromise(
                Promise.resolve(result),
                errorTransformer
            )
        } catch (error) {
            return Future.reject(
                errorTransformer
                    ? errorTransformer(error)
                    : error as E
            )
        }
    }

    static fromPromise<T, E = unknown>(
        promise: PromiseLike<T>,
        errorTransformer?: (error: unknown) => E
    ): Future<T, E> {
        return new Future<T, E>((resolve, reject) => {
            Promise.resolve(promise).then(
                resolve,
                error => {
                    reject(
                        errorTransformer
                            ? errorTransformer(error)
                            : error as E
                    )
                }
            )
        })
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
    isOk(): Promise<boolean> {
        return this.then(
            () => true,
            () => false
        )
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
    isErr(): Promise<boolean> {
        return this.then(
            () => false,
            () => true
        )
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
    unwrap(): Promise<T> {
        return this
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
    unwrapOr(defaultValue: T): Promise<T> {
        return this.catch(() => defaultValue)
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
    unwrapOrElse(fn: (error: E) => T): Promise<T> {
        return this.catch(error => fn(error as E))
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
    expect(message: string): Promise<T> {
        return this.catch(error => {
            throw new Error(
                `${message}: ${String(error)}`
            )
        })
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
    map<U>(
        fn: (value: T) => U
    ): Future<U, E> {
        return Future.fromPromise(
            this.then(value => fn(value))
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
    mapErr<U>(
        fn: (error: E) => U
    ): Future<T, U> {
        return Future.fromPromise(
            this.catch(error => {
                throw fn(error as E)
            })
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
    andThen<U, N>(
        fn: (value: T) => Future<U, N>
    ): Future<U, E | N>

    andThen<U>(
        fn: (value: T) => PromiseLike<U>
    ): Future<U, E>

    andThen<U>(
        fn: (value: T) => PromiseLike<U> | Future<U, any>
    ): Future<U, E> {
        return Future.fromPromise(
            this.then(value => fn(value))
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
    orElse<U, N>(
        fn: (error: E) => Future<U, N>
    ): Future<T | U, N>

    orElse<U>(
        fn: (error: E) => PromiseLike<U>
    ): Future<T | U, unknown>

    orElse<U>(
        fn: (error: E) => PromiseLike<U> | Future<U, any>
    ): Future<T | U, any> {
        return Future.fromPromise(
            this.catch(error => fn(error as E))
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
        fn: (
            value: T
        ) =>
            | unknown
            | PromiseLike<unknown>
            | Future<unknown, F>
    ): Future<T, E | F> {
        return Future.fromPromise(
            this.then(value =>
                Promise.resolve(fn(value)).then(() => value)
            )
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
     * await Err(new Error('fail'))
     *   .tapErr(err => console.error(err)) // logs error
     *   .unwrapOr(0)
     * ```
     *
     * 
    */
    tapErr<F = never>(
        fn: (
            error: E
        ) =>
            | unknown
            | PromiseLike<unknown>
            | Future<unknown, F>
    ): Future<T, E | F> {
        return Future.fromPromise(
            this.catch(error => 
                Promise.resolve(fn(error)).then(() => {
                    throw error
                })
            )
        )
    }

    inspect(): Future<T, E> {
        return this
            .tap(value => console.log(value))
            .tapErr(error => console.error(error))
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
    }): Promise<R> {
        return this.then(
            patterns.ok,
            error => patterns.err(error as E)
        )
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
    throwIf<F>(
        predicate: (value: T) => boolean,
        handler: (value: T) => F 
    ): Future<T, E | F>

    throwIf<F>(
        predicate: (value: T) => boolean,
        error: F
    ): Future<T, E | F>

    throwIf<F>(
        predicate: (value: T) => boolean,
        handlerOrError:
            | F
            | ((value: T) => F)
    ): Future<T, E | F> {
        return this.andThen(value => {
            if (!predicate(value)) {
                return Future.resolve(value)
            }

            const error =
                typeof handlerOrError === 'function'
                    ? (handlerOrError as any)(value)
                    : handlerOrError

            return Future.reject(error)
        })
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
    throw<F>(
        handler: (value: T) => F
    ): Future<never, E | F>

    throw<F>(
        error: F
    ): Future<never, E | F>

    throw<F>(
        handlerOrError:
            | F
            | ((value: T) => F)
    ): Future<never, E | F> {
        return this.andThen(value => {
            const error =
                typeof handlerOrError === 'function'
                    ? (handlerOrError as any)(value)
                    : handlerOrError

            return Future.reject(error)
        })
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
        handler: (error: E) => U | PromiseLike<U>
    ): Future<T | U, never>

    recover<U>(
        value: U
    ): Future<T | U, never>

    recover(): Future<T | void, never>

    recover<U>(
        handlerOrValue?:
            | U
            | ((error: E) => U | PromiseLike<U>)
    ): Future<T | U, never> {
        return Future.fromPromise(
            this.catch(error => {
                return typeof handlerOrValue === 'function'
                    ? (handlerOrValue as any)(error as E)
                    : handlerOrValue
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
    recoverIf<U>(
        predicate: (error: E) => boolean,
        handler: (error: E) => U | PromiseLike<U>
    ): Future<T | U, E>

    recoverIf<U>(
        predicate: (error: E) => boolean,
        value: U
    ): Future<T | U, E>

    recoverIf<U>(
        predicate: (error: E) => boolean,
        handlerOrValue:
            | U
            | ((error: E) => U | PromiseLike<U>)
    ): Future<T | U, E> {
        return Future.fromPromise(
            this.catch(error => {
                const err = error as E

                if (!predicate(err)) {
                    throw err
                }

                return typeof handlerOrValue === 'function'
                    ? (handlerOrValue as any)(err)
                    : handlerOrValue
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
    bind<U extends {[K in keyof U]: MaybeBindValue<U[K], E, T>}>(
        fields: U
    ): T extends Record<string, any>
        ?   Future<
                T & {[K in keyof U]: ExtractedValue<U[K]>},
                E | ExtractedError<U[keyof U]>
            >
        :   Future<
                {[K in keyof U]: ExtractedValue<U[K]>},
                E | ExtractedError<U[keyof U]>
            > {
        return this.andThen(ctx => {
            const keys =
                Object.keys(fields) as (keyof U)[]

            const futures = keys.map(key => {
                const field = fields[key] as MaybeBindValue<U[keyof U], E, T>

                if (field instanceof Future) {
                    return field
                }

                if (typeof field !== 'function') {
                    return Future.resolve(field)
                }

                const result = (field as any)(ctx)

                return Future.isFuture(result)
                    ? result
                    : Future.resolve(result)
            })

            return Future.all(futures).map(values => {
                if (
                    typeof ctx === 'object' &&
                    ctx !== null &&
                    !Array.isArray(ctx)
                ) {
                    const result = {
                        ...(ctx as object)
                    } as any

                    keys.forEach((key, i) => {
                        result[key] = values[i]
                    })

                    return result
                }

                const result = {} as any

                keys.forEach((key, i) => {
                    result[key] = values[i]
                })

                return result
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
    finally(
        fn: () => unknown | PromiseLike<unknown>
    ): Future<T, E> {
        return Future.fromPromise(
            Promise.prototype.finally.call(this, fn)
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
    static all<T extends readonly unknown[]>(
        values: T
    ): Future<
        { -readonly [K in keyof T]: Awaited<T[K]> },
        never
    > {
        return Future.fromPromise(
            Promise.all(values)
        ) as any
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
    static race<T extends readonly unknown[]>(
        values: T
    ): Future<Awaited<T[number]>, unknown> {
        return Future.fromPromise(
            Promise.race(values)
        ) as any
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
    static any<T extends readonly unknown[]>(
        values: T
    ): Future<Awaited<T[number]>, unknown> {
        return Future.fromPromise(
            Promise.any(values)
        ) as any
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
    static withResolvers<T, E = unknown>() {
        let resolve!: (
            value: T | PromiseLike<T>
        ) => void

        let reject!: (error: E) => void

        const future = new Future<T, E>(
            (res, rej) => {
                resolve = res
                reject = rej
            }
        )

        return {
            future,
            resolve,
            reject,
        }
    }

    static isFuture(
        value: unknown
    ): value is Future<any, any> {
        return value instanceof Future
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

export function Ok<T>(
    value: T | PromiseLike<T>
): Future<T, never>

export function Ok<T>(
    value?: T | PromiseLike<T>
): Future<T, never> {
    return Future.resolve(value as T | PromiseLike<T>)
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
export function Err<E = unknown>(
    error: E
): Future<never, E> {
    return Future.reject(error)
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
export function Begin<E = unknown>(): Future<void, E> {
    return Future.resolve()
}


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
export const Bind = <
    T extends {
        [K in keyof T]:
            | Future<T[K], E>
            | T[K]
    },
    E = unknown
>(
    fields: T
): Future<
    {
        [K in keyof T]: ExtractedValue<T[K]>
    },
    {
        [K in keyof T]: ExtractedError<T[K]>
    }[keyof T]
> => {
    const keys =
        Object.keys(fields) as (keyof T)[]

    const futures = keys.map(key => {
        const field = fields[key]

        return Future.isFuture(field)
            ? field
            : Future.resolve(field)
    })

    return Future.all(futures).map(values => {
        const result = {} as any

        keys.forEach((key, i) => {
            result[key] = values[i]
        })

        return result
    }) as any
}