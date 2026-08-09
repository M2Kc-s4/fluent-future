// future.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Future, Ok, Err, Begin, Bind } from '../src/index';


class ErrorWithStatus extends Error {
    constructor(
        public status: number,
        message: string
    ) {super(message)}
}


describe('Future static methods', () => {
    describe('Future.of', () => {
        it('should create Future from value', async () => {
            const future = Ok(42);
            assert.strictEqual(await future, 42);
            assert.strictEqual(await future.isOk(), true);
        });

        it('should create Future from Promise', async () => {
            const future = Future.of(Promise.resolve(42));
            assert.strictEqual(await future, 42);
        });
        
        it('should create Future from function', async () => {
            const future = Future.of(() => 42);
            assert.strictEqual(await future, 42);
        });

        it('should create Future from async function', async () => {
            const future = Future.of(async () => {
                await Promise.resolve();
                return 42;
            });
            assert.strictEqual(await future, 42);
        });

        it('should catch rejected Promise', async () => {
            const error = new Error('Test error');
            const future = Future.of(Promise.reject(error));
            
            assert.strictEqual(await future.isErr(), true);
            await assert.rejects(future, /Test error/);
        });

        it('should catch thrown error from function', async () => {
            const error = new Error('Test error');
            const future = Future.of(() => { throw error; });
            
            assert.strictEqual(await future.isErr(), true);
            await assert.rejects(future, /Test error/);
        });

        it('should apply errorTransformer', async () => {
            const future = Future.of(
                Promise.reject(new Error('Original')),
                (err) => new Error(`Transformed: ${(err as any).message}`)
            );
            
            assert.strictEqual(await future.isErr(), true);
            await assert.rejects(future, /Transformed: Original/);
        });
    });

    describe('Resolve', () => {
        it('should create successful Future with value', async () => {
            const future = Ok(42);
            assert.strictEqual(await future, 42);
        });

        it('should create successful Future with Promise', async () => {
            const future = Ok(Promise.resolve(42));
            assert.strictEqual(await future, 42);
        });

        it('should create void Future without arguments', async () => {
            const future = Ok();
            assert.strictEqual(await future, undefined);
        });
    });

    describe('Reject', () => {
        it('should create failed Future with error', async () => {
            const error = new Error('Test error');
            const future = Err(error);
            
            assert.strictEqual(await future.isErr(), true);
            await assert.rejects(future, /Test error/);
        });
    });

    describe('Future.Begin', () => {
        it('should create void Future', async () => {
            const future = Begin();
            assert.strictEqual(await future, undefined);
            assert.strictEqual(await future.isOk(), true);
        });

        it('should allow chaining', async () => {
            const result = await Begin()
                .andThen(() => Ok(1))
                .andThen(x => Ok(x + 2))
            
            assert.strictEqual(result, 3);
        });
    });

    describe('Future.all', () => {
        it('should resolve all Futures', async () => {
            const futures = [
                Ok(1),
                Ok(2),
                Ok(3)
            ];
            
            const result = await Future.all(futures);
            assert.deepStrictEqual(result, [1, 2, 3]);
        });

        it('should reject if any Future fails', async () => {
            const error = new Error('Failed');
            const futures = [
                Ok(1),
                Future.of(Promise.reject(error)),
                Ok(3)
            ];
            
            const future = Future.all(futures);
            assert.strictEqual(await future.isErr(), true);
            await assert.rejects(future, /Failed/);
        });

        it('should work with empty array', async () => {
            const result = await Future.all([]);
            assert.deepStrictEqual(result, []);
        });

        it('should preserve error type', async () => {
            class CustomError extends Error {
                name = 'CustomError';
            }
            
            const error = new CustomError('Custom');
            const futures = [Future.of(Promise.reject(error))];
            
            const future = Future.all(futures);
            await assert.rejects(future, (err: CustomError) => {
                assert.strictEqual(err.name, 'CustomError');
                return true;
            });
        });
    });

    describe('Future.any', () => {
        it('should resolve first successful Future', async () => {
            const futures = [
                Future.of(Promise.reject(new Error('Fail 1'))),
                Ok(42),
                Ok(100)
            ];
            
            const result = await Future.any(futures);
            assert.strictEqual(result, 42);
        });

        it('should reject if all fail', async () => {
            const futures = [
                Future.of(Promise.reject(new Error('Fail 1'))),
                Future.of(Promise.reject(new Error('Fail 2')))
            ];
            
            const future = Future.any(futures);
            
            try {
                await future;
                assert.fail('Expected to reject');
            } catch (err: any) {
                assert.strictEqual(err.name, 'AggregateError');
                assert.strictEqual(err.errors.length, 2);
                assert.strictEqual(err.errors[0].message, 'Fail 1');
                assert.strictEqual(err.errors[1].message, 'Fail 2');
            }
            
            assert.strictEqual(await future.isErr(), true);
        });
    });

    describe('Future.race', () => {
        it('should resolve with fastest successful', async () => {
            const slow = new Promise<number>(resolve => setTimeout(() => resolve(100), 100));
            const fast = Promise.resolve(42);
            
            const future = Future.race([
                Future.of(slow),
                Future.of(fast)
            ]);
            
            assert.strictEqual(await future, 42);
        });

        it('should reject with fastest error', async () => {
            const slowSuccess = new Promise<number>(resolve => setTimeout(() => resolve(100), 100));
            const fastError = Promise.reject(new Error('Fast error'));
            
            const future = Future.race([
                Future.of(slowSuccess),
                Future.of(fastError)
            ]);
            
            assert.strictEqual(await future.isErr(), true);
            await assert.rejects(future, /Fast error/);
        });
    });

    describe('Edge cases', () => {
        it('should handle nested Futures in all', async () => {
            const futures = [
                Ok(1).map(x => x * 2),
                Ok(2).map(x => x * 3),
            ];
            
            const result = await Future.all(futures);
            assert.deepStrictEqual(result, [2, 6]);
        });

        it('should handle mixed success/failure in any', async () => {
            const futures = [
                Future.of(Promise.reject(new Error('Fail'))),
                Ok(42)
            ];
            
            const result = await Future.any(futures);
            assert.strictEqual(result, 42);
        });
    });

    describe('Begin', () => {
        it('should create void Future', async () => {
            const future = Begin();
            assert.strictEqual(await future, undefined);
        });

        it('should support type parameters for errors', async () => {
            class ApiError extends Error {}
            const future = Begin<ApiError>()
                .andThen(() => Err(new ApiError('fail')));
            
            assert.strictEqual(await future.isErr(), true);
            await assert.rejects(future, (err: ApiError) => {
                assert.strictEqual(err instanceof ApiError, true);
                return true;
            });
        });

        it('should allow chaining', async () => {
            const result = await Begin<never>()
                .andThen(() => Ok(1))
                .andThen(x => Ok(x + 2))
                
            
            assert.strictEqual(result, 3);
        });
    });

    describe('Bind', () => {
        it('should combine multiple Futures into object', async () => {
            const result = await Bind({
                a: Ok(1),
                b: Ok(2),
                c: Ok(3)
            });
            
            assert.deepStrictEqual(result, { a: 1, b: 2, c: 3 });
        });

        it('should fail if any Future fails', async () => {
            const bind = Bind({
                a: Ok(1),
                b: Err(new Error('b failed')),
                c: Ok(3)
            });
            
            assert.strictEqual(await bind.isErr(), true);
            await assert.rejects(bind, /b failed/);
        });

        it('should handle empty object', async () => {
            const result = await Bind({})
            assert.deepStrictEqual(result, {});
        });

        it('should preserve types through chain', async () => {
            const result = await Bind({
                user: Ok({ id: 1, name: 'Alice' }),
            })
            .bind({
                greeting: (ctx) => Ok(`Hello, ${ctx.user.name}!`)
            })
            
            assert.strictEqual(result.greeting, 'Hello, Alice!');
        });
    });

    describe('Future.prototype.bind', () => {
        it('should extend context with new fields', async () => {
            const result = await Ok({ userId: 1 })
                .bind({
                    userName: (ctx) => Ok(`User_${ctx.userId}`),
                    timestamp: Ok(Date.now()),
                })
            
            assert.strictEqual(result.userId, 1);
            assert.strictEqual(result.userName, 'User_1');
            assert.ok(result.timestamp > 0);
        });

        it('should handle dependent fields', async () => {
            const result = await Ok({ multiplier: 2 })
                .bind({
                    a: (ctx) => Ok(10 * ctx.multiplier),
                    b: (ctx) => Ok(20 * ctx.multiplier)
                })
                .bind({
                    sum: (ctx) => Ok(ctx.a + ctx.b)
                })
            
            assert.strictEqual(result.sum, 60); // (20 + 40)
        });

        it('should fail if any bound Future fails', async () => {
            const future = Bind({ id: 1 })
                .bind({
                    user: () => Err(new Error('Failed to load user')),
                    posts: () => Ok([])
                });
            
            assert.strictEqual(await future.isErr(), true);
            await assert.rejects(future, /Failed to load user/);
        });

        it('should handle async transformations', async () => {
            const result = await Ok(5)
                .bind({
                    doubled: (x) => Ok(x * 2),
                    tripled: (x) => Ok(x * 3)
                })
                .bind({
                    total: (ctx) => Ok(ctx.doubled + ctx.tripled)
                })
            
            assert.strictEqual(result.total, 25); // (10 + 15)
        });

        it('should work with zero fields', async () => {
            const result = await Ok(42)
                .bind({})
            
            assert.deepEqual(result, {});
        });
    });

    describe('Chaining Bind with bind', () => {
        it('should combine Bind and bind seamlessly', async () => {
            const result = await Bind({
                initial: Ok(100)
            })
            .bind({
                doubled: (ctx) => Ok(ctx.initial * 2),
                tripled: (ctx) => Ok(ctx.initial * 3)
            })
            .bind({
                sum: (ctx) => Ok(ctx.doubled + ctx.tripled)
            })
            ;
            
            assert.strictEqual(result.sum, 500); // (200 + 300)
        });

        it('should handle errors in mixed chains', async () => {
            let cleanupCalled = false;
            
            const future = Bind({
                    a: Ok(1),
                    b: Ok(2),
                })
                .bind({
                    c: () => Err(new Error('Bind failed'))
                })
                .finally(() => { cleanupCalled = true; });
            
            await assert.rejects(future, /Bind failed/);
            assert.strictEqual(cleanupCalled, true);
        });
    });

    describe('simple values without Future wrapper', () => {
        it('should bind plain object to Future', async () => {
            const result = await Bind({
                a: 1,
                b: 'hello',
                c: true
            })

            assert.deepStrictEqual(result, { a: 1, b: 'hello', c: true })
        })

        it('should mix plain values and Futures', async () => {
            const result = await Bind({
                a: Ok(1),
                b: 'hello',
                c: Ok(true)
            })

            assert.deepStrictEqual(result, { a: 1, b: 'hello', c: true })
        })
    })

    describe('functions returning direct values (no Future wrapper)', () => {
        it('should bind function that returns plain value', async () => {
            const ctx = { multiplier: 5 }
            const result = await Ok(ctx)
                .bind({
                    doubled: ({ multiplier }) => multiplier * 2
                })
                

            assert.deepStrictEqual(result, { multiplier: 5, doubled: 10 })
        })

        it('should bind multiple functions returning plain values', async () => {
            const result = await Ok({ x: 10, y: 5 })
                .bind({
                    sum: ({ x, y }) => x + y,
                    diff: ({ x, y }) => x - y,
                    mul: ({ x, y }) => x * y
                })

            assert.deepStrictEqual(result, { x: 10, y: 5, sum: 15, diff: 5, mul: 50 })
        })

        it('should chain functions that depend on previous bind results', async () => {
            const result = await Ok({ userId: 1 })
                .bind({
                    userName: () => 'Alice'
                })
                .bind({
                    greeting: ({ userName }) => `Hello, ${userName}!`
                })

            assert.deepStrictEqual(result, { userId: 1, userName: 'Alice', greeting: 'Hello, Alice!' })
        })
    })

    describe('mixed: functions returning Future and direct values', () => {
        it('should mix async and sync functions', async () => {
            const result = await Ok({ userId: 1 })
                .bind({
                    userName: () => Ok('Alice'),
                    timestamp: () => Date.now()           
                })

            assert.strictEqual(result.userName, 'Alice')
            assert.strictEqual(typeof result.timestamp, 'number')
        })

        it('should handle async functions with ctx', async () => {
            const result = await Bind({ userId: 1 })
                .bind({
                    posts: ({ userId }) => Ok([`post_${userId}_1`]),
                })
                .bind({
                    postCount: ({ posts }) => posts.length
                })

            assert.deepStrictEqual(result.posts, ['post_1_1'])
            assert.strictEqual(result.postCount, 1)
        })
    })

    describe('edge cases', () => {
        it('should handle empty bind', async () => {
            const future = Ok({ a: 1 })
            const result = await future.bind({})
            assert.deepStrictEqual(result, { a: 1 })
        })

        it('should handle null and undefined', async () => {
            const result = await Ok({})
                .bind({
                    n: null,
                    u: undefined
                })

            assert.strictEqual(result.n, null)
            assert.strictEqual(result.u, undefined)
        })

        it('should handle functions that return null/undefined', async () => {
            const result = await Ok({})
                .bind({
                    n: () => null,
                    u: () => undefined
                })

            assert.strictEqual(result.n, null)
            assert.strictEqual(result.u, undefined)
        })

        it('should handle array values', async () => {
            const result = await Ok({})
                .bind({
                    arr: [1, 2, 3],
                    arrFromFn: () => [4, 5, 6]
                })

            assert.deepStrictEqual(result.arr, [1, 2, 3])
            assert.deepStrictEqual(result.arrFromFn, [4, 5, 6])
        })
    })

    describe('error handling', () => {
        it('should stop bind chain on Future error', async () => {
            const error = new Error('Failed')
            const future = Bind({ userId: 1 })
                .bind({
                    userName: () => Err(error)
                })
                .bind({
                    extra: () => 'never reaches'
                })

            assert.strictEqual(await future.isErr(), true)
            await assert.rejects(future, /Failed/)
        })

        it('should not execute subsequent binds after error', async () => {
            let executed = false
            const future = Bind({ userId: 1 })
                .bind({
                    userName: () => Err(new Error('fail'))
                })
                .bind({
                    extra: () => {
                        executed = true
                        return 'value'
                    }
                })

            await future.catch(() => {})
            assert.strictEqual(executed, false)
        })
    })
});


