# 微信读书 API 接口参考（v1.0.3）

所有接口统一入口：`POST https://i.weread.qq.com/api/agent/gateway`
鉴权：`Authorization: Bearer ${WEREAD_API_KEY}`（EO2Weave 用 `${WEREAD_API_KEY}` 模板，自动注入）
Body：`{"api_name": "<接口>", "skill_version": "1.0.3", ...业务参数平铺}`

---

## 目录

1. [搜索](#1-搜索)
2. [书籍信息](#2-书籍信息)
3. [书架](#3-书架)
4. [阅读统计](#4-阅读统计)
5. [笔记 / 划线](#5-笔记--划线)
6. [热门划线](#6-热门划线)
7. [书评](#7-书评)
8. [推荐 / 发现](#8-推荐--发现)

---

## 1. 搜索

### `/store/search` — 搜索书籍/作者/书单/听书/公众号/文章/全文

通过 `scope` 切换搜索类型（类似微信读书 App 搜索页的 tab）。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `keyword` | string | ✅ | — | 搜索关键词 |
| `scope` | int | ❌ | `10` | 搜索类型：`0`=全部, `10`=电子书, `14`=微信听书, `6`=作者, `12`=全文, `13`=书单, `2`=公众号, `4`=文章 |
| `maxIdx` | int | ❌ | `0` | 翻页偏移 |
| `count` | int | ❌ | 服务端默认(15) | 每页数量 |

**响应字段：** `sid`, `hasMore`, `results`

**工作流：** 这是获取 bookId 的首选方式。用户提到书名时先调此接口，拿到 `bookId` 后再调其他需要 bookId 的接口。

---

## 2. 书籍信息

### `/book/info` — 书籍基本信息

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bookId` | string | ✅ | 书籍 ID |

**响应字段：** `bookId`, `deepLink`, `title`, `author`, `translator`, `cover`, `intro`, `category`, `publisher`, `publishTime`, `isbn`, `wordCount`, `newRating`, `newRatingCount`, `newRatingDetail`

> `newRating` 是 ×10 的评分（如 `85` = 8.5 分）。

### `/book/chapterinfo` — 章节目录

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bookId` | string | ✅ | 书籍 ID |

**响应字段：** `bookId`, `synckey`, `chapterUpdateTime`, `chapters`

> `chapters[].chapterUid` 用于深度链接和热门划线的章节定位。

### `/book/getprogress` — 阅读进度

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bookId` | string | ✅ | 书籍 ID |

**响应字段：** `bookId`, `book`, `timestamp`

---

## 3. 书架

### `/shelf/sync` — 书架列表（含听书/讲书）

**无参数。**

**响应字段：** `books`, `archive`, `albums`, `mp`

**字段说明：**
- `books[]`：电子书数组
- `albums[]`：有声书/讲书专辑数组（**属于书架里的书，统计时必须计入**）
- `mp`：文章收藏（`mp.book` 非空时计 1 条）
- `archive[]`：归档

**书架总数公式：** `books.length + albums.length + (mp 非空 ? 1 : 0)`

**书架条目常用字段：** `bookId`, `title`, `author`, `cover`, `category`, `finishReading`(1=已读完), `secret`(1=私密阅读), `readUpdateTime`, `updateTime`, `deepLink`

---

## 4. 阅读统计

### `/readdata/detail` — 阅读统计数据（周/月/年/总）

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `mode` | string | ❌ | `monthly` | 统计维度：`weekly`=本周, `monthly`=本月, `annually`=本年, `overall`=总计 |
| `baseTime` | int | ❌ | `0` | 基准时间戳（`0`=当前周期，传历史时间戳可查看历史周期） |

**响应字段：** `readTimes`, `readDays`, `totalReadTime`, `dayAverageReadTime`, `compare`, `baseTime`, `readLongest`, `readStat`, `preferCategory`, `preferCategoryWord`, `preferTime`, `preferTimeWord`, `preferAuthor`, `authorCount`, `preferPublisher`, `preferCp`, `readRate`, `wrReadTime`, `wrListenTime`, `rank`, `registTime`, `medals`, `preferBooks`, `recordReadingTime`, `readRecordsWord`, `readDistributionWord`

**字段说明：**
- `readTimes`：**对象**（非数字）。key 是时间桶起始时间戳，value 是该桶内的阅读时长（秒）。桶粒度随 `mode` 变化：`weekly`/`monthly` 按天分桶，`annually` 按月分桶。计算总时长用 `totalReadTime` 而非对 `readTimes` 求和（二者可能因统计口径略有差异）
- `readDays`：阅读天数
- `totalReadTime`：总阅读时长（秒）
- `dayAverageReadTime`：日均阅读时长（秒）
- `compare`：环比变化（浮点数，如 `-0.02` 表示下降 2%）
- `readLongest`：**数组**。读得最久的书 TOP 3，每项含 `book`（书籍信息）、`readTime`（秒）、`tags`（如"单日阅读最久"）
- `readStat`：**数组**。阅读概况汇总，每项 `{stat, counts}`，如 `{stat:"读过",counts:"3本"}`、`{stat:"读完",counts:"0本"}`
- `preferCategory`：**数组**。偏好分类排行，每项含 `categoryTitle`、`readingCount`、`readingTime`（秒）
- `preferCategoryWord`：偏好分类的文字描述（如"偏好阅读历史"）
- `preferAuthor` / `authorCount`：偏好作者及数量
- `preferTime` / `preferTimeWord`：偏好阅读时段
- `wrReadTime` / `wrListenTime`：阅读时长 / 听书时长
- `rank`：读书排行
- `registTime`：注册时间（Unix 时间戳）

---

## 5. 笔记 / 划线

### `/user/notebooks` — 笔记本概览（所有有笔记的书）

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `count` | int | ❌ | `20` | 每页数量 |
| `lastSort` | int | ❌ | — | 翻页游标（上一页最后一条的 `sort` 值） |

**响应字段：** `synckey`, `totalBookCount`, `totalNoteCount`, `noBookReviewCount`, `hasMore`, `books`

> 用于回答"哪些书有笔记""一共多少条笔记"。`books[].noteCount`/`bookmarkCount`/`reviewCount` 分别是该书的想法数/划线数/点评数。

### `/book/bookmarklist` — 用户划线列表

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bookId` | string | ✅ | 书籍 ID |

**响应字段：** `synckey`, `updated`, `removed`, `chapters`, `book`

> `chapters[]` 按章节分组，每个章节下的 `updated[]` 是划线条目，含 `chapterUid`、`range`（"起始-结束"）、`markText`（划线文本）、`style`（颜色）、`createTime`。

### `/review/list/mine` — 个人想法/笔记

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `bookid` | string | ✅ | — | 书籍 ID（注意是小写的 `bookid`） |
| `synckey` | int | ❌ | `0` | 翻页游标 |
| `count` | int | ❌ | `20` | 每页数量 |

**响应字段：** `reviews`, `totalCount`, `hasMore`, `synckey`, `removed`

> ⚠️ 参数名是 **`bookid`（小写 d）**，和其他接口的 `bookId` 不同。

---

## 6. 热门划线

### `/book/bestbookmarks` — 热门划线列表（含文本）

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `bookId` | string | ✅ | — | 书籍 ID |
| `chapterUid` | int | ❌ | `0` | 章节 UID（`0`=全部章节，从 `/book/chapterinfo` 获取） |
| `synckey` | int | ❌ | `0` | 增量同步 key |

**响应字段：** `synckey`, `totalCount`, `items`, `chapters`

> `items[]` 含划线文本 `text`、热度 `score`/`count`、`chapterUid`、`range`。最多返回 20 条，按热度排序。

### `/book/underlines` — 划线热度统计（不含文本）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bookId` | string | ✅ | 书籍 ID |
| `chapterUid` | int | ✅ | 章节 UID（从 `/book/chapterinfo` 获取） |
| `synckey` | int | ❌ | 增量同步 key（默认 `0`） |

**响应字段：** `bookId`, `chapterUid`, `underlines`, `synckey`

> `underlines[]` 只有 `score`/`count`/`type` 等**统计字段，不含划线文本**。要看文本用 `/book/bestbookmarks`。

### `/book/readreviews` — 划线下的想法列表

获取章节中某些划线范围下的想法/评论列表（每个划线最多 20 条）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `bookId` | string | ✅ | 书籍 ID |
| `chapterUid` | int | ✅ | 章节 UID |
| `reviews` | array | ✅ | 要查询的划线范围数组，每项包含 `range`/`maxIdx`/`count`/`synckey` |

**响应字段：** `bookId`, `chapterUid`, `reviews`

> ⚠️ `reviews` 是**唯一允许传入的对象/数组业务字段**（官方明确声明）。用于查看某条热门划线下其他人写的想法。

### `/review/single` — 单条想法/评论详情

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `reviewId` | string | ✅ | — | 想法/评论 ID |
| `commentsCount` | int | ❌ | `10` | 拉取评论数量 |
| `commentsDirection` | int | ❌ | `1` | 评论排序：`0`=倒序, `1`=正序 |
| `likesCount` | int | ❌ | `10` | 拉取点赞数量 |
| `likesDirection` | int | ❌ | `0` | 点赞排序：`0`=倒序 |
| `synckey` | int | ❌ | `0` | 增量同步 key |

**响应字段：** `reviewId`, `review`, `synckey`, `htmlContent`, `bookReviewCount`

---

## 7. 书评

### `/review/list` — 公开点评

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `bookId` | string | ✅ | — | 书籍 ID |
| `reviewListType` | int | ❌ | `0` | 筛选类型：`0`=全部, `1`=推荐, `2`=不行, `3`=最新, `4`=一般 |
| `count` | int | ❌ | `20` | 每页数量 |
| `maxIdx` | int | ❌ | `0` | 翻页偏移 |
| `synckey` | int | ❌ | `0` | 翻页游标 |

**响应字段：** `synckey`, `reviews`, `reviewsHasMore`, `reviewsHas5Star`, `reviewsHas1Star`, `reviewsHasRecent`, `reviewsCnt`, `recentTotalCnt`, `friendCommentCount`, `friendUniqueCount`, `friendCommentUsers`, `deepVRecommendInfo`, `deepVRecommendValue`, `deepVUniqueCount`

---

## 8. 推荐 / 发现

### `/book/recommend` — 个性化推荐（为你推荐）

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `count` | int | ❌ | `12` | 每页数量 |
| `maxIdx` | int | ❌ | `0` | 翻页偏移 |

**响应字段：** `books`

### `/book/similar` — 相似书推荐

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `bookId` | string | ✅ | — | 书籍 ID |
| `count` | int | ❌ | `12` | 每页数量 |
| `maxIdx` | int | ❌ | `0` | 翻页偏移 |
| `sessionId` | string | ❌ | — | 翻页会话 ID（首次不传，后续用回包中的值） |

**响应字段：** `booksimilar`

### `/discover/interact/type3` — 朋友在读动态

获取发现页朋友在读动态，返回书籍卡片，按 `updateTime` 从新到旧排序。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `count` | int | ❌ | `20` | 最终返回数量 |
| `maxIdx` | int | ❌ | — | 翻页游标（传上一页回包的 `nextMaxIdx`） |
| `synckey` | int | ❌ | — | 同步游标（首次不传；后续传上一页回包的 `synckey`） |

**响应字段：** `synckey`, `count`, `hasMore`, `nextMaxIdx`, `items`

---

## 错误处理

| `errcode` | 含义 | 处理方式 |
|-----------|------|----------|
| `0` | 成功 | — |
| `-2012` | 登录超时 | 提示用户检查 `WEREAD_API_KEY` 是否正确配置在 Secret Manager，或去 https://weread.qq.com/r/weread-skills 重新获取 |
| 非 0 | 其他错误 | 展示 `errmsg` 给用户 |

回包含 `upgrade_info` 字段时：说明有新版本 skill，告知用户去官方页面更新，本次结果仍可用。
