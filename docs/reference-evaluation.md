# 开源项目参考评估

本项目不直接复制第三方实现或数据。评估日期：2026-07-24。

当前开发环境无法连接 GitHub API，因此最近提交、开放问题和安全公告尚未在线核验；这些项目不能仅凭下表成为新增依赖。ARQ 是本轮唯一新增依赖，采用版本固定为 `0.26.*`，最终发布前必须在可联网环境完成许可证、维护状态和安全公告复核。

| 项目 | Python 3.11/项目适配 | 在线维护与安全核验 | 采用决定 |
| --- | --- | --- | --- |
| apify/crawlee-python | Python 爬虫框架；本项目首版无需浏览器运行时 | 未完成，GitHub API 不可达 | 暂不引入；出现必须执行 JavaScript 的来源时再评估 |
| scrapy/scrapy | 支持 Python 爬虫 Pipeline，但会引入第二套运行时 | 未完成，GitHub API 不可达 | 仅借鉴去重、节流和 Pipeline 设计 |
| python-arq/arq | Python 3.11 容器目标；与现有 Redis/FastAPI 异步栈匹配 | 未完成，GitHub API 不可达；发布前为阻塞核验项 | 条件采用 `0.26.*`，用于抓取任务与 Worker |
| microsoft/playwright-python | Python 3.11 可作为动态页面兜底 | 未完成，GitHub API 不可达 | 首版不引入 |
| SteamDatabase/SteamTracking | 参考 Steam 字段变化与增量更新思路 | 未完成，GitHub API 不可达 | 不复制数据或实现 |
| gaming-research-agent-ai（本地） | 来源元数据、文档化和 RAG 摄取 | 复用其数据流思想 |
| Idea-Journal（本地） | FastAPI 隔离测试和无密钥降级 | 复用其测试策略 |
| 自定义任务编辑器（本地） | React Flow 工作台交互 | 仅用于设计模块 |

`bidmoniter` 未能定位到确定仓库，因此不作为依赖或代码参考。若后续提供准确地址，需先完成同样的许可证、维护性与安全审查。

发布阻塞清单：确认 ARQ 许可证、最新稳定版、Python 3.11 CI、未解决的高危安全公告，并将结论和链接更新到本文件。
