任务模板

1) 在某场景追加一段开场（背景+对话）
- 计划：read_file(scene)→定位插入点→生成脚本片段→dry-run
- 候选脚本（示例）：
  changeBg:testBG03.jpg -next;
  intro:新的开场白 -hold;
- 写入前：展示 diff 摘要与插入行号

2) 替换 BGM 并淡入
- 计划：search_files('bgm')→确认文件存在→dry-run
- 示例：bgm:school/morning.mp3 -enter=1500;

3) 引入立绘并设置位置/ID
- 示例：changeFigure:testFigure03.png -left -id=hero -next;

4) 脚本校验
- 调用 validate_script: 返回错误/警告计数（首条错误详情）

5) 批量检索场景标签
- search_files('label:start', 'game/scene') → 列表摘要

注意：所有写入均先 dry-run；确认后 apply 并回执 snapshotId。

