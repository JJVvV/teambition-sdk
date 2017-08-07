import { Observable } from 'rxjs/Observable'
import { QueryToken } from 'reactivedb'
import { CacheStrategy, SDK, SDKFetch, TaskSchema } from 'teambition-sdk-core'
import { TaskId } from 'teambition-types'

export function getTaskFetch(
  this: SDKFetch,
  taskId: TaskId,
  query?: any
): Observable<TaskSchema> {
  return this.get<TaskSchema>(`events/${taskId}`, query)
}

SDKFetch.prototype.getTask = getTaskFetch

declare module 'teambition-sdk-core/dist/cjs/SDKFetch' {
  // tslint:disable-next-line no-shadowed-variable
  interface SDKFetch {
    getTask: typeof getTaskFetch
  }
}

export function getTask(
  this: SDK,
  taskId: TaskId,
  query?: any
): QueryToken<TaskSchema> {
  return this.lift<TaskSchema>({
    cacheValidate: CacheStrategy.Cache,
    tableName: 'Task',
    request: this.fetch.getTask(taskId, query),
    query: {
      where: { _id: taskId }
    },
    assocFields: {
      executor: [ '_id', 'name', 'avatarUrl' ],
      stage: ['_id', 'name'],
      tasklist: ['_id', 'title'],
      subtasks: [
        '_id', '_projectId', '_creatorId', 'content', 'isDone', '_executorId',
        '_taskId', 'dueDate', 'order', 'created', 'updated', {
          executor: [ '_id', 'name', 'avatarUrl' ]
        }
      ]
    },
    excludeFields: ['project', 'isDeleted', 'source', 'subtaskIds', 'type', 'url']
  })
}

SDK.prototype.getTask = getTask

declare module 'teambition-sdk-core/dist/cjs/SDK' {
  // tslint:disable-next-line no-shadowed-variable
  interface SDK {
    getTask: typeof getTask
  }
}