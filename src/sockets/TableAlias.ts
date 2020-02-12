/**
 * 当 websocket 消息中类型字段的内容与目标表名不符，
 * 请在这里添加转换规则。注意：
 * 1. 此处 key 不做单复数转换，如有单复数形式，请同时添加，如：
 *    'ChatMessage' 和 'ChatMessages'。
 * 2. 目标表名对应实际表名，注意查阅 schemas/ 下的表名定义。
 * 3. 如果名字以 s 或 S 结尾，添加到下方列表里。
 *
 * 注：大小写区别，及单复数形式在名字末尾仅相差一个 's' 的情况
 * 已做自动转换，无需在此处添加映射。
 */
export default {
  Work: 'File',
  Works: 'File',
  ChatMessage: 'Activity',
  ChatMessages: 'Activity',
  Activities: 'Activity',
  HomeActivities: 'HomeActivity',
  TaskflowStatus: 'TaskflowStatus', // 会被作为复数形式去除最后的s
  CustomFieldCategories: 'CustomFieldCategory',
  Dependency: 'TaskDependency',
  Dependencies: 'TaskDependency',
  TaskPos: 'TaskPos',
}
// 如添加条目，请配合相关项目调试，并在
// test/sockets/mapToTable.spec.ts 添加相应测试。
