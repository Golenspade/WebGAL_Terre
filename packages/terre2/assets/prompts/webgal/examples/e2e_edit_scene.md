端到端示例：在 start.txt 追加开场并验证

目标
- 在 game/scene/start.txt 尾部追加一段 intro 与背景切换

计划（Plan）
- list_files(game/scene) → 定位 start.txt
- read_file(start.txt, 分块) → 确认结尾位置
- 生成脚本片段 → write_to_file(dryRun)
- 等你确认 → apply → validate_script → list_snapshots 回执

候选脚本
changeBg:testBG03.jpg -next;
intro:新的开场白 -hold;

期望回执
- dry-run：diff 摘要（包含插入行范围）
- apply：{"snapshotId":"snap_xxx", "bytesWritten":N}
- validate_script：错误/警告计数

