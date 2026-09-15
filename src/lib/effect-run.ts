import { Cause, Effect, Exit, Option } from 'effect'

export function unwrapExit<A, E>(exit: Exit.Exit<A, E>): A {
  if (Exit.isSuccess(exit)) return exit.value
  const fail = Cause.failureOption(exit.cause)
  if (Option.isSome(fail)) throw fail.value
  throw Cause.squash(exit.cause)
}

export function runSyncFail<A, E>(effect: Effect.Effect<A, E>): A {
  return unwrapExit(Effect.runSyncExit(effect))
}

export function runPromiseFail<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromiseExit(effect).then(unwrapExit)
}
