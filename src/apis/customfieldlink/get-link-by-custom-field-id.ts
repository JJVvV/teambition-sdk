import { Observable } from 'rxjs/Observable'
import { QueryToken } from 'reactivedb'

import { CustomFieldId } from 'teambition-types'
import { CacheStrategy } from '../../Net'
import { CustomFieldLinkSchema } from '../../schemas'
import { SDK } from '../../SDK'

export interface GetCustomFieldDerivedFromLinkOptions {
  req: Observable<CustomFieldLinkSchema> | Observable<CustomFieldLinkSchema[]>
}

export function getLinkByCustomFieldId(
  this: SDK,
  customFieldId: CustomFieldId,
  options: GetCustomFieldDerivedFromLinkOptions
): QueryToken<CustomFieldLinkSchema> {
  const req = options.req

  return this.lift<CustomFieldLinkSchema>({
    tableName: 'CustomFieldLink',
    cacheValidate: CacheStrategy.Request,
    request: req,
    query: {
      where: { _customfieldId: customFieldId }
    }
  })
}

declare module '../../SDK' {
  interface SDK {
    getLinkByCustomFieldId: typeof getLinkByCustomFieldId
  }
}

SDK.prototype.getLinkByCustomFieldId = getLinkByCustomFieldId