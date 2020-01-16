import { Subject } from 'rxjs/Subject'
import { Observable } from 'rxjs/Observable'
import { timer } from 'rxjs/observable/timer'
import { Observer } from 'rxjs/Observer'
import { GroupedObservable } from 'rxjs/operator/groupBy'
import { bufferCount } from 'rxjs/operators/bufferCount'
import { mergeMap } from 'rxjs/operators/mergeMap'
import { groupBy } from 'rxjs/operators/groupBy'
import { filter } from 'rxjs/operators/filter'
import { map } from 'rxjs/operators/map'
import { share } from 'rxjs/operators/share'
import { first } from 'rxjs/operators/first'
import { materialize } from 'rxjs/operators/materialize'
import { dematerialize } from 'rxjs/operators/dematerialize'
import { catchError } from 'rxjs/operators/catchError'
import { tap } from 'rxjs/operators/tap'
import { debounceTime } from 'rxjs/operators/debounceTime'

function uniq(arr: string[]) {
  const obj = {}
  for (let i = 0; i < arr.length; i++) {
      if (!obj[arr[i]]) {
          obj[arr[i]] = 1
      }
  }
  return Object.keys(obj)
}

export interface SingleRequest<R extends string> {
  resource: R
  id: string
}

interface BatchRequest<R extends string> extends SingleRequest<R> {
  batchId: number
  fallbackWhen: FallbackWhen
}

export interface BatchedRequest<R extends string> {
  resource: R
  ids: string[]
}

/**
 * 指定某一个请求在 batch service 中使用 fallback 的策略
 */
export const enum FallbackWhen {
  /**
   * 不使用 fallback
   */
  Never = 0,
  /**
   * 当聚合请求发生错误时，使用 fallback
   */
  Error = 1,
  /**
   * 当单个请求没有和其他请求发生聚合时，使用 fallback
   */
  Alone = 2,
  /**
   * 当聚合请求发生错误或者单个请求没有发生聚合时，都使用 fallback
   */
  Both = 3,
}

export interface BatchRequestMethod<RM extends {} = {}> {
  <K extends KeyofStringOnly<RM> = KeyofStringOnly<RM>, T = RM[K]>(
    resourceName: K,
    resourceId: string,
    fallback?: Observable<T>,
    fallbackWhen?: FallbackWhen
  ): Observable<T>
  <R>(
    resourceName: string,
    resourceId: string,
    fallback?: Observable<R>,
    fallbackWhen?: FallbackWhen
  ): Observable<R>
}

export interface BatchConfig<M extends string> {
  bufferTime?: number
  maxBufferCount?: number | ((resource: M) => number)
  bufferTimer?: (groupedRequests$: GroupedObservable<M, BatchRequest<M>>) => Observable<any>
  maxConcurrent?: number
}

export type RequestMethod<K extends string, R extends {} = {}> = (resource: K, ids: string[]) => Observable<R>
export type GetMatched<RM extends {} = StringObj, R extends {} = {}> =
  (result: R, id: string, resource: KeyofStringOnly<RM>) => RM[typeof resource] | undefined | never

export type KeyofStringOnly<T extends {}> = Extract<keyof T, string>

type StringObj = { [key: string]: any }

export const batchService = <RM extends {} = StringObj, R extends {} = {}>(
  requestMethod: RequestMethod<KeyofStringOnly<RM>, R>,
  getMatched: GetMatched<RM, R>,
  {
    bufferTime: defaultBufferTime = 50, maxBufferCount = 50,
    bufferTimer = () => timer(defaultBufferTime),
    maxConcurrent = 0
  }: BatchConfig<KeyofStringOnly<RM>> = {}
): BatchRequestMethod<RM> => {
  let uid = 1
  const concurrent: number[] = []
  const request$$ = new Subject<BatchRequest<KeyofStringOnly<RM>>>()
  const alone$$ = new Subject<number>()

  const batchStack: Record<string, Record<string, number>> = {}

  const batch$ = request$$.pipe(
    groupBy(
      request => request.resource,
      undefined,
      grouped => {
        if (concurrent.length < maxConcurrent) {
          return grouped.pipe(
            tap<BatchRequest<KeyofStringOnly<RM>>>(br => concurrent.push(br.batchId)),
            debounceTime(0)
          )
        }
        return bufferTimer(grouped)
      },
    ),
    mergeMap(grouped => grouped
      .pipe(
        bufferCount(typeof maxBufferCount === 'function' ? maxBufferCount(grouped.key) : maxBufferCount ),
        // 当只有一个请求在集合中时，做特殊处理，并在其 fallback 为 alone 时从当前流中过滤掉
        tap(requests => requests.length === 1 && alone$$.next(requests[0].batchId)),
        filter(requests => requests.length > 1 || !(requests[0].fallbackWhen & FallbackWhen.Alone)),
        mergeMap(requests =>
          Observable.defer(() => requestMethod(
            grouped.key,
            uniq(requests.map(r => r.id)),
          ))
            .pipe(
              materialize(),
              map(notification => ({
                resource: grouped.key,
                notification,
                batchIds: requests.map(r => r.batchId)
              }))
            )
        ),
      )
    ),
    share(),
  )

  return <K extends KeyofStringOnly<RM> = KeyofStringOnly<RM>, T = RM[K]>(
    resourceName: K,
    resourceId: string,
    fallback?: Observable<T>,
    fallbackWhen: FallbackWhen = fallback ? FallbackWhen.Both : FallbackWhen.Never
  ) => {
    return Observable.create((observer: Observer<T>) => {
      const resourceStack = batchStack[resourceName]
      const stackId = resourceStack && resourceStack[resourceId]
      const batchId = stackId || uid

      const subs = batch$.pipe(
        filter(({ resource, batchIds }) =>
          resource === resourceName && batchIds.indexOf(batchId) > -1
        ),
        map(result => result.notification),
        dematerialize(),
        map(result => getMatched(result, resourceId, resourceName)),
        first(Boolean),
        catchError(e => (fallbackWhen & FallbackWhen.Error) && fallback
          ? fallback
          : Observable.throw(e)
        )
      ).subscribe(observer)

      const aloneSubs = fallback && (fallbackWhen & FallbackWhen.Alone) && alone$$.pipe(
        first(aloneId => aloneId === batchId),
        mergeMap(() => fallback)
      ).subscribe(observer)

      request$$.next({
        batchId,
        fallbackWhen: fallback ? fallbackWhen : FallbackWhen.Never,
        resource: resourceName,
        id: resourceId,
      })
      if (!stackId) {
        uid++
        if (resourceStack) {
          resourceStack[resourceId] = batchId
        } else {
          batchStack[resourceName] = { [resourceId]: batchId }
        }
      }

      return () => {
        aloneSubs && aloneSubs.unsubscribe()
        subs.unsubscribe()
        const concurrentIndex = concurrent.indexOf(batchId)
        concurrentIndex > -1 && concurrent.splice(concurrentIndex, 1)

        batchStack[resourceName] && delete batchStack[resourceName][resourceId]
      }
    })
  }
}
