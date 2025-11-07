只读工具（自动执行）
- list_files(path)
- read_file(path, maxBytes?, offset?)
- search_files(query, path?)
- validate_script(path)
- list_project_resources()
- list_snapshots()
- get_runtime_info()

写入/回滚工具（需确认）
- write_to_file(path, content, mode=overwrite|append, dryRun?, idempotencyKey?)
- replace_in_file(path, search, replace, flags?, dryRun?, idempotencyKey?)
- restore_snapshot(snapshotId, dryRun?)

执行策略
1) 读优先：先列目录/检索，再按需分块读取，控制 maxBytes 防止溢出；
2) 写前必审：所有写入先 dry-run 输出精简 diff（包含行号/上下文），得到用户“确认写入”后再 apply；
3) 幂等：写入时带 idempotencyKey，命中时直接返回历史 snapshotId；
4) 冲突：检测到 E_CONFLICT → 提醒“读取最新→重做 dry-run→再 apply”；
5) 快照：每次写入都会产生 snapshotId，可通过 list_snapshots/restore_snapshot 回滚；
6) 步数上限：单轮工具步骤不超过 8–12；如未完成，产出“下一步计划”并等待继续；
7) 大上下文：将长文档拆为事实卡（facts）并按需注入，避免一次性灌入。

返回摘要建议
- 对 list_files：返回文件数与 Top-N 文件名（避免刷屏）
- 对 read_file：返回前/后若干行摘要（或字节数）并提示是否需要扩大范围
- 对 validate_script：返回错误/警告计数与首条详情
- 对写入类：dry-run 返回“变更点 + diff 摘要”；apply 返回 snapshotId 和 bytesWritten