describe('Future.prototype.recover', () => {
    it('should convert error to success value', async () => {
        const future = Err(new Error('fail'))
            .recover(42)
        
        assert.strictEqual(await future, 42)
        assert.strictEqual(await future.isOk(), true)
    })

    it('should pass through success value unchanged', async () => {
        const future = Ok(10)
            .recover(42)
        
        assert.strictEqual(await future, 10)
    })

    it('should support async handler', async () => {
        const future = Err(new Error('fail'))
            .recover(async (err) => {
                await Promise.resolve()
                return `recovered: ${err.message}`
            })
        
        assert.strictEqual(await future, 'recovered: fail')
    })

    it('should make error type never after recover', async () => {
        const future = Err(new Error('fail'))
            .recover('default')
        
        assert.strictEqual(await future.isErr(), false)
        assert.strictEqual(await future.unwrapOr('fallback'), 'default')
    })

    it('should handle success value union type', async () => {
        const future: Future<number, Error> = Err(new Error('fail'))
        const recovered = future.recover('string')
        
        const value = await recovered
        assert.strictEqual(value, 'string')
    })

    it('should handle thrown errors in handler', async () => {
        const future = Err(new Error('original'))
            .recover(() => {
                throw new Error('handler failed')
            })
        
        await assert.rejects(future, /handler failed/)
    })

    it('should work with multiple recovers in chain', async () => {
        const future = Err(new Error('fail'))
            .recover('first')
            .recover('second')
        
        assert.strictEqual(await future, 'first')
    })
})

describe('Future.prototype.recoverIf', () => {
    it('should recover matching error', async () => {
        const error = new ErrorWithStatus(404, 'Not Found')
        const future = Err(error)
            .recoverIf(
                err => err.status === 404,
                null
            )
        
        assert.strictEqual(await future, null)
        assert.strictEqual(await future.isOk(), true)
    })

    it('should pass through non-matching error', async () => {
        const error = new ErrorWithStatus(500, "Server Error")

        const future = Err(error)
            .recoverIf(
                err => err.status === 404,
                null
            )
            .mapErr(err => new Error(err.message))
        
        assert.strictEqual(await future.isErr(), true)
        await assert.rejects(future, /Server Error/)
    })

    it('should pass through success value', async () => {
        const future = Ok(42)
            .recoverIf(
                err => true,
                0
            )
        
        assert.strictEqual(await future, 42)
    })

    it('should support async handler', async () => {
        const error = { status: 429, retryAfter: 60 }
        const future = Err(error)
            .recoverIf(
                err => err.status === 429,
                async (err) => {
                    await Promise.resolve()
                    return { retryAfter: err.retryAfter }
                }
            )
        
        const result = await future
        assert.deepStrictEqual(result, { retryAfter: 60 })
    })

    it('should handle union success type', async () => {
        const error = { status: 404 }
        const future: Future<string, { status: number }> = Err(error)
        const recovered = future.recoverIf(
            err => err.status === 404,
            0
        )
        
        const value = await recovered
        assert.strictEqual(value, 0)
    })

    it('should chain multiple recoverIf calls', async () => {
        const error = { status: 403, message: 'Forbidden' }
        const future = Err(error)
            .recoverIf(
                err => err.status === 404,
                'not found'
            )
            .recoverIf(
                err => err.status === 403,
                'forbidden'
            )
        
        assert.strictEqual(await future, 'forbidden')
    })

    it('should only recover first matching predicate in chain', async () => {
        const future = Err(new Error('fail'))
            .recoverIf(
                () => true,
                'first match'
            )
            .recoverIf(
                () => true,
                'second match'
            )
        
        assert.strictEqual(await future, 'first match')
    })

    it('should pass through when no predicate matches', async () => {
        const error = { status: 500, message: 'Server Error' }
        const future = Err(error)
            .recoverIf(err => err.status === 404, 'not found')
            .recoverIf(err => err.status === 403, 'forbidden')
            .mapErr(err => new Error(err.message))
        
        assert.strictEqual(await future.isErr(), true)
        await assert.rejects(future, /Server Error/)
    })

    it('should preserve error type through chain', async () => {
        class ApiError extends Error {
            constructor(public status: number) { super() }
        }
        
        const error = new ApiError(500)
        const future: Future<never, ApiError> = Err(error)
        const recovered = future.recoverIf(
            err => err.status === 404,
            'not found'
        )
        
        await assert.rejects(recovered, (err: ApiError) => {
            assert.strictEqual(err instanceof ApiError, true)
            assert.strictEqual(err.status, 500)
            return true
        })
    })

    it('should handle thrown errors in handler', async () => {
        const future = Err(new Error('original'))
            .recoverIf(
                () => true,
                () => { throw new Error('handler failed') }
            )
        
        await assert.rejects(future, /handler failed/)
    })

    it('should handle thrown errors in predicate', async () => {
        const future = Err(new Error('original'))
            .recoverIf(
                () => { throw new Error('predicate failed') },
                'value'
            )
        
        await assert.rejects(future, /predicate failed/)
    })

    it('should work with real-world 404 scenario', async () => {
        const api = {
            getUser: (id: number): Future<{id: number, name: string}, {status: number, message: string}> => 
                id === 0 
                    ? Err({ status: 404, message: 'User not found' })
                    : Ok({ id, name: 'Alice' })
        }
        
        const user = api.getUser(0)
            .recoverIf(
                err => err.status === 404,
                null
            )
        
        assert.strictEqual(await user, null)
        
        const existingUser = api.getUser(1)
            .recoverIf(
                err => err.status === 404,
                null
            )
        
        assert.deepStrictEqual(await existingUser, { id: 1, name: 'Alice' })
    })
})